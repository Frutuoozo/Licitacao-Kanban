import express from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import db, { withTransaction } from '../db.js';
import { getIO } from '../socket.js';
import { requireEditorOrAdmin } from '../middleware/editor.js';
import { ClientError } from '../errors.js';
import { isAllowedStatus, isPastDate, MAX_LENGTHS, missingDemandField, normalizeText, sanitizeProcessDoc, validateProcessPayload } from '../validation.js';

const PAST_DUE_MESSAGE = 'A data de vencimento não pode estar no passado.';

const router = express.Router();
const processWriteLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas alterações em pouco tempo. Aguarde alguns minutos e tente novamente.' },
  keyGenerator: (req) => req.userId || ipKeyGenerator(req.ip),
});

// Grava os itens (documentos/fases) de um processo, na ordem recebida.
function insertItems(conn, processId, docs) {
  if (!docs || docs.length === 0) return null;
  const values = docs.map((doc, index) => [doc.id, processId, doc.type, doc.name, doc.done || false, doc.bgColor || null, index]);
  return conn.query('INSERT INTO process_items (id, process_id, type, name, is_done, bg_color, order_index) VALUES ?', [values]);
}

// GET all processes (active and archived)
router.get('/', async (req, res) => {
  try {
    const [processes] = await db.query(
      'SELECT id, title, processNumber, setor, type, typeColor, status, due_date, created_at, updated_at, archived_at, started_at, notes, priority FROM processes'
    );
    const [items] = await db.query('SELECT id, process_id, type, name, is_done, bg_color FROM process_items ORDER BY order_index ASC');
    
    // Group items by process_id
    const itemsByProcess = {};
    items.forEach(item => {
      if (!itemsByProcess[item.process_id]) {
        itemsByProcess[item.process_id] = [];
      }
      itemsByProcess[item.process_id].push({
        id: item.id,
        type: item.type,
        name: item.name,
        done: !!item.is_done,
        bgColor: item.bg_color
      });
    });

    const result = processes.map(p => ({
      id: p.id,
      title: p.title,
      processNumber: p.processNumber,
      setor: p.setor,
      type: p.type,
      typeColor: p.typeColor,
      status: p.status,
      dueDate: p.due_date
        ? (typeof p.due_date === 'string'
            ? p.due_date.slice(0, 10)
            : `${p.due_date.getFullYear()}-${String(p.due_date.getMonth()+1).padStart(2,'0')}-${String(p.due_date.getDate()).padStart(2,'0')}`)
        : null,
      createdAt: p.created_at || null,
      // Data em que foi arquivado (concluído). Arquivados antes da coluna existir usam a última atualização.
      archivedAt: p.status === 'archived' ? (p.archived_at || p.updated_at || null) : null,
      startedAt: p.status === 'pending' ? null : (p.started_at || p.created_at || null),
      notes: p.notes ?? null,
      priority: p.priority,
      docs: itemsByProcess[p.id] || []
    }));

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch processes' });
  }
});

