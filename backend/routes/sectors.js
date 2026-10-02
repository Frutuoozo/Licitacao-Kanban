import express from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import db from '../db.js';
import { requireAdmin } from '../middleware/admin.js';
import { isNonEmptyString, MAX_LENGTHS, normalizeText } from '../validation.js';

const router = express.Router();
const sectorWriteLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas ações em setores. Aguarde alguns minutos e tente novamente.' },
  keyGenerator: (req) => req.userId || ipKeyGenerator(req.ip),
});

// GET /api/sectors — qualquer usuário autenticado
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, name FROM sectors ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Falha ao listar setores' });
  }
});

// POST /api/sectors — apenas admin
router.post('/', requireAdmin, sectorWriteLimiter, async (req, res) => {
  const { name } = req.body;
  if (!isNonEmptyString(name, MAX_LENGTHS.name)) return res.status(400).json({ error: 'Nome obrigatório' });
  try {
    await db.query('INSERT INTO sectors (name) VALUES (?)', [normalizeText(name)]);
    const [rows] = await db.query('SELECT id, name FROM sectors ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Setor já existe' });
    res.status(500).json({ error: 'Falha ao criar setor' });
  }
});

// PUT /api/sectors/:id — apenas admin
router.put('/:id', requireAdmin, sectorWriteLimiter, async (req, res) => {
  const { name } = req.body;
  if (!isNonEmptyString(name, MAX_LENGTHS.name)) return res.status(400).json({ error: 'Nome obrigatório' });
  try {
    const [result] = await db.query('UPDATE sectors SET name = ? WHERE id = ?', [normalizeText(name), req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Setor não encontrado' });
    const [rows] = await db.query('SELECT id, name FROM sectors ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Setor já existe' });
    res.status(500).json({ error: 'Falha ao atualizar setor' });
  }
});

// DELETE /api/sectors/:id — apenas admin
router.delete('/:id', requireAdmin, sectorWriteLimiter, async (req, res) => {
  try {
    await db.query('DELETE FROM sectors WHERE id = ?', [req.params.id]);
    const [rows] = await db.query('SELECT id, name FROM sectors ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Falha ao remover setor' });
  }
});

export default router;
