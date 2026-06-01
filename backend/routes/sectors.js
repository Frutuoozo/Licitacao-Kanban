import express from 'express';
import db from '../db.js';
import { requireAdmin } from '../middleware/admin.js';

const router = express.Router();

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
router.post('/', requireAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Nome obrigatório' });
  try {
    await db.query('INSERT INTO sectors (name) VALUES (?)', [name.trim()]);
    const [rows] = await db.query('SELECT id, name FROM sectors ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Setor já existe' });
    res.status(500).json({ error: 'Falha ao criar setor' });
  }
});

// PUT /api/sectors/:id — apenas admin
router.put('/:id', requireAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Nome obrigatório' });
  try {
    const [result] = await db.query('UPDATE sectors SET name = ? WHERE id = ?', [name.trim(), req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Setor não encontrado' });
    const [rows] = await db.query('SELECT id, name FROM sectors ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Setor já existe' });
    res.status(500).json({ error: 'Falha ao atualizar setor' });
  }
});

// DELETE /api/sectors/:id — apenas admin
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM sectors WHERE id = ?', [req.params.id]);
    const [rows] = await db.query('SELECT id, name FROM sectors ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Falha ao remover setor' });
  }
});

export default router;
