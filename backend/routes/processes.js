import express from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import db from '../db.js';
import { getIO } from '../socket.js';
import { requireEditorOrAdmin } from '../middleware/editor.js';
import { isAllowedStatus, sanitizeProcessDoc, validateProcessPayload } from '../validation.js';

const router = express.Router();
const processWriteLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas alterações em pouco tempo. Aguarde alguns minutos e tente novamente.' },
  keyGenerator: (req) => req.userId || ipKeyGenerator(req.ip),
});

// GET all processes (active and archived)
router.get('/', async (req, res) => {
  try {
    const [processes] = await db.query('SELECT * FROM processes');
    const [items] = await db.query('SELECT * FROM process_items ORDER BY order_index ASC');
    
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
      // Não há coluna própria de conclusão: a última atualização de um arquivado é a melhor aproximação.
      archivedAt: p.status === 'archived' ? (p.updated_at || null) : null,
      docs: itemsByProcess[p.id] || []
    }));

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch processes' });
  }
});

// POST a new process
router.post('/', requireEditorOrAdmin, processWriteLimiter, async (req, res) => {
  const { id } = req.body;
  const validated = validateProcessPayload(req.body);
  if (typeof validated === 'string') {
    return res.status(400).json({ error: validated });
  }
  const { title, processNumber, setor, type, typeColor, docs, status, dueDate } = validated.data;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'ID obrigatório' });
  }
  
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    
    await connection.query(
      `INSERT INTO processes (id, title, processNumber, setor, type, typeColor, status, due_date) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, title, processNumber, setor, type, typeColor, status, dueDate]
    );

    if (docs && docs.length > 0) {
      const values = docs.map((doc, index) => [
        doc.id, id, doc.type, doc.name, doc.done || false, doc.bgColor || null, index
      ]);
      await connection.query(
        `INSERT INTO process_items (id, process_id, type, name, is_done, bg_color, order_index) 
         VALUES ?`,
        [values]
      );
    }
    
    await connection.commit();
    getIO()?.emit('process:added', { id, title, processNumber, setor, type, typeColor, status, dueDate, docs: docs || [] });
    res.status(201).json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ error: 'Failed to create process' });
  } finally {
    connection.release();
  }
});

// PUT to update a process (except items)
router.put('/:id', requireEditorOrAdmin, processWriteLimiter, async (req, res) => {
  const { id } = req.params;
  const validated = validateProcessPayload({ ...req.body, status: 'active', dueDate: req.body.dueDate ?? null });
  if (typeof validated === 'string') {
    return res.status(400).json({ error: validated });
  }
  const { title, processNumber, setor, dueDate, type, typeColor, docs } = validated.data;
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    await connection.query(
      `UPDATE processes SET title = ?, processNumber = ?, setor = ?, type = ?, typeColor = ?, due_date = ? WHERE id = ?`,
      [title, processNumber, setor, type ?? null, typeColor ?? null, dueDate ?? null, id]
    );

    await connection.query(`DELETE FROM process_items WHERE process_id = ?`, [id]);
    if (docs && docs.length > 0) {
      const values = docs.map((doc, index) => [
        doc.id, id, doc.type, doc.name, doc.done || false, doc.bgColor || null, index
      ]);
      await connection.query(
        `INSERT INTO process_items (id, process_id, type, name, is_done, bg_color, order_index) VALUES ?`,
        [values]
      );
    }

    await connection.commit();
    getIO()?.emit('process:updated', { id, title, processNumber, setor, dueDate, type: type ?? null, typeColor: typeColor ?? null, docs: docs || [] });
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ error: 'Failed to update process' });
  } finally {
    connection.release();
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
    await db.query(`UPDATE processes SET status = ? WHERE id = ?`, [status, id]);
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
  
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    
    await connection.query(`DELETE FROM process_items WHERE process_id = ?`, [id]);

    if (safeDocs.length > 0) {
      const values = safeDocs.map((doc, index) => [
        doc.id, id, doc.type, doc.name, doc.done || false, doc.bgColor || null, index
      ]);
      await connection.query(
        `INSERT INTO process_items (id, process_id, type, name, is_done, bg_color, order_index) 
         VALUES ?`,
        [values]
      );
    }
    
    await connection.commit();
    getIO()?.emit('process:items_updated', { id, docs: safeDocs });
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ error: 'Failed to update process items' });
  } finally {
    connection.release();
  }
});

export default router;
