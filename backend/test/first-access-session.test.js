// Trocar a senha pelo primeiro acesso (senha expirada ou redefinida) precisa encerrar as sessões abertas com a
// senha antiga: um token roubado não pode continuar valendo. Sobe o servidor de verdade contra o BANCO DE TESTE
// (TEST_DB_NAME), com um usuário temporário apagado no final.
import { testDbSkip } from './helpers/useTestDatabase.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { io } from 'socket.io-client';
import db from '../db.js';

const PORT = 3998;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const BACKEND_DIR = fileURLToPath(new URL('..', import.meta.url));
const USER = { id: 'test-first-access-session', username: 'teste_first_access_sessao' };
const OLD_PASSWORD = 'SenhaAntiga#1';
const NEW_PASSWORD = 'NovaSenha#2026';

const cookieFrom = (response) => response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');
const me = (cookie) => fetch(`${ORIGIN}/api/auth/me`, { headers: { Cookie: cookie } }).then((res) => res.status);

describe('primeiro acesso encerra as sessões antigas', { skip: testDbSkip || false }, () => {
  let server;
  let oldSession;
  let oldDevice;
  let newSession;
  let versionBefore;

  const removeUser = async () => {
    await db.query('DELETE FROM login_events WHERE user_id = ?', [USER.id]);
    await db.query('DELETE FROM users WHERE id = ?', [USER.id]);
  };
  const version = async () => {
    const [[row]] = await db.query('SELECT session_version FROM users WHERE id = ?', [USER.id]);
    return row.session_version;
  };

  before(async () => {
    await removeUser();
    await db.query(
      'INSERT INTO users (id, username, password_hash, role, first_access, password_changed_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [USER.id, USER.username, await bcrypt.hash(OLD_PASSWORD, 4), 'editor', false]
    );
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

    // Um aparelho já logado com a senha antiga, com o tempo real conectado.
    const login = await fetch(`${ORIGIN}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: USER.username, password: OLD_PASSWORD }),
    });
    assert.equal(login.status, 200);
    oldSession = cookieFrom(login);
    oldDevice = io(ORIGIN, { extraHeaders: { Cookie: oldSession }, reconnectionDelay: 300, reconnectionDelayMax: 300 });
    await new Promise((resolve, reject) => {
      oldDevice.once('connect', resolve);
      oldDevice.once('connect_error', reject);
    });
    assert.equal(await me(oldSession), 200);

    // A senha vence: é o mesmo que o login faz ao encontrar a senha expirada.
    await db.query('UPDATE users SET first_access = TRUE WHERE id = ?', [USER.id]);
    versionBefore = await version();

    const firstAccess = await fetch(`${ORIGIN}/api/auth/first-access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: USER.username, currentPassword: OLD_PASSWORD, password: NEW_PASSWORD }),
    });
    assert.equal(firstAccess.status, 200);
    newSession = cookieFrom(firstAccess);
    await sleep(1500);
  });

  after(async () => {
    oldDevice?.close();
    server?.removeAllListeners('exit');
    server?.kill();
    await sleep(200);
    await removeUser();
    await db.end();
  });

  test('a sessão aberta com a senha antiga deixa de valer', async () => {
    assert.equal(await me(oldSession), 401);
  });

  test('o tempo real do aparelho antigo cai e não volta', () => {
    assert.equal(oldDevice.connected, false);
  });

  test('quem trocou a senha continua logado neste aparelho', async () => {
    assert.equal(await me(newSession), 200);
  });

  test('a versão da sessão sobe uma vez só', async () => {
    assert.equal(await version(), versionBefore + 1);
  });
});
