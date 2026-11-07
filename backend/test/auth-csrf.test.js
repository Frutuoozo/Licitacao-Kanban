// As rotas da própria conta precisam do token CSRF, e o cookie de login usa SameSite=Lax em produção: um
// site malicioso não consegue agir em nome de quem está logado. Sobe o servidor de verdade em modo produção,
// contra o BANCO DE TESTE (TEST_DB_NAME), com um usuário temporário apagado no final.
import { testDbSkip } from './helpers/useTestDatabase.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import db from '../db.js';

const PORT = 3996;
const BASE = `http://127.0.0.1:${PORT}/api/auth`;
const BACKEND_DIR = fileURLToPath(new URL('..', import.meta.url));
const USER = { id: 'test-auth-csrf', username: 'teste_auth_csrf', password: 'SenhaCerta#1' };

describe('CSRF nas rotas da conta', { skip: testDbSkip || false }, () => {
  let server;
  let setCookies;
  let cookie;
  let csrf;

  const removeUser = async () => {
    await db.query('DELETE FROM login_events WHERE user_id = ?', [USER.id]);
    await db.query('DELETE FROM users WHERE id = ?', [USER.id]);
  };
  const account = async () => {
    const [rows] = await db.query('SELECT session_version, preferences, password_hash FROM users WHERE id = ?', [USER.id]);
    return rows[0];
  };
  const request = (method, path, { body, token } = {}) => fetch(`${BASE}${path}`, {
    method,
    headers: { Cookie: cookie, 'Content-Type': 'application/json', ...(token ? { 'X-CSRF-Token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

  before(async () => {
    await removeUser();
    await db.query(
      'INSERT INTO users (id, username, password_hash, role, first_access, password_changed_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [USER.id, USER.username, await bcrypt.hash(USER.password, 4), 'editor', false]
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

    const login = await fetch(`${BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: USER.username, password: USER.password }),
    });
    assert.equal(login.status, 200);
    setCookies = login.headers.getSetCookie();
    cookie = setCookies.map((value) => value.split(';')[0]).join('; ');
    csrf = setCookies.find((value) => value.startsWith('csrf_token=')).split(';')[0].split('=')[1];
  });

  after(async () => {
    server?.removeAllListeners('exit');
    server?.kill();
    await new Promise((resolve) => setTimeout(resolve, 200));
    await removeUser();
    await db.end();
  });

  test('em produção, os cookies de sessão usam SameSite=Lax e Secure', () => {
    assert.equal(setCookies.length, 2);
    for (const value of setCookies) {
      assert.match(value, /SameSite=Lax/);
      assert.match(value, /Secure/);
    }
  });

  test('encerrar outras sessões sem o token é recusado e não encerra nada', async () => {
    const before = await account();
    const res = await request('POST', '/sessions/revoke-others');
    assert.equal(res.status, 403);
    assert.equal((await account()).session_version, before.session_version);
  });

  test('alterar preferências sem o token é recusado e não altera nada', async () => {
    const before = await account();
    const res = await request('PATCH', '/preferences', { body: { preferences: { theme: 'dark' } } });
    assert.equal(res.status, 403);
    assert.equal((await account()).preferences, before.preferences);
  });

  test('trocar a senha sem o token é recusado e não altera nada', async () => {
    const before = await account();
    const res = await request('PATCH', '/password', { body: { currentPassword: USER.password, newPassword: 'NovaSenha#2026' } });
    assert.equal(res.status, 403);
    assert.equal((await account()).password_hash, before.password_hash);
  });

  test('excluir a conta sem o token é recusado e a conta continua', async () => {
    const res = await request('DELETE', '/account', { body: { password: USER.password } });
    assert.equal(res.status, 403);
    assert.ok(await account());
  });

  test('token errado também é recusado', async () => {
    const res = await request('POST', '/sessions/revoke-others', { token: 'token-errado' });
    assert.equal(res.status, 403);
  });

  test('com o token certo, a conta continua funcionando', async () => {
    const preferences = await request('PATCH', '/preferences', { token: csrf, body: { preferences: { theme: 'dark' } } });
    assert.equal(preferences.status, 200);

    const versionBefore = (await account()).session_version;
    const revoke = await request('POST', '/sessions/revoke-others', { token: csrf });
    assert.equal(revoke.status, 200);
    assert.equal((await account()).session_version, versionBefore + 1);
  });

  // Sair continua sem token: o app também sai quando a sessão já não vale mais, e aí não há token.
  test('sair continua funcionando sem o token', async () => {
    const res = await fetch(`${BASE}/logout`, { method: 'POST' });
    assert.equal(res.status, 200);
  });
});
