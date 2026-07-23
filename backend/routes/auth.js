import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import db from '../db.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// POST /login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    
    if (users.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const user = users[0];

    // Se for o primeiro acesso, retorna flag para o frontend sem validar hash de senha
    if (user.first_access) {
      return res.status(200).json({ firstAccess: true, username: user.username });
    }

    const passwordIsValid = await bcrypt.compare(password, user.password_hash);

    if (!passwordIsValid) {
      return res.status(401).json({ error: 'Senha inválida' });
    }

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET || 'secret-licitacao-123', {
      expiresIn: 86400 // 24 hours
    });

    res.status(200).json({
      id: user.id,
      username: user.username,
      accessToken: token
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Login falhou' });
  }
});

// Helper endpoint just to create the very first admin user
router.post('/setup-admin', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Provide username and password' });
  }

  try {
    const [existing] = await db.query('SELECT id FROM users LIMIT 1');
    if (existing.length > 0) {
      return res.status(403).json({ error: 'An admin user already exists. Setup blocked.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const id = randomUUID();

    await db.query(
      'INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)',
      [id, username, hash, 'admin']
    );

    res.status(201).json({ message: 'Admin user created successfully!' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create admin' });
  }
});

// POST /first-access - Configurar senha no primeiro login
router.post('/first-access', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Informe o usuário e a nova senha' });
  }

  // Validação de senha: mínimo 8 caracteres e no mínimo um caractere especial
  if (password.length < 8) {
    return res.status(400).json({ error: 'A senha deve conter no mínimo 8 caracteres' });
  }
  const specialCharRegex = /[^a-zA-Z0-9]/;
  if (!specialCharRegex.test(password)) {
    return res.status(400).json({ error: 'A senha deve conter pelo menos um caractere especial' });
  }

  try {
    const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const user = users[0];
    if (!user.first_access) {
      return res.status(400).json({ error: 'Primeiro acesso já realizado para este usuário' });
    }

    const hash = await bcrypt.hash(password, 10);

    await db.query(
      'UPDATE users SET password_hash = ?, first_access = FALSE WHERE id = ?',
      [hash, user.id]
    );

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET || 'secret-licitacao-123', {
      expiresIn: 86400 // 24 hours
    });

    res.status(200).json({
      id: user.id,
      username: user.username,
      accessToken: token
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao configurar primeiro acesso' });
  }
});

// GET /me — dados do usuário autenticado
router.get('/me', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, username, role FROM users WHERE id = ?', [req.userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ id: rows[0].id, username: rows[0].username, role: rows[0].role || 'user' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// PATCH /password
router.patch('/password', verifyToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Informe senha atual e nova senha' });
  }
  if (String(newPassword).length < 4) {
    return res.status(400).json({ error: 'Nova senha muito curta' });
  }
  try {
    const [users] = await db.query('SELECT * FROM users WHERE id = ?', [req.userId]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = users[0];
    if (!await bcrypt.compare(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: 'Senha atual incorreta' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.userId]);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Falha ao atualizar senha' });
  }
});

// DELETE /account — remove o usuário (confirmação por senha)
router.delete('/account', verifyToken, async (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Informe sua senha para confirmar' });
  }
  try {
    const [users] = await db.query('SELECT * FROM users WHERE id = ?', [req.userId]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = users[0];
    if (!await bcrypt.compare(password, user.password_hash)) {
      return res.status(401).json({ error: 'Senha incorreta' });
    }
    await db.query('DELETE FROM users WHERE id = ?', [req.userId]);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Falha ao remover conta' });
  }
});

export default router;
