import crypto from 'crypto';
import express from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import db, { withTransaction } from '../db.js';
import { requireEditorOrAdmin } from '../middleware/editor.js';
import { getIO } from '../socket.js';
import { ClientError, sendError } from '../errors.js';
import { isoToday, isValidDateString, normalizeText, validateContractPayload } from '../validation.js';
import { createRouter } from '../asyncRouter.js';

const router = createRouter();

// Regras de vigência: além do termo de contrato, até 4 aditivos; depois disso, nova contratação.
// Contratos vencidos também aceitam aditivo (ex.: cadastro de contratos antigos já vencidos),
// desde que não tenham sido encerrados manualmente.
const MAX_AMENDMENTS = 4;
const NOTES_MAX = 500;
// Anexos: PDF ou imagem, até 15 MB (o PDF é exibido direto no navegador).
const DOCUMENT_TYPES = ['application/pdf', 'image/png', 'image/jpeg'];
const DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;

const contractWriteLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas alterações em pouco tempo. Aguarde alguns minutos e tente novamente.' },
  keyGenerator: (req) => req.userId || ipKeyGenerator(req.ip),
});

function formatDate(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

// Dia de hoje em Teresina (o servidor roda em UTC: às 21h de lá, o dia do Node já seria o seguinte).
const todayIso = () => isoToday();

function serializeContract(row) {
  return {
    id: row.id,
    processName: row.process_name,
    objectDescription: row.object_description,
    processNumber: row.process_number,
    contractValue: Number(row.contract_value),
    valueVariable: Boolean(row.value_variable),
    dueDate: formatDate(row.due_date),
    fiscalEffective: row.fiscal_effective,
    fiscalSubstitute: row.fiscal_substitute || '',
    modality: row.modality,
    lawType: row.law_type,
    closedAt: formatDate(row.closed_at),
    closedReason: row.closed_reason || '',
    amendmentCount: Number(row.amendment_count) || 0,
    documentCount: Number(row.document_count) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeEvent(row) {
  let changes = row.changes;
  if (typeof changes === 'string') {
    try { changes = JSON.parse(changes); } catch { changes = null; }
  }
  return {
    id: row.id,
    type: row.type,
    eventDate: formatDate(row.event_date),
    amendmentNumber: row.amendment_number,
    previousDueDate: formatDate(row.previous_due_date),
    newDueDate: formatDate(row.new_due_date),
    previousValue: row.previous_value === null ? null : Number(row.previous_value),
    newValue: row.new_value === null ? null : Number(row.new_value),
    previousValueVariable: Boolean(row.previous_value_variable),
    newValueVariable: Boolean(row.new_value_variable),
    notes: row.notes || '',
    changes: Array.isArray(changes) ? changes : [],
    userName: row.user_name || '',
    createdAt: row.created_at,
  };
}

const contractSelect = `
  SELECT c.id, c.process_name, c.object_description, c.process_number, c.contract_value, c.value_variable,
         c.due_date, c.fiscal_effective, c.fiscal_substitute, c.modality, c.law_type,
         c.closed_at, c.closed_reason, c.created_at, c.updated_at,
         (SELECT COUNT(*) FROM contract_events e WHERE e.contract_id = c.id AND e.type = 'amendment') AS amendment_count,
         (SELECT COUNT(*) FROM contract_documents d WHERE d.contract_id = c.id) AS document_count
  FROM contracts c
`;

async function fetchContract(conn, id) {
  const [rows] = await conn.query(`${contractSelect} WHERE c.id = ?`, [id]);
  return rows[0] ? serializeContract(rows[0]) : null;
}

// Lê o contrato travando a linha até o fim da transação. Duas alterações ao mesmo tempo no mesmo contrato
// passam a esperar uma pela outra, e a segunda já vê o que a primeira gravou (número do aditivo, limite,
// encerramento). Sem a trava, as duas liam a mesma situação e as duas gravavam.
async function lockContract(conn, id) {
  await conn.query('SELECT id FROM contracts WHERE id = ? FOR UPDATE', [id]);
  return fetchContract(conn, id);
}

async function logEvent(conn, req, contractId, event) {
  const [result] = await conn.query(
    `INSERT INTO contract_events
     (contract_id, type, event_date, amendment_number, previous_due_date, new_due_date,
      previous_value, new_value, previous_value_variable, new_value_variable, notes, changes, user_id, user_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [contractId, event.type, event.eventDate || todayIso(), event.amendmentNumber ?? null,
      event.previousDueDate ?? null, event.newDueDate ?? null, event.previousValue ?? null, event.newValue ?? null,
      event.previousValueVariable ?? null, event.newValueVariable ?? null,
      event.notes || null, event.changes ? JSON.stringify(event.changes) : null, req.userId || null, req.userName || null]
  );
  return result.insertId;
}


// Executa `work` numa transação; devolve o contrato atualizado e avisa os clientes conectados.
async function inTransaction(res, work, { status = 200, socketEvent = 'contract:updated', failMessage }) {
  try {
    const result = await withTransaction(async (conn) => {
      const outcome = await work(conn);
      // Recusa de regra de negócio (ex.: contrato não encontrado): desfaz tudo e a mensagem vai para o usuário.
      if (outcome?.error) throw new ClientError(outcome.error, outcome.status || 400);
      return outcome;
    });
    getIO()?.emit(socketEvent, result.contract);
    // `extra`: dados só para quem fez a ação (ex.: id do aditivo criado, para anexar o termo em seguida).
    return res.status(status).json(result.extra ? { ...result.contract, ...result.extra } : result.contract);
  } catch (error) {
    return sendError(res, error, failMessage);
  }
}

const EDIT_LABELS = {
  processName: 'Nome do processo',
  objectDescription: 'Objeto',
  processNumber: 'Nº do processo',
  contractValue: 'Valor do contrato',
  valueVariable: 'Valor variável',
  dueDate: 'Vencimento',
  fiscalEffective: 'Fiscal efetivo',
  fiscalSubstitute: 'Fiscal substituto',
  modality: 'Modalidade',
  lawType: 'Lei aplicável',
};

// Todos os usuários autenticados podem visualizar os contratos.
router.get('/', async (_req, res) => {
  try {
    const [rows] = await db.query(`${contractSelect} ORDER BY c.due_date ASC, c.process_name ASC`);
    return res.json(rows.map(serializeContract));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Falha ao listar contratos' });
  }
});

router.get('/:id/history', async (req, res) => {
  try {
    const [rows] = await db.query(
      // Anexos de documentos não aparecem no histórico (registros antigos desse tipo ficam ocultos).
      `SELECT id, type, event_date, amendment_number, previous_due_date, new_due_date, previous_value, new_value,
              previous_value_variable, new_value_variable, notes, changes, user_name, created_at
       FROM contract_events WHERE contract_id = ? AND type <> 'document' ORDER BY created_at ASC, id ASC`,
      [req.params.id]
    );
    return res.json(rows.map(serializeEvent));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Falha ao carregar o histórico do contrato' });
  }
});

router.post('/', requireEditorOrAdmin, contractWriteLimiter, (req, res) => {
  const validated = validateContractPayload(req.body);
  if (typeof validated === 'string') return res.status(400).json({ error: validated });

  const id = crypto.randomUUID();
  const c = validated.data;
  return inTransaction(res, async (conn) => {
    await conn.query(
      `INSERT INTO contracts
       (id, process_name, object_description, process_number, contract_value, value_variable, due_date,
        fiscal_effective, fiscal_substitute, modality, law_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, c.processName, c.objectDescription, c.processNumber, c.contractValue, c.valueVariable ? 1 : 0, c.dueDate,
        c.fiscalEffective, c.fiscalSubstitute, c.modality, c.lawType]
    );
    await logEvent(conn, req, id, {
      type: 'created', newDueDate: c.dueDate, newValue: c.contractValue, newValueVariable: c.valueVariable ? 1 : 0, notes: 'Termo de contrato',
    });
    return { contract: await fetchContract(conn, id) };
  }, { status: 201, socketEvent: 'contract:added', failMessage: 'Falha ao cadastrar contrato' });
});

