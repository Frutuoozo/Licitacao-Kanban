import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import db from '../db.js';
import { requireAdmin } from '../middleware/admin.js';
import { isNonEmptyString, MAX_LENGTHS, normalizeText } from '../validation.js';
import { createRouter } from '../asyncRouter.js';

// Modalidades de contrato (Dispensa Eletrônica, Pregão Eletrônico...) — independentes dos modelos de processo.
const router = createRouter();
const modalityWriteLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas ações em modalidades. Aguarde alguns minutos e tente novamente.' },
  keyGenerator: (req) => req.userId || ipKeyGenerator(req.ip),
});

const listAll = async () => {
  const [rows] = await db.query('SELECT id, name FROM contract_modalities ORDER BY name ASC');
  return rows;
};

// GET /api/contract-modalities — qualquer usuário autenticado
router.get('/', async (req, res) => {
  try {
    res.json(await listAll());
  } catch (err) {
    res.status(500).json({ error: 'Falha ao listar modalidades' });
  }
});

// POST /api/contract-modalities — apenas admin
router.post('/', requireAdmin, modalityWriteLimiter, async (req, res) => {
  const { name } = req.body;
  if (!isNonEmptyString(name, MAX_LENGTHS.type)) return res.status(400).json({ error: 'Nome obrigatório' });
  try {
    await db.query('INSERT INTO contract_modalities (name) VALUES (?)', [normalizeText(name)]);
    res.json(await listAll());
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Modalidade já existe' });
    res.status(500).json({ error: 'Falha ao criar modalidade' });
  }
});

// PUT /api/contract-modalities/:id — apenas admin
router.put('/:id', requireAdmin, modalityWriteLimiter, async (req, res) => {
  const { name } = req.body;
  if (!isNonEmptyString(name, MAX_LENGTHS.type)) return res.status(400).json({ error: 'Nome obrigatório' });
  try {
    const [result] = await db.query('UPDATE contract_modalities SET name = ? WHERE id = ?', [normalizeText(name), req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Modalidade não encontrada' });
    res.json(await listAll());
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Modalidade já existe' });
    res.status(500).json({ error: 'Falha ao atualizar modalidade' });
  }
});

// DELETE /api/contract-modalities/:id — apenas admin
router.delete('/:id', requireAdmin, modalityWriteLimiter, async (req, res) => {
  try {
    await db.query('DELETE FROM contract_modalities WHERE id = ?', [req.params.id]);
    res.json(await listAll());
  } catch (err) {
    res.status(500).json({ error: 'Falha ao remover modalidade' });
  }
});

export default router;
