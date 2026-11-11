// Um relógio só: o do MySQL. O bloqueio de login, a validade da senha e "arquivado em" eram gravados com NOW()
// do MySQL, mas comparados (ou, no caso de "iniciado em", gravados) com a hora do Node. Com os dois em fusos
// diferentes, o bloqueio acabava antes da hora ou durava horas a mais, e "iniciado em" ficava depois de
// "arquivado em". Aqui o Node roda de propósito num fuso diferente do MySQL.
// A proteção useTestDatabase vem primeiro: este processo só enxerga o BANCO DE TESTE (TEST_DB_NAME).
import { testDbSkip } from './helpers/useTestDatabase.js';
import { after, afterEach, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import authRouter from '../routes/auth.js';
import processesRouter from '../routes/processes.js';
import contractsRouter from '../routes/contracts.js';
import { isoToday } from '../validation.js';
import { migrateDemandPriority, migrateDemands } from '../demandsMigration.js';

// Fusos bem longe de qualquer fuso do Brasil ou de UTC: um adiantado e um atrasado.
const AHEAD = 'Pacific/Kiritimati'; // UTC+14
const BEHIND = 'Pacific/Pago_Pago'; // UTC-11
const ORIGINAL_TZ = process.env.TZ;
const PASSWORD = 'SenhaCerta#1';
const PREFIX = 'teste-relogio-';
let server;
let baseUrl;
let userCount = 0;

const assertTestDatabase = async () => {
  const [[{ name }]] = await db.query('SELECT DATABASE() AS name');
  assert.ok(String(name).endsWith('_test'), `banco inesperado nos testes: ${name}`);
};

const useNodeTimezone = (tz) => { process.env.TZ = tz; };

const cleanup = async () => {
  await db.query('DELETE FROM login_events WHERE user_id LIKE ?', [`${PREFIX}%`]);
  await db.query('DELETE FROM users WHERE id LIKE ?', [`${PREFIX}%`]);
  await db.query('DELETE pi FROM process_items pi JOIN processes p ON p.id = pi.process_id WHERE p.title LIKE ?', [`${PREFIX}%`]);
  await db.query('DELETE FROM processes WHERE title LIKE ?', [`${PREFIX}%`]);
  const [contracts] = await db.query('SELECT id FROM contracts WHERE process_name LIKE ?', [`${PREFIX}%`]);
  if (contracts.length > 0) {
    const ids = contracts.map((c) => c.id);
    await db.query('DELETE FROM contract_events WHERE contract_id IN (?)', [ids]);
    await db.query('DELETE FROM contracts WHERE id IN (?)', [ids]);
  }
  await db.query("DELETE FROM app_settings WHERE setting_key IN ('passwordExpiryEnabled', 'passwordExpiryDays')");
};

before(async () => {
  if (testDbSkip) return;
  await assertTestDatabase();
  await migrateDemands(db);
  await migrateDemandPriority(db);
  await cleanup();
  const app = express();
  app.use(express.json());
  // Rotas de processos: a autenticação não é o que está em teste, entra como editor.
  app.use('/api/processes', (req, _res, next) => { req.userId = crypto.randomUUID(); req.userRole = 'editor'; next(); }, processesRouter);
  app.use('/api/contracts', (req, _res, next) => { req.userId = crypto.randomUUID(); req.userRole = 'editor'; req.userName = 'teste'; next(); }, contractsRouter);
  app.use('/api/auth', authRouter);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

afterEach(async () => {
  useNodeTimezone(ORIGINAL_TZ);
  if (!testDbSkip) await cleanup();
});

after(async () => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  server?.close();
  await db.end();
});

const call = async (method, path, body) => {
  const res = await fetch(`${baseUrl}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
};

// Usuário com a linha de horário montada pelo próprio MySQL (`timeSql` usa NOW()).
const createUser = async (column, timeSql) => {
  userCount += 1;
  const user = { id: `${PREFIX}${userCount}`, username: `${PREFIX}${userCount}` };
  await db.query(
    `INSERT INTO users (id, username, password_hash, role, first_access, password_changed_at) VALUES (?, ?, ?, 'editor', 0, NOW())`,
    [user.id, user.username, await bcrypt.hash(PASSWORD, 4)]
  );
  await db.query(`UPDATE users SET ${column} = ${timeSql} WHERE id = ?`, [user.id]);
  return user;
};
const login = (user) => call('POST', '/auth/login', { username: user.username, password: PASSWORD });

const newProcess = (status) => ({
  id: crypto.randomUUID(), title: `${PREFIX}${crypto.randomUUID().slice(0, 8)}`, processNumber: status === 'active' ? '001/2026' : '',
  setor: 'Maria', type: 'Compras', typeColor: '#2563eb', dueDate: '2030-01-15', status, docs: [],
});
// Segundos entre "iniciado em" e "arquivado em", calculados pelo MySQL.
const startToArchiveSeconds = async (id) => (await db.query(
  'SELECT TIMESTAMPDIFF(SECOND, started_at, archived_at) AS s FROM processes WHERE id = ?', [id]
))[0][0].s;

describe('um relógio só, mesmo com o Node em outro fuso', { skip: testDbSkip || false }, () => {
  test('bloqueio de login que termina daqui a 15 min continua valendo com o Node adiantado', async () => {
    const user = await createUser('locked_until', 'DATE_ADD(NOW(), INTERVAL 15 MINUTE)');
    useNodeTimezone(AHEAD);
    const res = await login(user);
    assert.equal(res.status, 423);
    assert.match(res.body.error, /Tente novamente em 15 min/);
  });

  test('bloqueio que já terminou não segura o login com o Node atrasado', async () => {
    const user = await createUser('locked_until', 'DATE_SUB(NOW(), INTERVAL 1 MINUTE)');
    useNodeTimezone(BEHIND);
    assert.equal((await login(user)).status, 200);
  });

  test('senha trocada há 90 dias vence com o Node atrasado', async () => {
    await db.query("INSERT INTO app_settings (setting_key, setting_value) VALUES ('passwordExpiryEnabled', 'true'), ('passwordExpiryDays', '90')");
    const user = await createUser('password_changed_at', 'DATE_SUB(NOW(), INTERVAL 90 DAY)');
    useNodeTimezone(BEHIND);
    const res = await login(user);
    assert.equal(res.status, 200);
    assert.equal(res.body.passwordExpired, true);
  });

  test('senha trocada há 89 dias ainda vale com o Node adiantado', async () => {
    await db.query("INSERT INTO app_settings (setting_key, setting_value) VALUES ('passwordExpiryEnabled', 'true'), ('passwordExpiryDays', '90')");
    const user = await createUser('password_changed_at', 'DATE_SUB(NOW(), INTERVAL 89 DAY)');
    useNodeTimezone(AHEAD);
    const res = await login(user);
    assert.equal(res.status, 200);
    assert.equal(res.body.passwordExpired, undefined);
  });

  test('processo criado já iniciado e arquivado em seguida: iniciado antes de arquivado', async () => {
    useNodeTimezone(AHEAD);
    const p = newProcess('active');
    assert.equal((await call('POST', '/processes', p)).status, 201);
    assert.equal((await call('PUT', `/processes/${p.id}/status`, { status: 'archived' })).status, 200);
    const seconds = await startToArchiveSeconds(p.id);
    assert.ok(seconds >= 0 && seconds < 60, `iniciado e arquivado distantes ${seconds} s`);
  });

  test('demanda iniciada e arquivada em seguida: iniciada antes de arquivada', async () => {
    useNodeTimezone(AHEAD);
    const p = newProcess('pending');
    assert.equal((await call('POST', '/processes', p)).status, 201);
    assert.equal((await call('PUT', `/processes/${p.id}/start`, { processNumber: '002/2026' })).status, 200);
    assert.equal((await call('PUT', `/processes/${p.id}/status`, { status: 'archived' })).status, 200);
    const seconds = await startToArchiveSeconds(p.id);
    assert.ok(seconds >= 0 && seconds < 60, `iniciada e arquivada distantes ${seconds} s`);
  });

  // "Hoje" é o dia em Teresina, como em isoToday. Com o Node em UTC+14, o dia do Node é outro em 17 das 24 horas.
  test('encerrar contrato sem data usa o dia de hoje em Teresina, não o do fuso do Node', async () => {
    const created = await call('POST', '/contracts', {
      processName: `${PREFIX}contrato`, objectDescription: 'Objeto', processNumber: '001/2026', contractValue: 10,
      dueDate: '2030-01-01', fiscalEffective: 'Maria', modality: 'Pregão Eletrônico', lawType: 'new',
    });
    assert.equal(created.status, 201);
    useNodeTimezone(AHEAD);
    const closed = await call('POST', `/contracts/${created.body.id}/close`, {});
    assert.equal(closed.status, 200);
    assert.equal(closed.body.closedAt, isoToday());
  });
});
