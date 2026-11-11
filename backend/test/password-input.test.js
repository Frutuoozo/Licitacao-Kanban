// Senha enviada como número, lista ou objeto: o bcrypt lança erro com qualquer coisa que não seja texto, e a
// troca de senha e a exclusão de conta respondiam 500. Precisam responder com mensagem e não mudar nada.
// A proteção useTestDatabase vem primeiro: este processo só enxerga o BANCO DE TESTE (TEST_DB_NAME).
import { testDbSkip } from './helpers/useTestDatabase.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import authRouter from '../routes/auth.js';
import { getJwtSecret } from '../security.js';

const userId = crypto.randomUUID();
const CSRF_TOKEN = 'token-de-teste';
const PASSWORD = 'SenhaCerta#1';
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
    [userId, `senha-${userId}`, await bcrypt.hash(PASSWORD, 4), 'editor', 0]
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
    await db.query('DELETE FROM login_events WHERE user_id = ?', [userId]);
    await db.query('DELETE FROM users WHERE id = ?', [userId]);
  }
  await db.end();
});

const call = async (method, path, body) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', cookie, 'X-CSRF-Token': CSRF_TOKEN },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const storedHash = async () => (await db.query('SELECT password_hash FROM users WHERE id = ?', [userId]))[0][0]?.password_hash;

describe('senha que não é texto', { skip: testDbSkip || false }, () => {
  for (const [label, value] of [['número', 12345678], ['objeto', { a: 1 }]]) {
    test(`troca de senha com a senha atual em ${label} é recusada com mensagem`, async () => {
      const before = await storedHash();
      const res = await call('PATCH', '/password', { currentPassword: value, newPassword: 'NovaSenha#2026' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Informe senha atual e nova senha');
      assert.equal(await storedHash(), before);
    });

    test(`excluir a conta com a senha em ${label} é recusado com mensagem`, async () => {
      const res = await call('DELETE', '/account', { password: value });
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Informe sua senha para confirmar');
      assert.ok(await storedHash(), 'a conta não pode ter sido excluída');
    });
  }
});