router.put('/:id', requireEditorOrAdmin, contractWriteLimiter, (req, res) => {
  const validated = validateContractPayload(req.body);
  if (typeof validated === 'string') return res.status(400).json({ error: validated });

  const c = validated.data;
  return inTransaction(res, async (conn) => {
    const current = await lockContract(conn, req.params.id);
    if (!current) return { status: 404, error: 'Contrato não encontrado' };

    // Com valor variável, o número guardado não é exibido: mantém o último valor informado.
    if (c.valueVariable) c.contractValue = current.contractValue.toFixed(2);
    const next = { ...c, contractValue: Number(c.contractValue), fiscalSubstitute: c.fiscalSubstitute || '' };
    const changes = Object.keys(EDIT_LABELS)
      .filter((field) => !(field === 'contractValue' && next.valueVariable))
      .filter((field) => String(current[field] ?? '') !== String(next[field] ?? ''))
      .map((field) => ({ field, label: EDIT_LABELS[field], from: current[field] ?? '', to: next[field] ?? '' }));

    await conn.query(
      `UPDATE contracts
       SET process_name = ?, object_description = ?, process_number = ?, contract_value = ?, value_variable = ?,
           due_date = ?, fiscal_effective = ?, fiscal_substitute = ?, modality = ?, law_type = ?
       WHERE id = ?`,
      [c.processName, c.objectDescription, c.processNumber, c.contractValue, c.valueVariable ? 1 : 0, c.dueDate,
        c.fiscalEffective, c.fiscalSubstitute, c.modality, c.lawType, req.params.id]
    );
    if (changes.length > 0) await logEvent(conn, req, req.params.id, { type: 'edited', changes });
    return { contract: await fetchContract(conn, req.params.id) };
  }, { failMessage: 'Falha ao atualizar contrato' });
});

