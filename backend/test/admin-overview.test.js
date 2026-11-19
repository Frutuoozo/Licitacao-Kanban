// Painel do administrador: a lista de usuários traz último acesso, senha temporária e bloqueio; a atividade recente
// de acesso de todos; e duas ações (desbloquear a conta e encerrar as sessões de um usuário).
// A proteção useTestDatabase vem primeiro: este processo só enxerga o BANCO DE TESTE (TEST_DB_NAME).
import { testDbSkip } from './helpers/useTestDatabase.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import db from '../db.js';
import adminRouter from '../routes/admin.js';

const ID_PREFIX = 'test-admov-';
const ADMIN_ID = `${ID_PREFIX}admin`;
let server;
let baseUrl;

const removeUsers = async () => {
  await db.query('DELETE FROM login_events WHERE user_id LIKE ?', [`${ID_PREFIX}%`]);
  await db.query('DELETE FROM users WHERE id LIKE ?', [`${ID_PREFIX}%`]);
};

let count = 0;
const createUser = async (fields = {}) => {
  count += 1;
  const user = { id: `${ID_PREFIX}${count}`, username: `teste_admov_${count}` };
  await db.query(
    `INSERT INTO users (id, username, password_hash, role, first_access, failed_attempts, locked_until, password_changed_at)
     VALUES (?, ?, 'x', 'viewer', ?, ?, ${fields.lockedMinutes ? 'DATE_ADD(NOW(), INTERVAL ? MINUTE)' : '?'}, NOW())`,
    [user.id, user.username, fields.firstAccess ? 1 : 0, fields.failedAttempts || 0, fields.lockedMinutes || null]
  );
  return user;
};
const logEvent = (userId, event, minutesAgo = 0) => db.query(
  'INSERT INTO login_events (user_id, event, created_at) VALUES (?, ?, DATE_SUB(NOW(), INTERVAL ? MINUTE))', [userId, event, minutesAgo]
);

before(async () => {
  if (testDbSkip) return;
  const [[{ name }]] = await db.query('SELECT DATABASE() AS name');
  assert.ok(String(name).endsWith('_test'), `banco inesperado nos testes: ${name}`);
  await removeUsers();
  const app = express();
  app.use(express.json());
  // A autenticação não é o que está em teste: um administrador fixo.
  app.use((req, _res, next) => { req.userId = ADMIN_ID; req.userRole = 'admin'; req.userName = 'admin-teste'; next(); });
  app.use('/api/admin', adminRouter);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}/api/admin`;
});

after(async () => {
  if (!testDbSkip) await removeUsers();
  server?.close();
  await db.end();
});

const call = async (method, path) => {
  const res = await fetch(`${baseUrl}${path}`, { method, headers: { 'Content-Type': 'application/json' } });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const findUser = async (id) => (await call('GET', '/users')).body.find((user) => user.id === id);

describe('painel do administrador', { skip: testDbSkip || false }, () => {
  test('a lista de usuários traz o último acesso (entrada com sucesso ou primeiro acesso)', async () => {
    const user = await createUser();
    await logEvent(user.id, 'success', 120);
    await logEvent(user.id, 'first_access', 60);
    await logEvent(user.id, 'wrong_password', 5);
    const found = await findUser(user.id);
    const minutesAgo = (Date.now() - new Date(found.lastLoginAt).getTime()) / 60000;
    assert.ok(minutesAgo > 55 && minutesAgo < 65, `último acesso há ${minutesAgo} min`);
  });

  test('quem nunca entrou fica com lastLoginAt null', async () => {
    const user = await createUser();
    assert.equal((await findUser(user.id)).lastLoginAt, null);
  });

  test('a lista mostra senha temporária e bloqueio', async () => {
    const temp = await createUser({ firstAccess: true });
    const locked = await createUser({ lockedMinutes: 10, failedAttempts: 0 });
    const free = await createUser();
    assert.equal((await findUser(temp.id)).firstAccess, true);
    assert.equal((await findUser(free.id)).firstAccess, false);
    const lockedRow = await findUser(locked.id);
    assert.ok(lockedRow.lockedMinutes >= 9 && lockedRow.lockedMinutes <= 10, `bloqueio de ${lockedRow.lockedMinutes} min`);
    assert.equal((await findUser(free.id)).lockedMinutes, 0);
    assert.ok((await findUser(free.id)).passwordChangedAt);
  });

  test('atividade recente: eventos de todos, do mais novo ao mais antigo, com o nome do usuário', async () => {
    const user = await createUser();
    await logEvent(user.id, 'wrong_password', 3);
    await logEvent(user.id, 'success', 1);
    const res = await call('GET', '/login-events?limit=50');
    assert.equal(res.status, 200);
    const mine = res.body.filter((event) => event.userId === user.id);
    assert.deepEqual(mine.map((event) => event.event), ['success', 'wrong_password']);
    assert.equal(mine[0].username, user.username);
    assert.ok(mine[0].createdAt);
  });

  test('atividade recente respeita o limite (no máximo 50)', async () => {
    const user = await createUser();
    for (let i = 0; i < 55; i += 1) await logEvent(user.id, 'success', i);
    assert.equal((await call('GET', '/login-events?limit=2')).body.length, 2);
    assert.equal((await call('GET', '/login-events?limit=999')).body.length, 50);
  });

  test('desbloquear zera as tentativas e o bloqueio, e registra no histórico', async () => {
    const user = await createUser({ lockedMinutes: 15, failedAttempts: 3 });
    const res = await call('POST', `/users/${user.id}/unlock`);
    assert.equal(res.status, 200);
    const [[row]] = await db.query('SELECT failed_attempts, locked_until FROM users WHERE id = ?', [user.id]);
    assert.deepEqual([row.failed_attempts, row.locked_until], [0, null]);
    const [events] = await db.query("SELECT event FROM login_events WHERE user_id = ? AND event = 'unlocked'", [user.id]);
    assert.equal(events.length, 1);
  });

  test('encerrar sessões aumenta a versão da sessão e registra no histórico', async () => {
    const user = await createUser();
    const [[before]] = await db.query('SELECT session_version FROM users WHERE id = ?', [user.id]);
    const res = await call('POST', `/users/${user.id}/revoke-sessions`);
    assert.equal(res.status, 200);
    const [[afterRow]] = await db.query('SELECT session_version FROM users WHERE id = ?', [user.id]);
    assert.equal(afterRow.session_version, before.session_version + 1);
    // Evento próprio: no histórico do usuário, aparece como feito pelo administrador (não como "Outras sessões encerradas").
    const [events] = await db.query('SELECT event FROM login_events WHERE user_id = ?', [user.id]);
    assert.deepEqual(events.map((e) => e.event), ['admin_sessions_revoked']);
  });

  test('o administrador não encerra as próprias sessões por aqui', async () => {
    const res = await call('POST', `/users/${ADMIN_ID}/revoke-sessions`);
    assert.equal(res.status, 400);
  });

  test('usuário inexistente devolve 404 nas duas ações', async () => {
    assert.equal((await call('POST', `/users/${ID_PREFIX}nao-existe/unlock`)).status, 404);
    assert.equal((await call('POST', `/users/${ID_PREFIX}nao-existe/revoke-sessions`)).status, 404);
  });
});
