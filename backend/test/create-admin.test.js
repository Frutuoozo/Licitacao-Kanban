// Criação de administrador: só pelo script no servidor (scripts/create-admin.js), nunca por rota aberta.
// Os testes do script usam o BANCO DE TESTE (TEST_DB_NAME, nunca o da aplicação) e um usuário
// temporário, apagado no final; sem banco de teste, eles são pulados.
import { testDbSkip } from './helpers/useTestDatabase.js';
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import express from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import authRouter from '../routes/auth.js';

const BACKEND_DIR = fileURLToPath(new URL('..', import.meta.url));
const USERNAME = 'teste_admin_cli_tmp';

const runScript = (...args) => spawnSync(process.execPath, ['scripts/create-admin.js', ...args], { cwd: BACKEND_DIR, encoding: 'utf8' });
const removeTestUser = async () => {
  const [rows] = await db.query('SELECT id FROM users WHERE username = ?', [USERNAME]);
  if (rows.length) await db.query('DELETE FROM login_events WHERE user_id IN (?)', [rows.map((row) => row.id)]);
  await db.query('DELETE FROM users WHERE username = ?', [USERNAME]);
};

const dbReason = testDbSkip;

after(async () => {
  if (!dbReason) await removeTestUser();
  await db.end();
});

test('a rota pública /setup-admin não existe mais', async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  const server = app.listen(0);
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/setup-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'invasor', password: 'SenhaForte#2026' }),
    });
    assert.equal(res.status, 404);
  } finally {
    server.close();
  }
});

test('o script exige o nome do usuário', () => {
  const result = runScript();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Uso: node scripts\/create-admin\.js <usuario>/);
});

describe('script create-admin', { skip: dbReason || false }, () => {
  test('cria um administrador com senha temporária e primeiro acesso pendente', async () => {
    await removeTestUser();
    const result = runScript(USERNAME);
    assert.equal(result.status, 0, result.stderr);

    const temporaryPassword = result.stdout.match(/Senha temporária: (\S+)/)?.[1];
    assert.ok(temporaryPassword, `senha não encontrada na saída: ${result.stdout}`);

    const [rows] = await db.query('SELECT role, first_access, password_hash FROM users WHERE username = ?', [USERNAME]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].role, 'admin');
    assert.equal(rows[0].first_access, 1);
    assert.equal(await bcrypt.compare(temporaryPassword, rows[0].password_hash), true);
  });

  test('recusa um nome de usuário que já existe', async () => {
    const result = runScript(USERNAME);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /já existe/);
    const [rows] = await db.query('SELECT COUNT(*) AS n FROM users WHERE username = ?', [USERNAME]);
    assert.equal(rows[0].n, 1);
  });
});
