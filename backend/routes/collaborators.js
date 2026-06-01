import express from 'express';
import db from '../db.js';

const router = express.Router();

// GET /api/collaborators  — todos os usuários autenticados podem listar
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, nome, cpf, email FROM collaborators ORDER BY nome ASC'
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Falha ao listar colaboradores' });
  }
});

export default router;
