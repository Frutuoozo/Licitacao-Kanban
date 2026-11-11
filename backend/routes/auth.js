import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import db, { withTransaction } from '../db.js';
import { verifyToken } from '../middleware/auth.js';
import { requireCsrf } from '../middleware/csrf.js';
import { buildAuthCookieOptions, buildCsrfCookieOptions, generateCsrfToken, getJwtSecret, validatePassword } from '../security.js';
import { isNonEmptyString, MAX_LENGTHS, normalizeText } from '../validation.js';
import { closeUserSockets } from '../socket.js';
import { ClientError } from '../errors.js';
import { deleteUser } from '../users.js';
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
// Trocar de nome a cada tentativa escapa do limite acima. Este conta só por IP e só as falhas, para não
// atrapalhar várias pessoas entrando pelo mesmo IP do escritório. Vem antes do bcrypt e do banco.
const authIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' },
  keyGenerator: (req) => ipKeyGenerator(req.ip),
});
const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de alteração. Aguarde 15 minutos e tente novamente.' },
  keyGenerator: (req) => req.userId || ipKeyGenerator(req.ip),
});

// Páginas que o usuário pode escolher para abrir logo após o login ("seção" ou "seção:aba").
const START_PAGES = ['dashboard', 'processos:board', 'processos:calendar', 'processos:reports', 'contratos', 'colaboradores', 'admin'];
const startPageFor = (user) => (START_PAGES.includes(user.start_page) && (user.start_page !== 'admin' || user.role === 'admin') ? user.start_page : 'dashboard');

// Histórico de acessos (aba Segurança do perfil). Registro sem bloquear a resposta: falha ao gravar não impede o login.
// Tipos: success, first_access (entrou definindo a senha), wrong_password, locked, password_changed, sessions_revoked.
const LOGIN_HISTORY_DAYS = 180;
function logLoginEvent(req, userId, event) {
  const userAgent = String(req.get('user-agent') || '').slice(0, 255);
  const ip = String(req.ip || '').replace(/^::ffff:/, '').slice(0, 64);
  db.query('INSERT INTO login_events (user_id, event, ip, user_agent) VALUES (?, ?, ?, ?)', [userId, event, ip, userAgent])
    .then(() => (event === 'success' ? db.query('DELETE FROM login_events WHERE user_id = ? AND created_at < DATE_SUB(NOW(), INTERVAL ? DAY)', [userId, LOGIN_HISTORY_DAYS]) : null))
    .catch((error) => console.error('Falha ao registrar acesso:', error.message));
}

// Preferências pessoais (aba Preferências do perfil). Só entram chaves e valores conhecidos.
const PREFERENCE_OPTIONS = {
  theme: ['light', 'dark', 'auto'],
  fontSize: ['normal', 'large', 'xlarge'],
  hideDoneDocs: [true, false],
  exportFormat: ['csv', 'pdf'],
  dateFormat: ['short', 'long'],
};
const cleanPreferences = (input) => {
  const out = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [key, allowed] of Object.entries(PREFERENCE_OPTIONS)) {
    if (allowed.includes(input[key])) out[key] = input[key];
  }
  return out;
};
const preferencesFor = (user) => {
  try { return cleanPreferences(typeof user.preferences === 'string' ? JSON.parse(user.preferences) : user.preferences); }
  catch { return {}; }
};

// Colunas lidas no login e no primeiro acesso (inclui as de startPageFor e preferencesFor).
// Horários comparados pelo próprio MySQL (um relógio só): locked_until e password_changed_at são gravados com
// NOW() do MySQL, e compará-los com a hora do Node falhava quando os dois estavam em fusos diferentes.
const LOCKED_SECONDS_SQL = 'COALESCE(GREATEST(TIMESTAMPDIFF(SECOND, NOW(), locked_until), 0), 0) AS locked_seconds';
const LOGIN_USER_COLUMNS = `id, username, password_hash, role, first_access, session_version,
  failed_attempts, locked_until, ${LOCKED_SECONDS_SQL}, password_changed_at,
  TIMESTAMPDIFF(SECOND, password_changed_at, NOW()) AS password_age_seconds, start_page, preferences`;

