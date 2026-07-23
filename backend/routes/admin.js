import express from 'express';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
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

// PATCH /api/admin/users/:id  body: { role: 'admin' | 'editor' | 'viewer' }
router.patch('/users/:id', async (req, res) => {
  const { role } = req.body;
  const id = req.params.id;
  if (!['admin', 'editor', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'Papel inválido' });
  }
  try {
    const [rows] = await db.query('SELECT role FROM users WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
    const oldRole = rows[0].role;
    if (oldRole === 'admin' && role !== 'admin') {
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

// PATCH /api/admin/users/:id/password  body: { password }
router.patch('/users/:id/password', async (req, res) => {
  const { password } = req.body;
  const id = req.params.id;

  if (!password) {
    return res.status(400).json({ error: 'Informe a nova senha' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'A senha deve conter no mínimo 8 caracteres' });
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    return res.status(400).json({ error: 'A senha deve conter pelo menos um caractere especial' });
  }

  try {
    const [rows] = await db.query('SELECT id FROM users WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado' });

    const hash = await bcrypt.hash(password, 10);
    await db.query(
      'UPDATE users SET password_hash = ?, first_access = FALSE WHERE id = ?',
      [hash, id]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Falha ao redefinir senha' });
  }
});

// POST /api/admin/users
router.post('/users', async (req, res) => {
  const { username, role } = req.body;

  if (!username?.trim()) {
    return res.status(400).json({ error: 'Nome de usuário é obrigatório' });
  }

  const userRole = ['admin', 'editor', 'viewer'].includes(role) ? role : 'viewer';

  try {
    const [existing] = await db.query('SELECT id FROM users WHERE username = ?', [username.trim()]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Este nome de usuário já está em uso' });
    }

    const id = randomUUID();
    const placeholderHash = 'first_access_pending';

    await db.query(
      'INSERT INTO users (id, username, password_hash, role, first_access) VALUES (?, ?, ?, ?, TRUE)',
      [id, username.trim(), placeholderHash, userRole]
    );

    res.status(201).json({
      id,
      username: username.trim(),
      role: userRole,
      first_access: true
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Falha ao criar usuário' });
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

// ── Colaboradores ─────────────────────────────────────────────────────────────

// GET /api/admin/collaborators
router.get('/collaborators', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, nome, cpf, email, created_at FROM collaborators ORDER BY nome ASC'
    );
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Falha ao listar colaboradores' });
  }
});

// POST /api/admin/collaborators
router.post('/collaborators', async (req, res) => {
  const { nome, cpf, email } = req.body;
  if (!nome?.trim() || !cpf?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'Nome, CPF e e-mail são obrigatórios' });
  }
  try {
    const [result] = await db.query(
      'INSERT INTO collaborators (nome, cpf, email) VALUES (?, ?, ?)',
      [nome.trim(), cpf.trim(), email.trim()]
    );
    const [rows] = await db.query(
      'SELECT id, nome, cpf, email, created_at FROM collaborators WHERE id = ?',
      [result.insertId]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'CPF já cadastrado' });
    console.error(error);
    res.status(500).json({ error: 'Falha ao criar colaborador' });
  }
});

// PUT /api/admin/collaborators/:id
router.put('/collaborators/:id', async (req, res) => {
  const { nome, cpf, email } = req.body;
  const id = req.params.id;
  if (!nome?.trim() || !cpf?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'Nome, CPF e e-mail são obrigatórios' });
  }
  try {
    const [rows] = await db.query('SELECT id FROM collaborators WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Colaborador não encontrado' });
    await db.query(
      'UPDATE collaborators SET nome = ?, cpf = ?, email = ? WHERE id = ?',
      [nome.trim(), cpf.trim(), email.trim(), id]
    );
    const [updated] = await db.query(
      'SELECT id, nome, cpf, email, created_at FROM collaborators WHERE id = ?',
      [id]
    );
    res.json(updated[0]);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'CPF já cadastrado' });
    console.error(error);
    res.status(500).json({ error: 'Falha ao atualizar colaborador' });
  }
});

// DELETE /api/admin/collaborators/:id
router.delete('/collaborators/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const [rows] = await db.query('SELECT id FROM collaborators WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Colaborador não encontrado' });
    await db.query('DELETE FROM collaborators WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Falha ao remover colaborador' });
  }
});

export default router;