// Aditivo: prorroga a vigência (nova data obrigatória) e, opcionalmente, altera o valor.
router.post('/:id/amendments', requireEditorOrAdmin, contractWriteLimiter, (req, res) => {
  // Valor: "variável" (sem valor definido), um novo número, ou nada (mantém o último valor informado).
  const newDueDate = normalizeText(req.body?.newDueDate);
  const valueVariable = req.body?.valueVariable === true;
  const rawValue = req.body?.newValue;
  const hasNewValue = !valueVariable && rawValue !== null && rawValue !== undefined && rawValue !== '';
  const newValue = Number(rawValue);
  const notes = normalizeText(req.body?.notes);
  if (!isValidDateString(newDueDate)) return res.status(400).json({ error: 'Informe a nova data de vencimento.' });
  if (hasNewValue && (!Number.isFinite(newValue) || newValue < 0 || newValue > 9999999999999.99)) {
    return res.status(400).json({ error: 'Informe um novo valor válido.' });
  }
  if (notes.length > NOTES_MAX) return res.status(400).json({ error: 'Observação muito longa.' });

  return inTransaction(res, async (conn) => {
    const current = await lockContract(conn, req.params.id);
    if (!current) return { status: 404, error: 'Contrato não encontrado' };
    if (current.closedAt) return { status: 409, error: 'Contrato encerrado manualmente. Reabra o contrato antes de lançar um aditivo.' };
    if (current.amendmentCount >= MAX_AMENDMENTS) {
      return { status: 409, error: `Limite de ${MAX_AMENDMENTS} aditivos atingido. É necessária uma nova contratação.` };
    }
    if (newDueDate <= current.dueDate) return { error: 'A nova data de vencimento precisa ser posterior ao vencimento atual.' };

    const value = hasNewValue ? newValue.toFixed(2) : current.contractValue.toFixed(2);
    const variable = valueVariable ? true : hasNewValue ? false : current.valueVariable;
    await conn.query('UPDATE contracts SET due_date = ?, contract_value = ?, value_variable = ? WHERE id = ?',
      [newDueDate, value, variable ? 1 : 0, req.params.id]);
    const amendmentEventId = await logEvent(conn, req, req.params.id, {
      type: 'amendment',
      amendmentNumber: current.amendmentCount + 1,
      previousDueDate: current.dueDate,
      newDueDate,
      previousValue: current.contractValue,
      newValue: value,
      previousValueVariable: current.valueVariable ? 1 : 0,
      newValueVariable: variable ? 1 : 0,
      notes,
    });
    return { contract: await fetchContract(conn, req.params.id), extra: { amendmentEventId } };
  }, { failMessage: 'Falha ao registrar aditivo' });
});

