// Teto do histórico de acessos por usuário: dentro dos 180 dias, alguém com muitos IPs podia encher o
// histórico de um usuário com senhas erradas sem limite. Cada novo registro mantém só os 500 mais recentes.
// A proteção useTestDatabase vem primeiro: este processo só enxerga o BANCO DE TESTE (TEST_DB_NAME).
import { testDbSkip } from './helpers/useTestDatabase.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import authRouter, { LOGIN_HISTORY_MAX_PER_USER } from '../routes/auth.js';

const USER = { id: 'test-events-cap', username: 'teste_historico_teto' };
const OTHER = { id: 'test-events-cap-other', username: 'teste_historico_teto_outro' };
const PREFILL = 505;

describe('teto do histórico de acessos', { skip: testDbSkip || false }, () => {
  let server;
  let baseUrl;

  const removeUsers = async () => {
    await db.query('DELETE FROM login_events WHERE user_id IN (?)', [[USER.id, OTHER.id]]);
    await db.query('DELETE FROM users WHERE id IN (?)', [[USER.id, OTHER.id]]);
  };
  const countFor = async (userId) => (await db.query('SELECT COUNT(*) AS n FROM login_events WHERE user_id = ?', [userId]))[0][0].n;

  before(async () => {
    await removeUsers();
    const hash = await bcrypt.hash('SenhaCerta#1', 4);
    for (const user of [USER, OTHER]) {
      await db.query(
        "INSERT INTO users (id, username, password_hash, role, first_access, password_changed_at) VALUES (?, ?, ?, 'viewer', FALSE, NOW())",
        [user.id, user.username, hash]
      );
    }
    // Registros recentes (dentro dos 180 dias): o primeiro é o mais antigo.
    const rows = (userId) => Array.from({ length: PREFILL }, (_, i) => [userId, 'wrong_password', '10.0.0.1', `pre-${i}`, new Date(Date.now() - (PREFILL - i) * 60000)]);
    await db.query('INSERT INTO login_events (user_id, event, ip, user_agent, created_at) VALUES ?', [rows(USER.id)]);
    await db.query('INSERT INTO login_events (user_id, event, ip, user_agent, created_at) VALUES ?', [rows(OTHER.id)]);

    const app = express();
    app.set('trust proxy', true);
    app.use(express.json());
    app.use('/api/auth', authRouter);
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    server?.close();
    await removeUsers();
    await db.end();
  });

  test('um registro novo deixa só os 500 mais recentes daquele usuário', async () => {
    assert.equal(LOGIN_HISTORY_MAX_PER_USER, 500);
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.88.0.1', 'User-Agent': 'tentativa-nova' },
      body: JSON.stringify({ username: USER.username, password: 'Errada#123' }),
    });
    assert.equal(res.status, 401);

    // O registro é gravado sem segurar a resposta: espera a limpeza terminar.
    let count;
    for (let i = 0; i < 40; i += 1) {
      count = await countFor(USER.id);
      if (count === LOGIN_HISTORY_MAX_PER_USER) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(count, LOGIN_HISTORY_MAX_PER_USER);

    const [[newest]] = await db.query('SELECT user_agent FROM login_events WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1', [USER.id]);
    assert.equal(newest.user_agent, 'tentativa-nova');
    const [[oldest]] = await db.query('SELECT user_agent FROM login_events WHERE user_id = ? ORDER BY created_at, id LIMIT 1', [USER.id]);
    assert.equal(oldest.user_agent, `pre-${PREFILL - LOGIN_HISTORY_MAX_PER_USER + 1}`);

    // O histórico de outro usuário não é tocado.
    assert.equal(await countFor(OTHER.id), PREFILL);
  });
});
