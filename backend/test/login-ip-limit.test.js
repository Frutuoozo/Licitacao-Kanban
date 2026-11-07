// Limite por IP no login: trocar de nome a cada tentativa não pode escapar do limite por IP + usuário.
// A proteção useTestDatabase vem primeiro: este processo só enxerga o BANCO DE TESTE (TEST_DB_NAME).
import { testDbSkip } from './helpers/useTestDatabase.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import authRouter from '../routes/auth.js';

const FAILED_ATTEMPTS_ALLOWED = 30;
const PASSWORD = 'SenhaCerta#1';
const OFFICE_USERS = Array.from({ length: FAILED_ATTEMPTS_ALLOWED + 5 }, (_, index) => ({
  id: `test-ip-limit-${index}`,
  username: `teste_ip_limit_${index}`,
}));

describe('limite de tentativas por IP', { skip: testDbSkip || false }, () => {
  let server;
  let baseUrl;

  const removeUsers = async () => {
    const ids = OFFICE_USERS.map((user) => user.id);
    await db.query('DELETE FROM login_events WHERE user_id IN (?)', [ids]);
    await db.query('DELETE FROM users WHERE id IN (?)', [ids]);
  };

  before(async () => {
    await removeUsers();
    const hash = await bcrypt.hash(PASSWORD, 4);
    await db.query(
      'INSERT INTO users (id, username, password_hash, role, first_access, password_changed_at) VALUES ?',
      [OFFICE_USERS.map((user) => [user.id, user.username, hash, 'viewer', false, new Date()])]
    );
    const app = express();
    // Cada teste simula um visitante próprio pelo cabeçalho, para não dividir a contagem com os outros.
    app.set('trust proxy', true);
    app.use(express.json());
    app.use('/api/auth', authRouter);
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}/api/auth`;
  });

  after(async () => {
    server?.close();
    // O histórico de acessos é gravado sem bloquear a resposta: espera terminar antes de limpar.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await removeUsers();
    await db.end();
  });

  const post = (path, ip, body) => fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify(body),
  });
  const failLogins = (ip, prefix, count) => Promise.all(Array.from({ length: count }, (_, index) => (
    post('/login', ip, { username: `${prefix}_${index}`, password: 'Errada#123' })
  )));

  test('nomes aleatórios do mesmo IP são barrados depois do limite', async () => {
    const ip = '203.0.113.1';
    const responses = await failLogins(ip, 'aleatorio_a', FAILED_ATTEMPTS_ALLOWED);
    assert.deepEqual([...new Set(responses.map((res) => res.status))], [401]);

    const blocked = await post('/login', ip, { username: 'mais_um_nome', password: 'Errada#123' });
    assert.equal(blocked.status, 429);
    assert.deepEqual(await blocked.json(), { error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' });
  });

  test('o bloqueio também vale para o primeiro acesso', async () => {
    const ip = '203.0.113.2';
    await failLogins(ip, 'aleatorio_b', FAILED_ATTEMPTS_ALLOWED);

    const blocked = await post('/first-access', ip, { username: 'outro_nome', currentPassword: 'Errada#123', password: 'NovaSenha#2026' });
    assert.equal(blocked.status, 429);
  });

  test('tentativas de um IP não bloqueiam outro IP', async () => {
    await failLogins('203.0.113.3', 'aleatorio_c', FAILED_ATTEMPTS_ALLOWED + 1);

    const otherVisitor = await post('/login', '203.0.113.4', { username: 'outra_pessoa', password: 'Errada#123' });
    assert.equal(otherVisitor.status, 401);
  });

  // Vários colaboradores saem pelo mesmo IP do escritório: entrar com a senha certa não conta.
  test('logins corretos não contam para o limite', async () => {
    const ip = '203.0.113.5';
    for (const { username } of OFFICE_USERS) {
      const res = await post('/login', ip, { username, password: PASSWORD });
      assert.equal(res.status, 200, username);
    }

    const stillAllowed = await post('/login', ip, { username: 'digitou_errado', password: 'Errada#123' });
    assert.equal(stillAllowed.status, 401);
  });
});
