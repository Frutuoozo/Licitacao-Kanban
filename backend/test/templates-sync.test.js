// Salvar os modelos sincroniza os itens dos processos ativos e pendentes de cada tipo. Isso não pode apagar
// itens de quem não tem modelo, deixar de sincronizar por causa de espaços no nome, virar erro 500 com item
// inválido, nem desfazer um item marcado por outra pessoa no mesmo instante.
// A proteção useTestDatabase vem primeiro: este processo só enxerga o BANCO DE TESTE (TEST_DB_NAME).
import { testDbSkip } from './helpers/useTestDatabase.js';
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import db from '../db.js';
import processesRouter from '../routes/processes.js';
import templatesRouter from '../routes/templates.js';
import { migrateDemandPriority, migrateDemands } from '../demandsMigration.js';

const TITLE_PREFIX = 'teste-modelos-';
let server;
let baseUrl;

const assertTestDatabase = async () => {
  const [[{ name }]] = await db.query('SELECT DATABASE() AS name');
  assert.ok(String(name).endsWith('_test'), `banco inesperado nos testes: ${name}`);
};

const removeProcesses = async () => {
  await db.query('DELETE pi FROM process_items pi JOIN processes p ON p.id = pi.process_id WHERE p.title LIKE ?', [`${TITLE_PREFIX}%`]);
  await db.query('DELETE FROM processes WHERE title LIKE ?', [`${TITLE_PREFIX}%`]);
};

before(async () => {
  if (testDbSkip) return;
  await assertTestDatabase();
  await migrateDemands(db);
  await migrateDemandPriority(db);
  const app = express();
  app.use(express.json());
  // A autenticação não é o que está em teste: admin, com um id por pedido para o limite de ações não interferir.
  app.use((req, _res, next) => { req.userId = crypto.randomUUID(); req.userRole = 'admin'; next(); });
  app.use('/api/processes', processesRouter);
  app.use('/api/templates', templatesRouter);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  if (!testDbSkip) await removeProcesses();
  server?.close();
  await db.end();
});

