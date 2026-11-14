// Descoberta de usuários pelas variações do nome: o MySQL compara o nome do login pela collation da coluna
// (utf8mb4_0900_ai_ci), que ignora maiúsculas, acentos e caracteres invisíveis, mas NÃO ignora espaço no fim.
// O bloqueio simulado dos nomes inexistentes precisa juntar as mesmas variações, senão quem tenta entrar
// compara "bloqueia em joao, testa em joão" e descobre se o usuário existe.
// A proteção useTestDatabase vem primeiro: este processo só enxerga o BANCO DE TESTE (TEST_DB_NAME).
import { testDbSkip } from './helpers/useTestDatabase.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import authRouter, { USERNAME_COLLATION } from '../routes/auth.js';
import { readSettings } from '../routes/settings.js';

const PASSWORD = 'SenhaCerta#1';
// [nome usado para bloquear, variação testada depois]
const VARIANTS = {
  'maiúsculas e acentos': (name) => [name, name.toUpperCase().replace('JOAO', 'JOÃO')],
  'ß no lugar de ss': (name) => [`${name}_strasse`, `${name}_straße`],
  'caractere invisível': (name) => [name, name.replace('joao', 'jo​ao')],
  'espaço no fim': (name) => [name, `${name} `],
};
const realUsers = Object.keys(VARIANTS).map((label, index) => {
  const [username] = VARIANTS[label](`teste_var_joao_${index}`);
  return { id: `test-name-variant-${index}`, username, label, index };
});

async function skipReason() {
  if (testDbSkip) return testDbSkip;
  const settings = await readSettings();
  if (!settings.lockoutEnabled) return 'bloqueio por tentativas está desligado nas configurações';
  if (settings.lockoutAttempts >= 10) return 'limite de tentativas alto demais para o limitador do login';
  return null;
}
const reason = await skipReason();

describe('variações do nome no bloqueio', { skip: reason || false }, () => {
  let server;
  let baseUrl;
  let lockoutAttempts;
  let visitor = 0;

  const removeUsers = async () => {
    const ids = realUsers.map((user) => user.id);
    await db.query('DELETE FROM login_events WHERE user_id IN (?)', [ids]);
    await db.query('DELETE FROM users WHERE id IN (?)', [ids]);
  };

  before(async () => {
    ({ lockoutAttempts } = await readSettings());
    await removeUsers();
    const hash = await bcrypt.hash(PASSWORD, 4);
    await db.query(
      'INSERT INTO users (id, username, password_hash, role, first_access, password_changed_at) VALUES ?',
      [realUsers.map((user) => [user.id, user.username, hash, 'viewer', false, new Date()])]
    );
    const app = express();
    // Cada sequência simula um visitante próprio, para os limitadores por IP não interferirem.
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

  // Bloqueia `lockName` com senhas erradas e devolve o status de uma senha errada na `variant`.
  async function lockThenTry(lockName, variant) {
    visitor += 1;
    const headers = { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.77.0.${visitor}` };
    const login = (username) => fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers, body: JSON.stringify({ username, password: 'Errada#123' }) });
    for (let attempt = 0; attempt < lockoutAttempts; attempt += 1) await login(lockName);
    return (await login(variant)).status;
  }

  test('a chave do bloqueio simulado usa a collation de users.username', async () => {
    const [[column]] = await db.query(
      "SELECT COLLATION_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'username'"
    );
    assert.equal(column.name, USERNAME_COLLATION);
  });

  for (const [label, variantsOf] of Object.entries(VARIANTS)) {
    test(`${label}: nome inexistente responde igual a usuário real`, async () => {
      const index = Object.keys(VARIANTS).indexOf(label);
      const [realName, realVariant] = variantsOf(`teste_var_joao_${index}`);
      const [ghostName, ghostVariant] = variantsOf(`teste_fantasma_joao_${index}`);

      const realStatus = await lockThenTry(realName, realVariant);
      const ghostStatus = await lockThenTry(ghostName, ghostVariant);
      assert.equal(ghostStatus, realStatus, `real ${JSON.stringify(realVariant)} → ${realStatus}, inexistente ${JSON.stringify(ghostVariant)} → ${ghostStatus}`);
    });
  }
});