// POST a new process (demanda pendente ou já iniciada)
router.post('/', requireEditorOrAdmin, processWriteLimiter, async (req, res) => {
  const { id } = req.body;
  const validated = validateProcessPayload(req.body);
  if (typeof validated === 'string') {
    return res.status(400).json({ error: validated });
  }
  const { title, processNumber, setor, type, typeColor, docs, status, dueDate, notes, priority = 'routine' } = validated.data;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'ID obrigatório' });
  }
  if (status === 'archived') return res.status(400).json({ error: 'Situação inválida.' });
  const missing = missingDemandField(validated.data);
  if (missing) return res.status(400).json({ error: missing });
  if (isPastDate(dueDate)) return res.status(400).json({ error: PAST_DUE_MESSAGE });

  const createdAt = new Date();
  const startedAt = status === 'active' ? createdAt : null;
  try {
    await withTransaction(async (conn) => {
      await conn.query(
        `INSERT INTO processes (id, title, processNumber, setor, type, typeColor, status, due_date, started_at, notes, priority)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, title, processNumber, setor || null, type, typeColor, status, dueDate, startedAt, notes ?? null, priority]
      );
      await insertItems(conn, id, docs);
    });
    getIO()?.emit('process:added', { id, title, processNumber, setor: setor || null, type, typeColor, status, dueDate, notes: notes ?? null, priority, createdAt, startedAt, docs: docs || [] });
    res.status(201).json({ success: true, createdAt, startedAt });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create process' });
  }
});

// PUT to update a process. A situação não muda por aqui: vem do banco e define o que é obrigatório.
router.put('/:id', requireEditorOrAdmin, processWriteLimiter, async (req, res) => {
  const { id } = req.params;
  try {
    const saved = await withTransaction(async (conn) => {
      const [[current]] = await conn.query("SELECT status, notes, priority, DATE_FORMAT(due_date, '%Y-%m-%d') AS due FROM processes WHERE id = ? FOR UPDATE", [id]);
      if (!current) throw new ClientError('Processo não encontrado.', 404);
      const isPending = current.status === 'pending';
      const validated = validateProcessPayload({ ...req.body, status: isPending ? 'pending' : 'active', dueDate: req.body.dueDate ?? null });
      if (typeof validated === 'string') throw new ClientError(validated);
      const missing = isPending && missingDemandField(validated.data);
      if (missing) throw new ClientError(missing);
      const { title, processNumber, setor, dueDate, type, typeColor, docs, notes, priority = current.priority } = validated.data;
      // Pendente que venceu com o tempo continua editável; só não pode receber uma data passada nova.
      if (isPending && dueDate !== current.due && isPastDate(dueDate)) throw new ClientError(PAST_DUE_MESSAGE);
      const nextNotes = notes === undefined ? current.notes : notes;
      await conn.query(
        `UPDATE processes SET title = ?, processNumber = ?, setor = ?, type = ?, typeColor = ?, due_date = ?, notes = ?, priority = ? WHERE id = ?`,
        [title, processNumber, setor || null, type ?? null, typeColor ?? null, dueDate ?? null, nextNotes, priority, id]
      );
      await conn.query('DELETE FROM process_items WHERE process_id = ?', [id]);
      await insertItems(conn, id, docs);
      return { id, title, processNumber, setor: setor || null, dueDate, type: type ?? null, typeColor: typeColor ?? null, notes: nextNotes, priority, docs: docs || [] };
    });
    getIO()?.emit('process:updated', saved);
    res.json({ success: true });
  } catch (error) {
    if (error instanceof ClientError) return res.status(error.status).json({ error: error.message });
    console.error(error);
    res.status(500).json({ error: 'Failed to update process' });
  }
});

// PUT para iniciar uma demanda pendente: exige gestor (o informado ou o que ela já tem).
router.put('/:id/start', requireEditorOrAdmin, processWriteLimiter, async (req, res) => {
  const { id } = req.params;
  const informed = normalizeText(req.body?.setor);
  if (informed.length > MAX_LENGTHS.setor) return res.status(400).json({ error: 'Nome do gestor muito longo.' });
  try {
    const started = await withTransaction(async (conn) => {
      const [[current]] = await conn.query('SELECT status, setor FROM processes WHERE id = ? FOR UPDATE', [id]);
      if (!current) throw new ClientError('Demanda não encontrada.', 404);
      if (current.status !== 'pending') throw new ClientError('Esta demanda já foi iniciada.', 409);
      const setor = informed || normalizeText(current.setor);
      if (!setor) throw new ClientError('Informe o gestor principal.');
      const startedAt = new Date();
      await conn.query(`UPDATE processes SET status = 'active', setor = ?, started_at = ? WHERE id = ?`, [setor, startedAt, id]);
      return { id, setor, startedAt };
    });
    getIO()?.emit('process:started', started);
    res.json({ success: true, ...started });
  } catch (error) {
    if (error instanceof ClientError) return res.status(error.status).json({ error: error.message });
    console.error(error);
    res.status(500).json({ error: 'Failed to start process' });
  }
});

// DELETE a process
router.delete('/:id', requireEditorOrAdmin, processWriteLimiter, async (req, res) => {
  const { id } = req.params;
  try {
    await db.query(`DELETE FROM processes WHERE id = ?`, [id]);
    getIO()?.emit('process:deleted', { id });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete process' });
  }
});

// PUT to update process status (active/archived)
router.put('/:id/status', requireEditorOrAdmin, processWriteLimiter, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!isAllowedStatus(status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }
  try {
    // Arquivar registra quando o processo foi concluído (mantém a data se já estava arquivado); desarquivar limpa.
    // Demanda pendente fica de fora: ela só vira processo pela rota de iniciar, que exige gestor.
    const [result] = await db.query(
      `UPDATE processes SET status = ?, archived_at = IF(? = 'archived', COALESCE(archived_at, NOW()), NULL) WHERE id = ? AND status <> 'pending'`,
      [status, status, id]
    );
    if (result.affectedRows === 0) {
      const [[exists]] = await db.query('SELECT id FROM processes WHERE id = ?', [id]);
      return exists
        ? res.status(409).json({ error: 'Inicie a demanda antes de mudar a situação dela.' })
        : res.status(404).json({ error: 'Processo não encontrado.' });
    }
    getIO()?.emit('process:status_changed', { id, status });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update process status' });
  }
});

// PUT to update process items
router.put('/:id/items', requireEditorOrAdmin, processWriteLimiter, async (req, res) => {
  const { id } = req.params;
  const { docs } = req.body;
  const safeDocs = Array.isArray(docs) ? docs.map(sanitizeProcessDoc).filter(Boolean) : [];
  
  try {
    await withTransaction(async (conn) => {
      await conn.query('DELETE FROM process_items WHERE process_id = ?', [id]);
      await insertItems(conn, id, safeDocs);
    });
    getIO()?.emit('process:items_updated', { id, docs: safeDocs });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update process items' });
  }
});

export default router;