// ── Proteção contra descoberta de usuários ──
// Quem tenta entrar não pode distinguir "usuário não existe" de "senha errada": nem pela mensagem,
// nem pelo tempo de resposta, nem pelo bloqueio após tentativas inválidas.

// Hash de uma senha aleatória (mesmo custo das senhas reais). Quando o usuário não existe, a senha
// digitada é comparada com ele: a resposta leva o mesmo tempo que uma senha errada de verdade.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(randomBytes(32).toString('hex'), 10);

// Bloqueio simulado para nomes que não existem: conta as tentativas na memória e "bloqueia" com as
// mesmas regras e mensagens dos usuários reais. Limitado a PHANTOM_MAX_ENTRIES nomes (os mais antigos
// saem primeiro) para não crescer sem fim; zera se o servidor reiniciar.
const PHANTOM_MAX_ENTRIES = 5000;
const phantomAttempts = new Map();

const phantomKey = (username) => normalizeText(username).toLowerCase();

// Minutos que faltam para o fim de um bloqueio (0 = não está bloqueado).
function minutesFromSeconds(seconds) {
  return seconds > 0 ? Math.max(1, Math.ceil(seconds / 60)) : 0;
}
// Só para o bloqueio simulado (na memória do Node, então o relógio do Node é o certo).
const minutesUntil = (date) => minutesFromSeconds(date ? (new Date(date).getTime() - Date.now()) / 1000 : 0);

// Minutos de bloqueio que ainda restam para `username` (real ou inexistente), lido antes de conferir a senha.
// Usuário real: locked_seconds já vem calculado pelo MySQL (LOGIN_USER_COLUMNS).
const lockedMinutesFor = (user, username) => (user
  ? minutesFromSeconds(Number(user.locked_seconds))
  : minutesUntil(phantomAttempts.get(phantomKey(username))?.lockedUntil));

// Mesma regra de contagem para os dois casos: soma 1; ao atingir o limite, zera e bloqueia.
// Devolve 'failed' (senha errada), 'locking' (esta tentativa bloqueou) ou 'locked' (já estava bloqueado).
// `current.lockedMinutes`: minutos de bloqueio que restam, medidos no relógio de quem guarda o bloqueio.
function countFailure(current, settings) {
  if (current.lockedMinutes) return { outcome: 'locked' };
  const attempts = current.attempts + 1;
  if (settings.lockoutEnabled && attempts >= settings.lockoutAttempts) {
    return { outcome: 'locking', attempts: 0, lockedUntil: new Date(Date.now() + settings.lockoutMinutes * 60000) };
  }
  return { outcome: 'failed', attempts, lockedUntil: current.lockedUntil };
}

function phantomFailure(username, settings) {
  const key = phantomKey(username);
  const entry = phantomAttempts.get(key) || { attempts: 0, lockedUntil: null };
  const next = countFailure({ ...entry, lockedMinutes: minutesUntil(entry.lockedUntil) }, settings);
  if (next.outcome === 'locked') return next;
  phantomAttempts.delete(key); // reinserir move o nome para o fim da fila de descarte
  phantomAttempts.set(key, { attempts: next.attempts, lockedUntil: next.lockedUntil });
  if (phantomAttempts.size > PHANTOM_MAX_ENTRIES) phantomAttempts.delete(phantomAttempts.keys().next().value);
  return next;
}

// Registra uma senha errada (login ou primeiro acesso). A linha do usuário fica travada (FOR UPDATE)
// durante a contagem: pedidos simultâneos esperam a vez e nenhuma tentativa se perde.
// Nome inexistente faz as mesmas consultas (que não encontram nenhuma linha) e conta na memória:
// mesmo trabalho no banco, mesmo tempo de resposta.
async function registerFailedAttempt(username, settings) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query(`SELECT failed_attempts, ${LOCKED_SECONDS_SQL} FROM users WHERE username = ? FOR UPDATE`, [username]);
    const user = rows[0];
    const next = user
      ? countFailure({ attempts: user.failed_attempts || 0, lockedMinutes: minutesFromSeconds(Number(user.locked_seconds)) }, settings)
      : phantomFailure(username, settings);
    // O fim do bloqueio é calculado pelo relógio do MySQL (como antes), não pelo do Node: evita erro se os fusos diferirem.
    if (next.outcome === 'locking') {
      await conn.query('UPDATE users SET failed_attempts = 0, locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE username = ?', [settings.lockoutMinutes, username]);
    } else if (next.outcome === 'failed') {
      await conn.query('UPDATE users SET failed_attempts = ? WHERE username = ?', [next.attempts, username]);
    }
    return next.outcome;
  });
}

