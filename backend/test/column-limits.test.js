// Os limites de tamanho do código acompanham as colunas do banco. Antes, alguns aceitavam mais do que a coluna
// guarda (120 contra VARCHAR(100)) e o texto longo virava erro 500 do banco em vez de uma mensagem.
// A proteção useTestDatabase vem primeiro: este processo só enxerga o BANCO DE TESTE (TEST_DB_NAME).
import { testDbSkip } from './helpers/useTestDatabase.js';
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import db from '../db.js';
import processesRouter from '../routes/processes.js';
import templatesRouter from '../routes/templates.js';
import modalitiesRouter from '../routes/contractModalities.js';
import contractsRouter from '../routes/contracts.js';
import { migrateDemandPriority, migrateDemands } from '../demandsMigration.js';
import { sanitizeProcessDoc } from '../validation.js';

const PREFIX = 'teste-limite-';
let server;
let baseUrl;

const assertTestDatabase = async () => {
  const [[{ name }]] = await db.query('SELECT DATABASE() AS name');
  assert.ok(String(name).endsWith('_test'), `banco inesperado nos testes: ${name}`);
};

const cleanup = async () => {
  await db.query('DELETE pi FROM process_items pi JOIN processes p ON p.id = pi.process_id WHERE p.title LIKE ?', [`${PREFIX}%`]);
  await db.query('DELETE FROM processes WHERE title LIKE ?', [`${PREFIX}%`]);
  await db.query('DELETE FROM contract_modalities WHERE name LIKE ?', [`${PREFIX}%`]);
  const [contracts] = await db.query('SELECT id FROM contracts WHERE process_name LIKE ?', [`${PREFIX}%`]);
  if (contracts.length > 0) {
    const ids = contracts.map((c) => c.id);
    await db.query('DELETE FROM contract_events WHERE contract_id IN (?)', [ids]);
    await db.query('DELETE FROM contracts WHERE id IN (?)', [ids]);
  }
};

before(async () => {
  if (testDbSkip) return;
  await assertTestDatabase();
  await migrateDemands(db);
  await migrateDemandPriority(db);
  const app = express();
  app.use(express.json());
  // A autenticação não é o que está em teste: admin, com um id por pedido para o limite de ações não interferir.
  app.use((req, _res, next) => { req.userId = crypto.randomUUID(); req.userRole = 'admin'; req.userName = 'teste'; next(); });
  app.use('/api/processes', processesRouter);
  app.use('/api/templates', templatesRouter);
  app.use('/api/contract-modalities', modalitiesRouter);
  app.use('/api/contracts', contractsRouter);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  if (!testDbSkip) await cleanup();
  server?.close();
  await db.end();
});

const call = async (method, path, body) => {
  const res = await fetch(`${baseUrl}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
};
// Texto com o prefixo de limpeza, completado até o tamanho pedido.
const text = (length) => `${PREFIX}${'x'.repeat(length - PREFIX.length)}`;
const digits = (length) => '1'.repeat(length);
const process = (over = {}) => ({
  id: crypto.randomUUID(), title: `${PREFIX}${crypto.randomUUID().slice(0, 8)}`, processNumber: '001/2026', setor: 'Maria',
  type: 'Compras', typeColor: '#2563eb', dueDate: '2030-01-15', status: 'active', docs: [], ...over,
});
const contract = (over = {}) => ({
  processName: `${PREFIX}${crypto.randomUUID().slice(0, 8)}`, objectDescription: 'Objeto', processNumber: '001/2026', contractValue: 10,
  dueDate: '2030-01-01', fiscalEffective: 'Maria', modality: 'Pregão Eletrônico', lawType: 'new', ...over,
});

describe('limites de tamanho iguais aos das colunas', { skip: testDbSkip || false }, () => {
  beforeEach(async () => {
    await assertTestDatabase();
    await cleanup();
  });

  test('número do processo: 100 caracteres grava, 101 é recusado com mensagem', async () => {
    assert.equal((await call('POST', '/processes', process({ processNumber: digits(100) }))).status, 201);
    const res = await call('POST', '/processes', process({ processNumber: digits(101) }));
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Número do processo muito longo');
  });

  test('número do processo ao iniciar a demanda: 101 é recusado com mensagem', async () => {
    const p = process({ status: 'pending', processNumber: '' });
    assert.equal((await call('POST', '/processes', p)).status, 201);
    const res = await call('PUT', `/processes/${p.id}/start`, { processNumber: digits(101) });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Número do processo muito longo');
  });

  test('tipo do processo: 100 caracteres grava, 101 é recusado com mensagem', async () => {
    assert.equal((await call('POST', '/processes', process({ type: 'T'.repeat(100) }))).status, 201);
    const res = await call('POST', '/processes', process({ type: 'T'.repeat(101) }));
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Tipo muito longo');
  });

  test('nome do modelo: 101 caracteres é recusado com mensagem', async () => {
    const res = await call('PUT', '/templates', { ['M'.repeat(101)]: { items: [] } });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Nome de template inválido');
  });

  test('nome da modalidade: 100 caracteres grava, 101 é recusado com mensagem (criar e renomear)', async () => {
    assert.equal((await call('POST', '/contract-modalities', { name: text(100) })).status, 200);
    assert.equal((await call('POST', '/contract-modalities', { name: text(101) })).status, 400);
    const [[saved]] = await db.query('SELECT id FROM contract_modalities WHERE name = ?', [text(100)]);
    assert.equal((await call('PUT', `/contract-modalities/${saved.id}`, { name: text(101) })).status, 400);
  });

  // As colunas do contrato são maiores (VARCHAR(120)): ali o limite continua 120.
  test('contrato continua aceitando número do processo e modalidade com 120 caracteres', async () => {
    const res = await call('POST', '/contracts', contract({ processNumber: digits(120), modality: 'M'.repeat(120) }));
    assert.equal(res.status, 201);
    assert.equal((await call('POST', '/contracts', contract({ processNumber: digits(121) }))).status, 400);
    assert.equal((await call('POST', '/contracts', contract({ modality: 'M'.repeat(121) }))).status, 400);
  });

  // process_items.type só aceita doc ou phase: outro tipo virava erro 500 ao gravar.
  test('item de processo com tipo desconhecido não chega ao banco', async () => {
    assert.equal(sanitizeProcessDoc({ id: 'a', type: 'outro', name: 'Termo' }), null);
    const p = process({ docs: [{ id: crypto.randomUUID(), type: 'outro', name: 'Termo', done: false, bgColor: null }] });
    assert.equal((await call('POST', '/processes', p)).status, 201);
  });
});
