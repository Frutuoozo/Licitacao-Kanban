// Duas ações ao mesmo tempo não podem deixar o sistema sem administrador: cada uma, sozinha, vê que ainda
// sobra outro admin e segue em frente. Sobe o servidor de verdade contra o BANCO DE TESTE (TEST_DB_NAME),
// cria dois admins temporários por rodada e dispara as duas ações juntas. Usuários apagados no final.
import { testDbSkip } from './helpers/useTestDatabase.js';
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import db from '../db.js';

const PORT = 3994; // cada arquivo com a sua porta (auth-csrf usa 3996)
const ORIGIN = `http://127.0.0.1:${PORT}`;
const BACKEND_DIR = fileURLToPath(new URL('..', import.meta.url));
const PASSWORD = 'SenhaCerta#1';
const ID_PREFIX = 'test-lastadmin-';
// A corrida depende do tempo: repetir algumas rodadas torna a falha previsível sem a correção.
const ROUNDS = 5;

describe('o último administrador', { skip: testDbSkip || false }, () => {
  let server;
  let hash;
  let userCount = 0;

  const removeUsers = async () => {
    await db.query('DELETE FROM login_events WHERE user_id LIKE ?', [`${ID_PREFIX}%`]);
    await db.query('DELETE FROM users WHERE id LIKE ?', [`${ID_PREFIX}%`]);
  };

  const countAdmins = async () => {
    const [rows] = await db.query("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'");
    return Number(rows[0].c);
  };

  const createAdmin = async () => {
    userCount += 1;
    const user = { id: `${ID_PREFIX}${userCount}`, username: `teste_lastadmin_${userCount}` };
    await db.query(
      'INSERT INTO users (id, username, password_hash, role, first_access, password_changed_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [user.id, user.username, hash, 'admin', false]
    );
    return user;
  };

  const login = async ({ username }) => {
    const res = await fetch(`${ORIGIN}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: PASSWORD }),
    });
    assert.equal(res.status, 200);
    const cookies = res.headers.getSetCookie();
    return {
      cookie: cookies.map((value) => value.split(';')[0]).join('; '),
      csrf: cookies.find((value) => value.startsWith('csrf_token=')).split(';')[0].split('=')[1],
    };
  };

  const call = (method, path, session, body) => fetch(`${ORIGIN}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: session.cookie, 'X-CSRF-Token': session.csrf },
    body: body ? JSON.stringify(body) : undefined,
  });

  // Uma das duas ações é recusada com a mensagem de regra, nunca com erro do servidor (ex.: deadlock).
  const assertNoServerError = (responses, round) => {
    const statuses = responses.map((res) => res.status);
    assert.ok(statuses.every((status) => status < 500), `rodada ${round}: respostas ${statuses.join(', ')}`);
  };

  // Dois admins, cada um com a sua sessão; os únicos admins do banco de teste.
  const twoAdmins = async () => {
    const a = await createAdmin();
    const b = await createAdmin();
    return [{ ...a, session: await login(a) }, { ...b, session: await login(b) }];
  };

  before(async () => {
    await removeUsers();
    hash = await bcrypt.hash(PASSWORD, 4);
    server = spawn(process.execPath, ['server.js'], {
      cwd: BACKEND_DIR,
      env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(48), FRONTEND_URL: 'https://site.example' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('servidor de teste não subiu em 20s')), 20000);
      server.stdout.on('data', (chunk) => { if (String(chunk).includes('Server is running')) { clearTimeout(timer); resolve(); } });
      server.on('exit', (code) => { clearTimeout(timer); reject(new Error(`servidor de teste saiu com código ${code}`)); });
    });
  });

  beforeEach(async () => {
    await removeUsers();
    // As contas vêm só deste teste; se o banco de teste tiver outro admin, a corrida não zeraria nada.
    assert.equal(await countAdmins(), 0, 'o banco de teste já tem administradores de fora deste teste');
  });

  after(async () => {
    server?.removeAllListeners('exit');
    server?.kill();
    await sleep(200);
    await removeUsers();
    await db.end();
  });

  test('dois admins excluindo um ao outro ao mesmo tempo deixam um admin', async () => {
    for (let round = 1; round <= ROUNDS; round += 1) {
      await removeUsers();
      const [a, b] = await twoAdmins();
      const responses = await Promise.all([
        call('DELETE', `/api/admin/users/${b.id}`, a.session),
        call('DELETE', `/api/admin/users/${a.id}`, b.session),
      ]);
      assert.equal(await countAdmins(), 1, `rodada ${round}: deveria sobrar exatamente um admin`);
      assertNoServerError(responses, round);
    }
  });

  test('dois admins rebaixando um ao outro ao mesmo tempo deixam um admin', async () => {
    for (let round = 1; round <= ROUNDS; round += 1) {
      await removeUsers();
      const [a, b] = await twoAdmins();
      const responses = await Promise.all([
        call('PATCH', `/api/admin/users/${b.id}`, a.session, { role: 'editor' }),
        call('PATCH', `/api/admin/users/${a.id}`, b.session, { role: 'editor' }),
      ]);
      assert.equal(await countAdmins(), 1, `rodada ${round}: deveria sobrar exatamente um admin`);
      assertNoServerError(responses, round);
    }
  });

  test('dois admins excluindo a própria conta ao mesmo tempo deixam um admin', async () => {
    for (let round = 1; round <= ROUNDS; round += 1) {
      await removeUsers();
      const [a, b] = await twoAdmins();
      const responses = await Promise.all([
        call('DELETE', '/api/auth/account', a.session, { password: PASSWORD }),
        call('DELETE', '/api/auth/account', b.session, { password: PASSWORD }),
      ]);
      assert.equal(await countAdmins(), 1, `rodada ${round}: deveria sobrar exatamente um admin`);
      assertNoServerError(responses, round);
    }
  });

  test('um admin excluindo a própria conta enquanto rebaixa o outro deixa um admin', async () => {
    for (let round = 1; round <= ROUNDS; round += 1) {
      await removeUsers();
      const [a, b] = await twoAdmins();
      const responses = await Promise.all([
        call('DELETE', '/api/auth/account', a.session, { password: PASSWORD }),
        call('PATCH', `/api/admin/users/${b.id}`, a.session, { role: 'viewer' }),
      ]);
      assert.equal(await countAdmins(), 1, `rodada ${round}: deveria sobrar exatamente um admin`);
      assertNoServerError(responses, round);
    }
  });

  test('o único admin não consegue excluir a própria conta nem ser rebaixado', async () => {
    const admin = await createAdmin();
    const session = await login(admin);

    const removed = await call('DELETE', '/api/auth/account', session, { password: PASSWORD });
    assert.equal(removed.status, 400);
    assert.equal((await removed.json()).error, 'Não é possível excluir o último administrador');

    const demoted = await call('PATCH', `/api/admin/users/${admin.id}`, session, { role: 'editor' });
    assert.equal(demoted.status, 400);
    assert.equal((await demoted.json()).error, 'Deve existir pelo menos um administrador');

    assert.equal(await countAdmins(), 1);
  });
});
