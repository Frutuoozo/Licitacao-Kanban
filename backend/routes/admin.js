import express from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'crypto';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import db from '../db.js';
import { validatePassword } from '../security.js';
import { isAllowedRole, isValidCpf, isValidEmail, isNonEmptyString, MAX_LENGTHS, normalizeText } from '../validation.js';

const router = express.Router();
const adminWriteLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas ações em pouco tempo. Aguarde alguns minutos e tente novamente.' },
  keyGenerator: (req) => req.userId || ipKeyGenerator(req.ip),
});
const adminMutationLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas ações administrativas. Aguarde alguns minutos e tente novamente.' },
  keyGenerator: (req) => req.userId || ipKeyGenerator(req.ip),
});

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
router.patch('/users/:id', adminMutationLimiter, async (req, res) => {
  const { role } = req.body;
  const id = req.params.id;
  if (!isAllowedRole(role)) {
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
router.patch('/users/:id/password', adminMutationLimiter, async (req, res) => {
  const { password } = req.body;
  const id = req.params.id;

  if (!password) {
    return res.status(400).json({ error: 'Informe a nova senha' });
  }
  const passwordError = validatePassword(password);
  if (passwordError) return res.status(400).json({ error: passwordError });

  try {
    const [rows] = await db.query('SELECT id FROM users WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado' });

    const hash = await bcrypt.hash(password, 10);
    await db.query(
      'UPDATE users SET password_hash = ?, first_access = TRUE, failed_attempts = 0, locked_until = NULL, session_version = session_version + 1 WHERE id = ?',
      [hash, id]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Falha ao redefinir senha' });
  }
});

// POST /api/admin/users
router.post('/users', adminMutationLimiter, async (req, res) => {
  const { username, role } = req.body;

  if (!isNonEmptyString(username, MAX_LENGTHS.username)) {
    return res.status(400).json({ error: 'Nome de usuário é obrigatório' });
  }

  const userRole = isAllowedRole(role) ? role : 'viewer';

  try {
    const cleanUsername = normalizeText(username);
    const [existing] = await db.query('SELECT id FROM users WHERE username = ?', [cleanUsername]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Este nome de usuário já está em uso' });
    }

    const id = randomUUID();
    const temporaryPassword = `${randomBytes(12).toString('base64url')}!`;
    const temporaryPasswordHash = await bcrypt.hash(temporaryPassword, 10);

    await db.query(
      'INSERT INTO users (id, username, password_hash, role, first_access) VALUES (?, ?, ?, ?, TRUE)',
      [id, cleanUsername, temporaryPasswordHash, userRole]
    );

    res.status(201).json({
      id,
      username: cleanUsername,
      role: userRole,
      first_access: true,
      temporaryPassword
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Falha ao criar usuário' });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', adminMutationLimiter, async (req, res) => {
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

const COLLABORATOR_SELECT = 'SELECT id, nome, cpf, email, codigo, ativo, created_at FROM collaborators';
const serializeCollaborator = (row) => ({ ...row, ativo: Boolean(row.ativo) });

// COD opcional: letras, números, "-" ou "_" (até 20). Em branco, o sistema gera COD + número.
function parseCollaboratorBody(body) {
  const { nome, cpf, email } = body || {};
  if (!isNonEmptyString(nome, MAX_LENGTHS.name) || !isValidCpf(cpf) || !isValidEmail(email)) {
    return { error: 'Nome, CPF e e-mail são obrigatórios' };
  }
  const codigo = normalizeText(body.codigo).toUpperCase();
  if (codigo && !/^[A-Z0-9_-]{1,20}$/.test(codigo)) {
    return { error: 'COD inválido: use até 20 letras, números, "-" ou "_".' };
  }
  return {
    data: {
      nome: normalizeText(nome),
      cpf: normalizeText(cpf),
      email: normalizeText(email),
      codigo: codigo || null,
      ativo: body.ativo === false ? 0 : 1,
    },
  };
}

function duplicateMessage(error) {
  return String(error.sqlMessage || '').includes('codigo') ? 'COD já cadastrado' : 'CPF já cadastrado';
}

// GET /api/admin/collaborators
router.get('/collaborators', async (req, res) => {
  try {
    const [rows] = await db.query(`${COLLABORATOR_SELECT} ORDER BY nome ASC`);
    res.json(rows.map(serializeCollaborator));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Falha ao listar colaboradores' });
  }
});

// POST /api/admin/collaborators
router.post('/collaborators', adminWriteLimiter, async (req, res) => {
  const parsed = parseCollaboratorBody(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const c = parsed.data;
  try {
    const [result] = await db.query(
      'INSERT INTO collaborators (nome, cpf, email, codigo, ativo) VALUES (?, ?, ?, ?, ?)',
      [c.nome, c.cpf, c.email, c.codigo, c.ativo]
    );
    if (!c.codigo) {
      await db.query(`UPDATE collaborators SET codigo = CONCAT('COD', LPAD(id, 3, '0')) WHERE id = ?`, [result.insertId]);
    }
    const [rows] = await db.query(`${COLLABORATOR_SELECT} WHERE id = ?`, [result.insertId]);
    res.status(201).json(serializeCollaborator(rows[0]));
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: duplicateMessage(error) });
    console.error(error);
    res.status(500).json({ error: 'Falha ao criar colaborador' });
  }
});

// PUT /api/admin/collaborators/:id
router.put('/collaborators/:id', adminWriteLimiter, async (req, res) => {
  const parsed = parseCollaboratorBody(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });
  const c = parsed.data;
  const id = req.params.id;
  try {
    const [rows] = await db.query('SELECT id FROM collaborators WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Colaborador não encontrado' });
    await db.query(
      `UPDATE collaborators SET nome = ?, cpf = ?, email = ?, codigo = COALESCE(?, CONCAT('COD', LPAD(id, 3, '0'))), ativo = ? WHERE id = ?`,
      [c.nome, c.cpf, c.email, c.codigo, c.ativo, id]
    );
    const [updated] = await db.query(`${COLLABORATOR_SELECT} WHERE id = ?`, [id]);
    res.json(serializeCollaborator(updated[0]));
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: duplicateMessage(error) });
    console.error(error);
    res.status(500).json({ error: 'Falha ao atualizar colaborador' });
  }
});

// DELETE /api/admin/collaborators/:id
router.delete('/collaborators/:id', adminWriteLimiter, async (req, res) => {
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
