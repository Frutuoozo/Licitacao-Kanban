import express from 'express';
import db from '../db.js';

const router = express.Router();

// GET /api/collaborators  — todos os usuários autenticados podem listar.
// O CPF fica de fora de propósito: só admin o recebe, em /api/admin/collaborators.
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, nome, email, codigo, ativo = 1 AS ativo FROM collaborators ORDER BY nome ASC'
    );
    res.json(rows.map((row) => ({ ...row, ativo: Boolean(row.ativo) })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Falha ao listar colaboradores' });
  }
});

export default router;
