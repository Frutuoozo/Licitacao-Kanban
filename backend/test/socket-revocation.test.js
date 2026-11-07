// Quando a sessão deixa de valer, o tempo real precisa cair na hora: um aparelho roubado ou um usuário excluído
// não pode continuar recebendo dados. Sobe o servidor de verdade contra o BANCO DE TESTE (TEST_DB_NAME) e usa
// o cliente real do Socket.IO, com usuários temporários apagados no final.
import { testDbSkip } from './helpers/useTestDatabase.js';
import { after, afterEach, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { io } from 'socket.io-client';
import db from '../db.js';

const PORT = 3997;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const BACKEND_DIR = fileURLToPath(new URL('..', import.meta.url));
const PASSWORD = 'SenhaCerta#1';
const NEW_PASSWORD = 'NovaSenha#2026';
// Tempo para um cliente derrubado tentar voltar algumas vezes (ele tenta a cada 300 ms).
const RECONNECT_WINDOW_MS = 1500;
const ID_PREFIX = 'test-socket-';

describe('tempo real ao encerrar a sessão', { skip: testDbSkip || false }, () => {
  let server;
  let hash;
  let userCount = 0;
  const clients = [];

  const removeUsers = async () => {
    await db.query('DELETE FROM login_events WHERE user_id LIKE ?', [`${ID_PREFIX}%`]);
    await db.query('DELETE FROM users WHERE id LIKE ?', [`${ID_PREFIX}%`]);
  };

  const createUser = async (role = 'editor') => {
    userCount += 1;
    const user = { id: `${ID_PREFIX}${userCount}`, username: `teste_socket_${userCount}` };
    await db.query(
      'INSERT INTO users (id, username, password_hash, role, first_access, password_changed_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [user.id, user.username, hash, role, false]
    );
    return user;
  };

  const sessionFrom = (response) => {
    const cookies = response.headers.getSetCookie();
    return {
      cookie: cookies.map((value) => value.split(';')[0]).join('; '),
      csrf: cookies.find((value) => value.startsWith('csrf_token=')).split(';')[0].split('=')[1],
    };
  };

  const login = async ({ username }) => {
    const res = await fetch(`${ORIGIN}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: PASSWORD }),
    });
    assert.equal(res.status, 200);
    return sessionFrom(res);
  };

  const call = async (method, path, session, body) => {
    const res = await fetch(`${ORIGIN}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: session.cookie, 'X-CSRF-Token': session.csrf },
      body: body ? JSON.stringify(body) : undefined,
    });
    assert.equal(res.status, 200, `${method} ${path}`);
    return res;
  };

  const connect = async (session) => {
    const client = io(ORIGIN, { extraHeaders: { Cookie: session.cookie }, reconnectionDelay: 300, reconnectionDelayMax: 300 });
    clients.push(client);
    await new Promise((resolve, reject) => {
      client.once('connect', resolve);
      client.once('connect_error', reject);
    });
    return client;
  };

  // Liga dois aparelhos do mesmo usuário.
  const twoDevices = async (user) => {
    const sessions = [await login(user), await login(user)];
    return { sessions, devices: [await connect(sessions[0]), await connect(sessions[1])] };
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

  afterEach(() => {
    clients.splice(0).forEach((client) => client.close());
  });

  after(async () => {
    server?.removeAllListeners('exit');
    server?.kill();
    await sleep(200);
    await removeUsers();
    await db.end();
  });

  test('encerrar outras sessões derruba o outro aparelho, e este volta com a sessão nova', async () => {
    const user = await createUser();
    const { sessions: [thisSession], devices: [thisDevice, otherDevice] } = await twoDevices(user);
    const thisDeviceId = thisDevice.id;

    const res = await call('POST', '/api/auth/sessions/revoke-others', thisSession);
    // O navegador guarda o cookie novo: é com ele que este aparelho reconecta.
    thisDevice.io.opts.extraHeaders = { Cookie: sessionFrom(res).cookie };
    await sleep(RECONNECT_WINDOW_MS);

    assert.equal(otherDevice.connected, false, 'o outro aparelho deveria ter caído e não voltado');
    assert.equal(thisDevice.connected, true, 'este aparelho deveria ter reconectado');
    assert.notEqual(thisDevice.id, thisDeviceId, 'este aparelho deveria estar numa conexão nova');
  });

  test('trocar a senha derruba todos os aparelhos', async () => {
    const user = await createUser();
    const { sessions: [session], devices } = await twoDevices(user);

    await call('PATCH', '/api/auth/password', session, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
    await sleep(RECONNECT_WINDOW_MS);

    assert.deepEqual(devices.map((device) => device.connected), [false, false]);
  });

  test('o administrador redefinir a senha derruba os aparelhos do usuário', async () => {
    const admin = await login(await createUser('admin'));
    const user = await createUser();
    const { devices } = await twoDevices(user);

    await call('PATCH', `/api/admin/users/${user.id}/password`, admin, { password: NEW_PASSWORD });
    await sleep(RECONNECT_WINDOW_MS);

    assert.deepEqual(devices.map((device) => device.connected), [false, false]);
  });

  test('o administrador excluir o usuário derruba os aparelhos dele', async () => {
    const admin = await login(await createUser('admin'));
    const user = await createUser();
    const { devices } = await twoDevices(user);

    await call('DELETE', `/api/admin/users/${user.id}`, admin);
    await sleep(RECONNECT_WINDOW_MS);

    assert.deepEqual(devices.map((device) => device.connected), [false, false]);
  });

  test('excluir a própria conta derruba todos os aparelhos', async () => {
    const user = await createUser();
    const { sessions: [session], devices } = await twoDevices(user);

    await call('DELETE', '/api/auth/account', session, { password: PASSWORD });
    await sleep(RECONNECT_WINDOW_MS);

    assert.deepEqual(devices.map((device) => device.connected), [false, false]);
  });

  test('encerrar a sessão de um usuário não afeta a conexão de outro', async () => {
    const bystanderDevice = await connect(await login(await createUser()));
    const bystanderId = bystanderDevice.id;
    const user = await createUser();
    const { sessions: [session] } = await twoDevices(user);

    await call('POST', '/api/auth/sessions/revoke-others', session);
    await sleep(RECONNECT_WINDOW_MS);

    assert.equal(bystanderDevice.connected, true);
    assert.equal(bystanderDevice.id, bystanderId, 'a conexão de quem não tem nada a ver não deveria ter sido refeita');
  });
});