router.post('/:id/close', requireEditorOrAdmin, contractWriteLimiter, (req, res) => {
  const closedAt = normalizeText(req.body?.closedAt) || todayIso();
  const reason = normalizeText(req.body?.reason);
  if (!isValidDateString(closedAt)) return res.status(400).json({ error: 'Data de encerramento inválida.' });
  if (reason.length > NOTES_MAX) return res.status(400).json({ error: 'Motivo muito longo.' });

  return inTransaction(res, async (conn) => {
    const current = await lockContract(conn, req.params.id);
    if (!current) return { status: 404, error: 'Contrato não encontrado' };
    if (current.closedAt) return { status: 409, error: 'Este contrato já está encerrado.' };
    await conn.query('UPDATE contracts SET closed_at = ?, closed_reason = ? WHERE id = ?', [closedAt, reason || null, req.params.id]);
    await logEvent(conn, req, req.params.id, { type: 'closed', eventDate: closedAt, notes: reason });
    return { contract: await fetchContract(conn, req.params.id) };
  }, { failMessage: 'Falha ao encerrar contrato' });
});

router.post('/:id/reopen', requireEditorOrAdmin, contractWriteLimiter, (req, res) => {
  const reason = normalizeText(req.body?.reason);
  if (reason.length > NOTES_MAX) return res.status(400).json({ error: 'Motivo muito longo.' });

  return inTransaction(res, async (conn) => {
    const current = await lockContract(conn, req.params.id);
    if (!current) return { status: 404, error: 'Contrato não encontrado' };
    if (!current.closedAt) return { status: 409, error: 'Este contrato não foi encerrado manualmente.' };
    await conn.query('UPDATE contracts SET closed_at = NULL, closed_reason = NULL WHERE id = ?', [req.params.id]);
    await logEvent(conn, req, req.params.id, { type: 'reopened', notes: reason });
    return { contract: await fetchContract(conn, req.params.id) };
  }, { failMessage: 'Falha ao reabrir contrato' });
});

// ── Documentos (termo de contrato / termo de aditivo) ──

function serializeDocument(row) {
  return {
    id: row.id,
    kind: row.kind,
    eventId: row.event_id,
    amendmentNumber: row.amendment_number ?? null,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    userName: row.user_name || '',
    createdAt: row.created_at,
  };
}

const documentSelect = `
  SELECT d.id, d.kind, d.event_id, d.file_name, d.mime_type, d.size_bytes, d.user_name, d.created_at,
         e.amendment_number
  FROM contract_documents d
  LEFT JOIN contract_events e ON e.id = d.event_id
`;

router.get('/:id/documents', async (req, res) => {
  try {
    const [rows] = await db.query(
      `${documentSelect} WHERE d.contract_id = ? ORDER BY d.kind = 'term' DESC, e.amendment_number ASC, d.created_at ASC`,
      [req.params.id]
    );
    return res.json(rows.map(serializeDocument));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Falha ao listar documentos' });
  }
});

router.get('/:id/documents/:docId/file', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT file_name, mime_type, data FROM contract_documents WHERE id = ? AND contract_id = ?',
      [req.params.docId, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Documento não encontrado' });
    const { file_name: fileName, mime_type: mimeType, data } = rows[0];
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.send(data);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Falha ao abrir documento' });
  }
});