const call = async (method, path, body) => {
  const res = await fetch(`${baseUrl}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const doc = (name, done = false) => ({ id: crypto.randomUUID(), type: 'doc', name, done, bgColor: null });
const createProcess = async (type, docs) => {
  const p = {
    id: crypto.randomUUID(), title: `${TITLE_PREFIX}${crypto.randomUUID().slice(0, 8)}`, processNumber: '001/2026', setor: 'Maria',
    type, typeColor: '#2563eb', dueDate: '2030-01-15', status: 'active', docs,
  };
  assert.equal((await call('POST', '/processes', p)).status, 201);
  return p;
};
const items = async (id) => (await db.query('SELECT name, is_done FROM process_items WHERE process_id = ? ORDER BY order_index', [id]))[0]
  .map((i) => ({ name: i.name, done: Boolean(i.is_done) }));

describe('salvar modelos e os processos', { skip: testDbSkip || false }, () => {
  beforeEach(async () => {
    await assertTestDatabase();
    await removeProcesses();
  });

  // templates['constructor'] devolvia uma função do próprio JavaScript, tratada como modelo sem itens.
  for (const type of ['constructor', 'toString']) {
    test(`processo do tipo "${type}", sem modelo, mantém os itens`, async () => {
      const p = await createProcess(type, [doc('Termo'), doc('Edital')]);
      assert.equal((await call('PUT', '/templates', { Compras: { items: ['Termo'] } })).status, 200);
      assert.deepEqual((await items(p.id)).map((i) => i.name), ['Termo', 'Edital']);
    });
  }

  test('modelo salvo com espaços nas pontas do nome sincroniza os processos do tipo', async () => {
    assert.equal((await call('PUT', '/templates', { Compras: { items: ['Rascunho'] } })).status, 200);
    const p = await createProcess('Compras', [doc('Termo')]);
    assert.equal((await call('PUT', '/templates', { ' Compras ': { items: ['Termo', 'Contrato'] } })).status, 200);
    assert.deepEqual((await items(p.id)).map((i) => i.name), ['Termo', 'Contrato']);
  });

  const invalidItems = {
    'itens que não são uma lista': 'Termo',
    'item de tipo desconhecido': [{ type: 'outro', name: 'Termo' }],
    'item sem nome': [{ type: 'doc', name: '  ' }],
    'item com nome longo demais': ['x'.repeat(256)],
    'item que não é texto nem objeto': [42],
    'item com cor inválida': [{ type: 'doc', name: 'Termo', bgColor: 'vermelho' }],
  };
  for (const [label, value] of Object.entries(invalidItems)) {
    test(`${label} é recusado com mensagem (400) e nada muda`, async () => {
      const p = await createProcess('Compras', [doc('Termo')]);
      const res = await call('PUT', '/templates', { Compras: { items: value } });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /^Ite(m|ns) inválidos? no modelo Compras\.$/);
      assert.deepEqual((await items(p.id)).map((i) => i.name), ['Termo']);
    });
  }

  test('item marcado ao mesmo tempo em que os modelos são salvos continua marcado', async () => {
    for (let round = 1; round <= 5; round += 1) {
      // O modelo muda a cada rodada: só modelo alterado regrava os itens, e é essa regravação que está em teste.
      assert.equal((await call('PUT', '/templates', { Compras: { items: ['Rascunho'] } })).status, 200);
      const p = await createProcess('Compras', [doc('Termo'), doc('Edital')]);
      const responses = await Promise.all([
        call('PUT', `/processes/${p.id}/items`, { docs: [doc('Termo', true), doc('Edital')] }),
        call('PUT', '/templates', { Compras: { items: ['Termo', 'Edital'] } }),
      ]);
      assert.deepEqual(responses.map((r) => r.status), [200, 200], `rodada ${round}`);
      assert.deepEqual(await items(p.id), [{ name: 'Termo', done: true }, { name: 'Edital', done: false }], `rodada ${round}: a marcação se perdeu`);
    }
  });

  // Salvar regravava os itens de todos os processos, mesmo de modelos que não mudaram: era lento e desfazia
  // os ajustes feitos num processo só (ex.: um documento a mais).
  const itemIds = async (id) => (await db.query('SELECT id FROM process_items WHERE process_id = ? ORDER BY order_index', [id]))[0].map((r) => r.id);
  const baseTemplates = { Compras: { items: ['Termo'], color: '#2563eb' }, Obras: { items: ['Projeto'], color: '#16a34a' } };

  test('só os processos do modelo alterado são regravados', async () => {
    assert.equal((await call('PUT', '/templates', baseTemplates)).status, 200);
    const compras = await createProcess('Compras', [doc('Termo')]);
    const obras = await createProcess('Obras', [doc('Projeto'), doc('Ajuste só deste processo')]);
    const obrasIds = await itemIds(obras.id);

    const edited = { ...baseTemplates, Compras: { items: ['Termo', 'Contrato'], color: '#2563eb' } };
    assert.equal((await call('PUT', '/templates', edited)).status, 200);

    assert.deepEqual((await items(compras.id)).map((i) => i.name), ['Termo', 'Contrato']);
    assert.deepEqual((await items(obras.id)).map((i) => i.name), ['Projeto', 'Ajuste só deste processo']);
    assert.deepEqual(await itemIds(obras.id), obrasIds, 'os itens de Obras foram regravados sem o modelo mudar');
  });

  test('salvar sem nenhuma alteração não regrava nada', async () => {
    assert.equal((await call('PUT', '/templates', baseTemplates)).status, 200);
    const compras = await createProcess('Compras', [doc('Termo'), doc('Extra')]);
    const before = await itemIds(compras.id);
    assert.equal((await call('PUT', '/templates', baseTemplates)).status, 200);
    assert.deepEqual(await itemIds(compras.id), before);
  });

  test('só a cor mudou: a cor do processo acompanha e os itens ficam', async () => {
    assert.equal((await call('PUT', '/templates', baseTemplates)).status, 200);
    const obras = await createProcess('Obras', [doc('Projeto')]);
    const before = await itemIds(obras.id);
    assert.equal((await call('PUT', '/templates', { ...baseTemplates, Obras: { items: ['Projeto'], color: '#dc2626' } })).status, 200);
    const [[row]] = await db.query('SELECT typeColor FROM processes WHERE id = ?', [obras.id]);
    assert.equal(row.typeColor, '#dc2626');
    assert.deepEqual(await itemIds(obras.id), before);
  });

  test('item salvo como texto ou como objeto doc sem cor conta como o mesmo item', async () => {
    assert.equal((await call('PUT', '/templates', { ...baseTemplates, Compras: { items: ['Termo'], color: '#2563eb' } })).status, 200);
    const compras = await createProcess('Compras', [doc('Termo'), doc('Extra')]);
    const before = await itemIds(compras.id);
    const sameAsObject = { ...baseTemplates, Compras: { items: [{ type: 'doc', name: 'Termo', bgColor: null }], color: '#2563eb' } };
    assert.equal((await call('PUT', '/templates', sameAsObject)).status, 200);
    assert.deepEqual(await itemIds(compras.id), before);
  });
});
