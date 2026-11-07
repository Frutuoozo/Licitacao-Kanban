// Teste de integração do bloqueio por tentativas inválidas: sobe o servidor de verdade (porta própria)
// contra o BANCO DE TESTE (TEST_DB_NAME, nunca o da aplicação) e usa usuários temporários, apagados no final.
// Sem banco de teste, ou com o bloqueio desligado/alto demais, os testes são pulados.
import { testDbSkip } from './helpers/useTestDatabase.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { readSettings } from '../routes/settings.js';

const PORT = 3995;
const BASE = `http://127.0.0.1:${PORT}`;
const BACKEND_DIR = fileURLToPath(new URL('..', import.meta.url));
// O limitador do login aceita 10 pedidos por IP + usuário em 15 min; cada teste usa no máximo 10.
const RATE_LIMIT = 10;

const USERS = {
  concurrent: { id: 'test-lockout-concurrent', username: 'teste_lockout_concorrente', password: 'SenhaCerta#1', firstAccess: false },
  firstAccess: { id: 'test-lockout-first', username: 'teste_lockout_primeiro', password: 'Temporaria#1', firstAccess: true },
  timing: { id: 'test-lockout-timing', username: 'teste_lockout_tempo', password: 'SenhaCerta#1', firstAccess: false },
};

async function skipReason() {
  if (testDbSkip) return testDbSkip;
  try {
    const settings = await readSettings();
    if (!settings.lockoutEnabled) return 'bloqueio por tentativas está desligado nas configurações';
    if (settings.lockoutAttempts >= RATE_LIMIT) return 'limite de tentativas alto demais para o limitador do login';
    return null;
  } catch (error) {
    return `banco indisponível (${error.code || error.message})`;
  }
}

const reason = await skipReason();
const { lockoutAttempts } = reason ? {} : await readSettings();

async function removeTestUsers() {
  const ids = Object.values(USERS).map((user) => user.id);
  await db.query('DELETE FROM login_events WHERE user_id IN (?)', [ids]);
  await db.query('DELETE FROM users WHERE id IN (?)', [ids]);
}

function post(path, body) {
  return fetch(`${BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

describe('bloqueio por tentativas inválidas', { skip: reason || false }, () => {
  let server;

  before(async () => {
    await removeTestUsers();
    for (const user of Object.values(USERS)) {
      await db.query(
        'INSERT INTO users (id, username, password_hash, role, first_access, password_changed_at) VALUES (?, ?, ?, ?, ?, NOW())',
        [user.id, user.username, await bcrypt.hash(user.password, 10), 'viewer', user.firstAccess]
      );
    }
    server = spawn(process.execPath, ['server.js'], { cwd: BACKEND_DIR, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('servidor de teste não subiu em 20s')), 20000);
      server.stdout.on('data', (chunk) => { if (String(chunk).includes('Server is running')) { clearTimeout(timer); resolve(); } });
      server.on('exit', (code) => { clearTimeout(timer); reject(new Error(`servidor de teste saiu com código ${code}`)); });
    });
  });

  after(async () => {
    server?.kill();
    await removeTestUsers();
    await db.end();
  });

  test('senhas erradas enviadas ao mesmo tempo bloqueiam a conta', async () => {
    const { username, password } = USERS.concurrent;
    // Bem mais que o limite, todas de uma vez: nenhuma pode se perder na contagem.
    const wrong = Array.from({ length: RATE_LIMIT - 1 }, () => post('/api/auth/login', { username, password: 'Errada#123' }));
    await Promise.all(wrong);

    const withCorrectPassword = await post('/api/auth/login', { username, password });
    assert.equal(withCorrectPassword.status, 423);
  });

  // Senha errada sempre demora pelo menos 300 ms: assim o tempo não revela se o usuário existe
  // (sem o piso, o usuário real fica ~2 ms mais lento por causa da gravação do contador).
  test('senha errada leva pelo menos 300 ms, exista ou não o usuário', async () => {
    for (const username of [USERS.timing.username, 'teste_lockout_inexistente']) {
      for (const path of ['/api/auth/login', '/api/auth/first-access']) {
        const startedAt = performance.now();
        const res = await post(path, { username, password: 'NovaSenha#2026', currentPassword: 'Errada#123' });
        const elapsed = performance.now() - startedAt;
        assert.equal(res.status, 401, `${path} ${username}`);
        assert.ok(elapsed >= 300, `${path} ${username}: respondeu em ${elapsed.toFixed(0)} ms`);
      }
    }
  });

  test('senha temporária errada no primeiro acesso conta para o bloqueio', async () => {
    const { username, password } = USERS.firstAccess;
    for (let attempt = 0; attempt < lockoutAttempts; attempt += 1) {
      const res = await post('/api/auth/first-access', { username, currentPassword: 'Errada#123', password: 'NovaSenha#2026' });
      assert.notEqual(res.status, 200);
    }

    const withCorrectPassword = await post('/api/auth/first-access', { username, currentPassword: password, password: 'NovaSenha#2026' });
    assert.equal(withCorrectPassword.status, 423);
  });
});
