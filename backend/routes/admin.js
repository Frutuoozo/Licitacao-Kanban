import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'crypto';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import db from '../db.js';
import { validatePassword } from '../security.js';
import { closeUserSockets } from '../socket.js';
import { sendError } from '../errors.js';
import { changeUserRole, deleteUser } from '../users.js';
import { isAllowedRole, isValidCpf, isValidEmail, isNonEmptyString, MAX_LENGTHS, normalizeText } from '../validation.js';
import { createRouter } from '../asyncRouter.js';

const router = createRouter();
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
// Além do perfil: último acesso (entrada com senha ou primeiro acesso), senha temporária pendente, minutos de bloqueio
// que restam (medidos pelo relógio do MySQL) e a data da última troca de senha — para o painel "Precisa de atenção".
router.get('/users', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT u.id, u.username, u.role, u.created_at, u.first_access, u.password_changed_at,
              COALESCE(GREATEST(TIMESTAMPDIFF(SECOND, NOW(), u.locked_until), 0), 0) AS locked_seconds,
              (SELECT MAX(e.created_at) FROM login_events e WHERE e.user_id = u.id AND e.event IN ('success', 'first_access')) AS last_login_at
       FROM users u ORDER BY u.created_at ASC`
    );
    res.json(rows.map(({ first_access, password_changed_at, locked_seconds, last_login_at, ...row }) => ({
      ...row,
      firstAccess: Boolean(first_access),
      passwordChangedAt: password_changed_at,
      lockedMinutes: Math.ceil(Number(locked_seconds) / 60),
      lastLoginAt: last_login_at,
    })));
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
    await changeUserRole(id, role);
    res.json({ ok: true });
  } catch (error) {
    return sendError(res, error, 'Falha ao atualizar usuário');
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
    closeUserSockets(id);
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
    await deleteUser(id);
    closeUserSockets(id);
    res.json({ ok: true });
  } catch (error) {
    return sendError(res, error, 'Falha ao remover usuário');
  }
});

// GET /api/admin/login-events?limit=12 — atividade de acesso recente de todos os usuários (mais nova primeiro).
router.get('/login-events', async (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 12, 1), 50);
  try {
    const [rows] = await db.query(
      `SELECT e.id, e.user_id, u.username, e.event, e.created_at
       FROM login_events e JOIN users u ON u.id = e.user_id
       ORDER BY e.created_at DESC, e.id DESC LIMIT ?`,
      [limit]
    );
    res.json(rows.map((row) => ({ id: row.id, userId: row.user_id, username: row.username, event: row.event, createdAt: row.created_at })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Falha ao carregar a atividade de acesso' });
  }
});

// Registra no histórico de acesso do próprio usuário (o mesmo que ele vê em Meu perfil) a ação feita pelo administrador.
const logAdminAction = (userId, event) => db.query('INSERT INTO login_events (user_id, event) VALUES (?, ?)', [userId, event]);

// POST /api/admin/users/:id/unlock — libera a conta bloqueada por tentativas inválidas.
router.post('/users/:id/unlock', adminMutationLimiter, async (req, res) => {
  try {
    const [result] = await db.query('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
    await logAdminAction(req.params.id, 'unlocked');
    return res.json({ ok: true });
  } catch (error) {
    return sendError(res, error, 'Falha ao desbloquear a conta');
  }
});

// POST /api/admin/users/:id/revoke-sessions — encerra a sessão do usuário em todos os aparelhos (a senha continua).
router.post('/users/:id/revoke-sessions', adminMutationLimiter, async (req, res) => {
  if (req.params.id === req.userId) {
    return res.status(400).json({ error: 'Para encerrar as suas sessões, use Meu perfil.' });
  }
  try {
    const [result] = await db.query('UPDATE users SET session_version = session_version + 1 WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
    closeUserSockets(req.params.id);
    await logAdminAction(req.params.id, 'admin_sessions_revoked');
    return res.json({ ok: true });
  } catch (error) {
    return sendError(res, error, 'Falha ao encerrar as sessões');
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