// Envio do arquivo como corpo bruto (sem dependência extra de upload). Metadados em cabeçalhos:
// X-Document-Kind: term | amendment · X-Event-Id: id do aditivo no histórico · X-File-Name: nome codificado.
// Cada contrato tem um termo e cada aditivo um termo: um novo envio substitui o anterior.
router.post(
  '/:id/documents',
  requireEditorOrAdmin,
  contractWriteLimiter,
  express.raw({ type: DOCUMENT_TYPES, limit: DOCUMENT_MAX_BYTES }),
  (req, res) => {
    const kind = req.get('X-Document-Kind');
    const eventId = kind === 'amendment' ? Number(req.get('X-Event-Id')) : null;
    const mimeType = (req.get('Content-Type') || '').split(';')[0].trim();
    let fileName = '';
    try { fileName = decodeURIComponent(req.get('X-File-Name') || ''); } catch { fileName = ''; }
    fileName = normalizeText(fileName).slice(0, 255) || (mimeType === 'application/pdf' ? 'documento.pdf' : 'documento');

    if (!['term', 'amendment'].includes(kind)) return res.status(400).json({ error: 'Tipo de documento inválido.' });
    if (kind === 'amendment' && !Number.isInteger(eventId)) return res.status(400).json({ error: 'Aditivo não informado.' });
    if (!DOCUMENT_TYPES.includes(mimeType)) return res.status(415).json({ error: 'Envie um arquivo PDF, PNG ou JPG.' });
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: 'Arquivo vazio.' });

    return inTransaction(res, async (conn) => {
      const current = await lockContract(conn, req.params.id);
      if (!current) return { status: 404, error: 'Contrato não encontrado' };
      if (kind === 'amendment') {
        const [events] = await conn.query(
          "SELECT id FROM contract_events WHERE id = ? AND contract_id = ? AND type = 'amendment'",
          [eventId, req.params.id]
        );
        if (!events[0]) return { status: 404, error: 'Aditivo não encontrado.' };
      }
      const [previous] = await conn.query(
        'SELECT id FROM contract_documents WHERE contract_id = ? AND kind = ? AND (event_id <=> ?)',
        [req.params.id, kind, eventId]
      );
      if (previous.length) await conn.query('DELETE FROM contract_documents WHERE id IN (?)', [previous.map((row) => row.id)]);
      await conn.query(
        `INSERT INTO contract_documents (contract_id, event_id, kind, file_name, mime_type, size_bytes, data, user_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.params.id, eventId, kind, fileName, mimeType, req.body.length, req.body, req.userName || null]
      );
      return { contract: await fetchContract(conn, req.params.id) };
    }, { status: 201, failMessage: 'Falha ao anexar documento' });
  }
);

router.delete('/:id/documents/:docId', requireEditorOrAdmin, contractWriteLimiter, (req, res) => inTransaction(res, async (conn) => {
  const [rows] = await conn.query(`${documentSelect} WHERE d.id = ? AND d.contract_id = ?`, [req.params.docId, req.params.id]);
  if (!rows[0]) return { status: 404, error: 'Documento não encontrado' };
  const doc = serializeDocument(rows[0]);
  await conn.query('DELETE FROM contract_documents WHERE id = ?', [doc.id]);
  return { contract: await fetchContract(conn, req.params.id) };
}, { failMessage: 'Falha ao remover documento' }));

// Contrato, histórico e anexos saem juntos: se uma parte falhar, nada é apagado.
router.delete('/:id', requireEditorOrAdmin, contractWriteLimiter, async (req, res) => {
  try {
    const deleted = await withTransaction(async (conn) => {
      const [result] = await conn.query('DELETE FROM contracts WHERE id = ?', [req.params.id]);
      if (result.affectedRows === 0) return false;
      await conn.query('DELETE FROM contract_events WHERE contract_id = ?', [req.params.id]);
      await conn.query('DELETE FROM contract_documents WHERE contract_id = ?', [req.params.id]);
      return true;
    });
    if (!deleted) return res.status(404).json({ error: 'Contrato não encontrado' });
    getIO()?.emit('contract:deleted', { id: req.params.id });
    return res.json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Falha ao excluir contrato' });
  }
});

export default router;
