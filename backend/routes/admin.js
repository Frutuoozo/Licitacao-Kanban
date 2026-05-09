import express from 'express';
import db from '../db.js';

const router = express.Router();

// GET /api/admin/users
router.get('/users', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, username, role, created_at FROM users ORDER BY created_at ASC'
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Falha ao listar usuários' });
  }
});

// PATCH /api/admin/users/:id  body: { role: 'user' | 'admin' }
router.patch('/users/:id', async (req, res) => {
  const { role } = req.body;
  const id = req.params.id;
  if (!['user', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Papel inválido' });
  }
  try {
    const [rows] = await db.query('SELECT role FROM users WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
    const oldRole = rows[0].role;
    if (oldRole === 'admin' && role === 'user') {
      const [countRows] = await db.query("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'");
      if (countRows[0].c <= 1) {
        return res.status(400).json({ error: 'Deve existir pelo menos um administrador' });
      }
    }
    await db.query('UPDATE users SET role = ? WHERE id = ?', [role, id]);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Falha ao atualizar usuário' });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', async (req, res) => {
  const id = req.params.id;
  if (id === req.userId) {
    return res.status(400).json({ error: 'Use o menu de perfil para excluir a própria conta' });
  }
  try {
    const [rows] = await db.query('SELECT role FROM users WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (rows[0].role === 'admin') {
      const [countRows] = await db.query("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'");
      if (countRows[0].c <= 1) {
        return res.status(400).json({ error: 'Não é possível excluir o último administrador' });
      }
    }
    await db.query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Falha ao remover usuário' });
  }
});

export default router;
