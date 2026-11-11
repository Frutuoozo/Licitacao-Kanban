// Preferências do usuário: "Alertas de vencimento" saiu do sistema, junto com o painel que usava esse valor.
// A proteção useTestDatabase vem primeiro: este processo só enxerga o BANCO DE TESTE (TEST_DB_NAME).
import { testDbSkip } from './helpers/useTestDatabase.js';
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import db from '../db.js';
import authRouter from '../routes/auth.js';
import { getJwtSecret } from '../security.js';

const userId = crypto.randomUUID();
const CSRF_TOKEN = 'token-de-teste';
let server;
let baseUrl;
let cookie;

const assertTestDatabase = async () => {
  const [[{ name }]] = await db.query('SELECT DATABASE() AS name');
  assert.ok(String(name).endsWith('_test'), `banco inesperado nos testes: ${name}`);
};

before(async () => {
  if (testDbSkip) return;
  await assertTestDatabase();
  await db.query(
    'INSERT INTO users (id, username, password_hash, role, first_access, password_changed_at) VALUES (?, ?, ?, ?, ?, NOW())',
    [userId, `pref-${userId}`, 'x', 'editor', 0]
  );
  cookie = `auth_token=${jwt.sign({ id: userId, ver: 0 }, getJwtSecret(), { algorithm: 'HS256', expiresIn: '1h' })}; csrf_token=${CSRF_TOKEN}`;
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}/api/auth`;
});

after(async () => {
  server?.close();
  if (!testDbSkip) {
    await assertTestDatabase();
    await db.query('DELETE FROM users WHERE id = ?', [userId]);
  }
  await db.end();
});

const call = async (method, path, body) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', cookie, 'X-CSRF-Token': CSRF_TOKEN },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const savePreferences = (value) => db.query('UPDATE users SET preferences = ? WHERE id = ?', [JSON.stringify(value), userId]);

describe('preferências', { skip: testDbSkip || false }, () => {
  beforeEach(async () => {
    await assertTestDatabase();
    await savePreferences({});
  });

  test('não aceita mais alertDays', async () => {
    const res = await call('PATCH', '/preferences', { preferences: { alertDays: 30 } });
    assert.equal(res.status, 400);
  });

  test('alertDays salvo antes não volta para a tela e some no próximo salvamento', async () => {
    await savePreferences({ alertDays: 15, theme: 'dark' });
    assert.deepEqual((await call('GET', '/me')).body.preferences, { theme: 'dark' });

    const res = await call('PATCH', '/preferences', { preferences: { fontSize: 'large' } });
    assert.equal(res.status, 200);
    const [[saved]] = await db.query('SELECT preferences FROM users WHERE id = ?', [userId]);
    const stored = typeof saved.preferences === 'string' ? JSON.parse(saved.preferences) : saved.preferences;
    assert.deepEqual(stored, { theme: 'dark', fontSize: 'large' });
  });

  test('as demais preferências continuam funcionando', async () => {
    const res = await call('PATCH', '/preferences', { preferences: { exportFormat: 'pdf', hideDoneDocs: true } });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.preferences, { exportFormat: 'pdf', hideDoneDocs: true });
  });

  // Antes cada pedido lia as preferências, mesclava e gravava: o segundo apagava o que o primeiro gravou.
  // A corrida depende do tempo: repetir algumas rodadas torna a falha previsível sem a correção.
  test('duas preferências salvas ao mesmo tempo ficam as duas', async () => {
    for (let round = 1; round <= 5; round += 1) {
      await savePreferences({});
      const responses = await Promise.all([
        call('PATCH', '/preferences', { preferences: { theme: 'dark' } }),
        call('PATCH', '/preferences', { preferences: { fontSize: 'large' } }),
        call('PATCH', '/preferences', { startPage: 'contratos' }),
      ]);
      assert.deepEqual(responses.map((res) => res.status), [200, 200, 200], `rodada ${round}`);
      const [[saved]] = await db.query('SELECT start_page, preferences FROM users WHERE id = ?', [userId]);
      const stored = typeof saved.preferences === 'string' ? JSON.parse(saved.preferences) : saved.preferences;
      assert.deepEqual(stored, { theme: 'dark', fontSize: 'large' }, `rodada ${round}: uma preferência se perdeu`);
      assert.equal(saved.start_page, 'contratos', `rodada ${round}: a página inicial se perdeu`);
    }
  });
});