// Piso de tempo para senha errada: a resposta nunca sai antes disso, contado desde a chegada do pedido.
// Usuário real e inexistente passam a levar exatamente o mesmo tempo (a diferença natural, ~2 ms, vem
// da gravação do contador no disco). Fica bem acima do tempo normal (~100 ms) para cobrir a variação.
const FAILED_AUTH_MIN_MS = 300;
const waitUntil = (timestamp) => new Promise((resolve) => setTimeout(resolve, Math.max(0, timestamp - Date.now())));

// Resposta para uma senha errada, igual para usuário real e inexistente.
async function sendFailure(res, outcome, settings, invalidMessage, startedAt) {
  await waitUntil(startedAt + FAILED_AUTH_MIN_MS);
  if (outcome === 'locking') return res.status(423).json({ error: lockingMessage(settings.lockoutMinutes) });
  if (outcome === 'locked') return res.status(423).json({ error: lockedMessage(settings.lockoutMinutes) });
  return res.status(401).json({ error: invalidMessage });
}

function logFailure(req, user, outcome) {
  if (!user) return;
  if (outcome !== 'locked') logLoginEvent(req, user.id, 'wrong_password');
  if (outcome !== 'failed') logLoginEvent(req, user.id, 'locked');
}

const lockedMessage = (minutes) => `Conta bloqueada temporariamente por tentativas inválidas. Tente novamente em ${minutes} min.`;
const lockingMessage = (minutes) => `Muitas tentativas inválidas. Conta bloqueada por ${minutes} minutos.`;

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
router.post('/login', authIpLimiter, authLimiter, async (req, res) => {
  const startedAt = Date.now();
  const { username, password } = req.body;

  if (!isNonEmptyString(username, MAX_LENGTHS.username) || typeof password !== 'string') {
    return res.status(400).json({ error: 'Informe usuário e senha' });
  }

  try {
    const [users] = await db.query(`SELECT ${LOGIN_USER_COLUMNS} FROM users WHERE username = ?`, [username]);
    const user = users[0];
    const settings = await readSettings();

    // Bloqueio temporário após tentativas inválidas (configurável em Administração → Segurança).
    // Usuário inexistente segue o mesmo caminho, com o mesmo tempo e as mesmas respostas.
    const lockedMinutes = lockedMinutesFor(user, username);
    if (lockedMinutes) {
      if (user) logLoginEvent(req, user.id, 'locked');
      return res.status(423).json({ error: lockedMessage(lockedMinutes) });
    }

    const passwordIsValid = await bcrypt.compare(password, user ? user.password_hash : DUMMY_PASSWORD_HASH);
    if (!passwordIsValid || !user) {
      const outcome = await registerFailedAttempt(username, settings);
      logFailure(req, user, outcome);
      return sendFailure(res, outcome, settings, 'Usuário ou senha inválidos', startedAt);
    }
    if (user.failed_attempts || user.locked_until) {
      await db.query('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?', [user.id]);
    }

    if (user.first_access) return res.status(200).json({ firstAccess: true, username: user.username });

    // Troca periódica: senha vencida volta para o fluxo de primeiro acesso (definir nova senha).
    if (settings.passwordExpiryEnabled && user.password_changed_at) {
      const ageDays = Number(user.password_age_seconds) / 86400;
      if (ageDays >= settings.passwordExpiryDays) {
        await db.query('UPDATE users SET first_access = TRUE WHERE id = ?', [user.id]);
        return res.status(200).json({ firstAccess: true, passwordExpired: true, username: user.username });
      }
    }

    const token = jwt.sign({ id: user.id, ver: user.session_version || 0 }, getJwtSecret(), { algorithm: 'HS256', expiresIn: '8h' });
    setAuthCookies(res, token);
    logLoginEvent(req, user.id, 'success');
    res.status(200).json({ id: user.id, username: user.username, role: user.role || 'user', startPage: startPageFor(user), preferences: preferencesFor(user) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Login falhou' });
  }
});

// POST /first-access - Configurar senha no primeiro login
router.post('/first-access', authIpLimiter, authLimiter, async (req, res) => {
  const startedAt = Date.now();
  const { username, currentPassword, password } = req.body;

  if (!isNonEmptyString(username, MAX_LENGTHS.username) || typeof currentPassword !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Informe o usuário, a senha temporária e a nova senha' });
  }
  const passwordError = validatePassword(password);
  if (passwordError) return res.status(400).json({ error: passwordError });

  try {
    // Usuário inexistente e senha temporária errada têm a mesma resposta e o mesmo tempo, e as
    // tentativas erradas contam para o mesmo bloqueio do login.
    // A senha é conferida antes do estado do primeiro acesso: sem a senha certa, nada revela se o usuário existe.
    const [users] = await db.query(`SELECT ${LOGIN_USER_COLUMNS} FROM users WHERE username = ?`, [username]);
    const user = users[0];
    const settings = await readSettings();
    const lockedMinutes = lockedMinutesFor(user, username);
    if (lockedMinutes) {
      if (user) logLoginEvent(req, user.id, 'locked');
      return res.status(423).json({ error: lockedMessage(lockedMinutes) });
    }
    if (!await bcrypt.compare(currentPassword, user ? user.password_hash : DUMMY_PASSWORD_HASH) || !user) {
      const outcome = await registerFailedAttempt(username, settings);
      logFailure(req, user, outcome);
      return sendFailure(res, outcome, settings, 'Usuário ou senha temporária inválidos', startedAt);
    }
    if (!user.first_access) {
      return res.status(400).json({ error: 'Primeiro acesso já realizado para este usuário' });
    }
    if (await bcrypt.compare(password, user.password_hash)) {
      return res.status(400).json({ error: 'A nova senha precisa ser diferente da atual' });
    }

    const hash = await bcrypt.hash(password, 10);

    // Sobe a versão da sessão: quem estava logado com a senha antiga sai, e só este aparelho recebe o token novo.
    await db.query(
      'UPDATE users SET password_hash = ?, first_access = FALSE, password_changed_at = NOW(), failed_attempts = 0, locked_until = NULL, session_version = session_version + 1 WHERE id = ?',
      [hash, user.id]
    );
    closeUserSockets(user.id);

    const token = jwt.sign({ id: user.id, ver: (user.session_version || 0) + 1 }, getJwtSecret(), { algorithm: 'HS256', expiresIn: '8h' });
    setAuthCookies(res, token);
    logLoginEvent(req, user.id, 'first_access');
    res.status(200).json({ id: user.id, username: user.username, role: user.role || 'user', startPage: startPageFor(user), preferences: preferencesFor(user) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao configurar primeiro acesso' });
  }
});

// GET /me — dados do usuário autenticado
router.get('/me', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, username, role, created_at, password_changed_at, start_page, preferences FROM users WHERE id = ?', [req.userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({
      id: rows[0].id,
      username: rows[0].username,
      role: rows[0].role || 'user',
      createdAt: rows[0].created_at,
      passwordChangedAt: rows[0].password_changed_at,
      startPage: startPageFor(rows[0]),
      preferences: preferencesFor(rows[0]),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// PATCH /preferences — preferências do próprio usuário: página inicial e/ou as opções da aba Preferências.
// As opções chegam parciais e são mescladas às já salvas.
router.patch('/preferences', verifyToken, requireCsrf, async (req, res) => {
  const { startPage, preferences } = req.body || {};
  const hasStart = startPage !== undefined;
  const changes = cleanPreferences(preferences);
  if (hasStart && !START_PAGES.includes(startPage)) return res.status(400).json({ error: 'Página inicial inválida.' });
  if (preferences !== undefined && Object.keys(changes).length !== Object.keys(preferences || {}).length) {
    return res.status(400).json({ error: 'Preferência inválida.' });
  }
  if (!hasStart && Object.keys(changes).length === 0) return res.status(400).json({ error: 'Nada para salvar.' });
  try {
    // Lê e grava com a linha travada: duas mudanças ao mesmo tempo (ex.: tema e tamanho da letra) esperam
    // uma pela outra, e a segunda mescla sobre o que a primeira gravou em vez de apagá-lo.
    const saved = await withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT role, start_page, preferences FROM users WHERE id = ? FOR UPDATE', [req.userId]);
      if (rows.length === 0) throw new ClientError('Usuário não encontrado', 404);
      if (startPage === 'admin' && rows[0].role !== 'admin') throw new ClientError('Somente administradores podem abrir na Administração.', 403);
      const merged = { ...preferencesFor(rows[0]), ...changes };
      await conn.query('UPDATE users SET start_page = ?, preferences = ? WHERE id = ?', [hasStart ? startPage : rows[0].start_page, JSON.stringify(merged), req.userId]);
      return { startPage: hasStart ? startPage : startPageFor(rows[0]), preferences: merged };
    });
    res.json(saved);
  } catch (error) {
    if (error instanceof ClientError) return res.status(error.status).json({ error: error.message });
    console.error(error);
    res.status(500).json({ error: 'Falha ao salvar preferências' });
  }
});

// PATCH /password
router.patch('/password', verifyToken, requireCsrf, passwordLimiter, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  // Só texto: o bcrypt lança erro com número ou objeto, e a resposta virava 500.
  if (typeof currentPassword !== 'string' || !currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Informe senha atual e nova senha' });
  }
  const passwordError = validatePassword(newPassword);
  if (passwordError) return res.status(400).json({ error: passwordError });
  try {
    const [users] = await db.query('SELECT password_hash FROM users WHERE id = ?', [req.userId]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = users[0];
    if (!await bcrypt.compare(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: 'Senha atual incorreta' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password_hash = ?, password_changed_at = NOW(), session_version = session_version + 1 WHERE id = ?', [hash, req.userId]);
    closeUserSockets(req.userId);
    logLoginEvent(req, req.userId, 'password_changed');
    clearAuthCookies(res);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Falha ao atualizar senha' });
  }
});

// POST /sessions/revoke-others — encerra o login em todos os outros aparelhos e mantém este:
// sobe a versão da sessão (invalida os tokens antigos) e emite um token novo só para quem pediu.
router.post('/sessions/revoke-others', verifyToken, requireCsrf, passwordLimiter, async (req, res) => {
  try {
    await db.query('UPDATE users SET session_version = COALESCE(session_version, 0) + 1 WHERE id = ?', [req.userId]);
    const [rows] = await db.query('SELECT session_version FROM users WHERE id = ?', [req.userId]);
    if (rows.length === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
    const token = jwt.sign({ id: req.userId, ver: rows[0].session_version || 0 }, getJwtSecret(), { algorithm: 'HS256', expiresIn: '8h' });
    setAuthCookies(res, token);
    closeUserSockets(req.userId);
    logLoginEvent(req, req.userId, 'sessions_revoked');
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Não foi possível encerrar as outras sessões.' });
  }
});

// GET /login-history — últimos acessos do próprio usuário (máx. 30).
router.get('/login-history', verifyToken, async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, event, ip, user_agent, created_at FROM login_events WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 30', [req.userId]);
    res.json(rows.map((row) => ({ id: row.id, event: row.event, ip: row.ip, userAgent: row.user_agent, createdAt: row.created_at })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Não foi possível carregar o histórico de acessos.' });
  }
});

router.post('/logout', (req, res) => {
  clearAuthCookies(res);
  res.json({ ok: true });
});

// DELETE /account — remove o usuário (confirmação por senha)
router.delete('/account', verifyToken, requireCsrf, passwordLimiter, async (req, res) => {
  const { password } = req.body;
  // Só texto: o bcrypt lança erro com número ou objeto, e a resposta virava 500.
  if (typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Informe sua senha para confirmar' });
  }
  try {
    const [users] = await db.query('SELECT password_hash FROM users WHERE id = ?', [req.userId]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });
    if (!await bcrypt.compare(password, users[0].password_hash)) {
      return res.status(401).json({ error: 'Senha incorreta' });
    }
    await deleteUser(req.userId);
    closeUserSockets(req.userId);
    clearAuthCookies(res);
    res.json({ ok: true });
  } catch (error) {
    if (error instanceof ClientError) return res.status(error.status).json({ error: error.message });
    console.error(error);
    res.status(500).json({ error: 'Falha ao remover conta' });
  }
});

export default router;
