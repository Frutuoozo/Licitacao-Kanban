import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import db from '../db.js';
import { verifyToken } from '../middleware/auth.js';
import { buildAuthCookieOptions, buildCsrfCookieOptions, generateCsrfToken, getJwtSecret, validatePassword } from '../security.js';
import { isNonEmptyString, MAX_LENGTHS } from '../validation.js';
import { readSettings } from './settings.js';

const router = express.Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' },
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${String(req.body?.username || '').toLowerCase()}`,
});
const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de alteração. Aguarde 15 minutos e tente novamente.' },
  keyGenerator: (req) => req.userId || ipKeyGenerator(req.ip),
});

function setAuthCookies(res, token) {
  const csrfToken = generateCsrfToken();
  res.cookie('auth_token', token, buildAuthCookieOptions());
  res.cookie('csrf_token', csrfToken, buildCsrfCookieOptions());
  res.setHeader('X-CSRF-Token', csrfToken);
}

function bumpSessionVersion(connection, userId) {
  return connection.query('UPDATE users SET session_version = session_version + 1 WHERE id = ?', [userId]);
}

function clearAuthCookies(res) {
  res.clearCookie('auth_token', { path: '/' });
  res.clearCookie('csrf_token', { path: '/' });
}

// POST /login
router.post('/login', authLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!isNonEmptyString(username, MAX_LENGTHS.username) || typeof password !== 'string') {
    return res.status(400).json({ error: 'Informe usuário e senha' });
  }

  try {
    const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    
    if (users.length === 0) return res.status(401).json({ error: 'Usuário ou senha inválidos' });

    const user = users[0];
    const settings = await readSettings();

    // Bloqueio temporário após tentativas inválidas (configurável em Administração → Segurança).
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const minutes = Math.max(1, Math.ceil((new Date(user.locked_until) - new Date()) / 60000));
      return res.status(423).json({ error: `Conta bloqueada temporariamente por tentativas inválidas. Tente novamente em ${minutes} min.` });
    }

    const passwordIsValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordIsValid) {
      const attempts = (user.failed_attempts || 0) + 1;
      if (settings.lockoutEnabled && attempts >= settings.lockoutAttempts) {
        await db.query('UPDATE users SET failed_attempts = 0, locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE id = ?', [settings.lockoutMinutes, user.id]);
        return res.status(423).json({ error: `Muitas tentativas inválidas. Conta bloqueada por ${settings.lockoutMinutes} minutos.` });
      }
      await db.query('UPDATE users SET failed_attempts = ? WHERE id = ?', [attempts, user.id]);
      return res.status(401).json({ error: 'Usuário ou senha inválidos' });
    }
    if (user.failed_attempts || user.locked_until) {
      await db.query('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?', [user.id]);
    }

    if (user.first_access) return res.status(200).json({ firstAccess: true, username: user.username });

    // Troca periódica: senha vencida volta para o fluxo de primeiro acesso (definir nova senha).
    if (settings.passwordExpiryEnabled && user.password_changed_at) {
      const ageDays = (Date.now() - new Date(user.password_changed_at).getTime()) / 86400000;
      if (ageDays >= settings.passwordExpiryDays) {
        await db.query('UPDATE users SET first_access = TRUE WHERE id = ?', [user.id]);
        return res.status(200).json({ firstAccess: true, passwordExpired: true, username: user.username });
      }
    }

    const token = jwt.sign({ id: user.id, ver: user.session_version || 0 }, getJwtSecret(), { algorithm: 'HS256', expiresIn: '8h' });
    setAuthCookies(res, token);
    res.status(200).json({ id: user.id, username: user.username, role: user.role || 'user' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Login falhou' });
  }
});

// Helper endpoint just to create the very first admin user
router.post('/setup-admin', authLimiter, async (req, res) => {
  const { username, password } = req.body;
  
  if (!isNonEmptyString(username, MAX_LENGTHS.username) || typeof password !== 'string') {
    return res.status(400).json({ error: 'Provide username and password' });
  }
  const passwordError = validatePassword(password);
  if (passwordError) return res.status(400).json({ error: passwordError });

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
router.post('/first-access', authLimiter, async (req, res) => {
  const { username, currentPassword, password } = req.body;

  if (!isNonEmptyString(username, MAX_LENGTHS.username) || typeof currentPassword !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Informe o usuário, a senha temporária e a nova senha' });
  }
  const passwordError = validatePassword(password);
  if (passwordError) return res.status(400).json({ error: passwordError });

  try {
    const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
    if (users.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const user = users[0];
    if (!user.first_access) {
      return res.status(400).json({ error: 'Primeiro acesso já realizado para este usuário' });
    }
    if (!await bcrypt.compare(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: 'Senha temporária inválida' });
    }
    if (await bcrypt.compare(password, user.password_hash)) {
      return res.status(400).json({ error: 'A nova senha precisa ser diferente da atual' });
    }

    const hash = await bcrypt.hash(password, 10);

    await db.query(
      'UPDATE users SET password_hash = ?, first_access = FALSE, password_changed_at = NOW() WHERE id = ?',
      [hash, user.id]
    );

    const token = jwt.sign({ id: user.id, ver: user.session_version || 0 }, getJwtSecret(), { algorithm: 'HS256', expiresIn: '8h' });
    setAuthCookies(res, token);
    res.status(200).json({ id: user.id, username: user.username, role: user.role || 'user' });
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
router.patch('/password', verifyToken, passwordLimiter, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Informe senha atual e nova senha' });
  }
  const passwordError = validatePassword(newPassword);
  if (passwordError) return res.status(400).json({ error: passwordError });
  try {
    const [users] = await db.query('SELECT * FROM users WHERE id = ?', [req.userId]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = users[0];
    if (!await bcrypt.compare(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: 'Senha atual incorreta' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password_hash = ?, password_changed_at = NOW(), session_version = session_version + 1 WHERE id = ?', [hash, req.userId]);
    clearAuthCookies(res);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Falha ao atualizar senha' });
  }
});

router.post('/logout', (req, res) => {
  clearAuthCookies(res);
  res.json({ ok: true });
});

// DELETE /account — remove o usuário (confirmação por senha)
router.delete('/account', verifyToken, passwordLimiter, async (req, res) => {
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
    if (user.role === 'admin') {
      const [countRows] = await db.query("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'");
      if (countRows[0].c <= 1) {
        return res.status(400).json({ error: 'Não é possível excluir o último administrador' });
      }
    }
    await db.query('DELETE FROM users WHERE id = ?', [req.userId]);
    clearAuthCookies(res);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Falha ao remover conta' });
  }
});

export default router;
