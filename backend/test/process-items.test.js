// Itens (documentos/fases) de um processo só mudam quando o pedido manda a lista. Um pedido sem `docs`
// (front antigo em cache, outro cliente, erro futuro) não pode apagar tudo e responder sucesso.
// A proteção useTestDatabase vem primeiro: este processo só enxerga o BANCO DE TESTE (TEST_DB_NAME).
import { testDbSkip } from './helpers/useTestDatabase.js';
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import db from '../db.js';
import processesRouter from '../routes/processes.js';
import { initSocket } from '../socket.js';
import { migrateDemandPriority, migrateDemands } from '../demandsMigration.js';

const TITLE_PREFIX = 'teste-itens-';
let server;
let baseUrl;
const emitted = [];

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
  // A autenticação não é o que está em teste: entra como editor.
  app.use((req, _res, next) => { req.userId = 'test-user'; req.userRole = 'editor'; next(); });
  app.use('/api/processes', processesRouter);
  server = app.listen(0);
  // O tempo real de verdade, só com o envio interceptado para o teste ver o que os outros usuários recebem.
  const io = initSocket(server);
  io.emit = (event, payload) => { emitted.push({ event, payload }); return true; };
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
const doc = (name) => ({ id: crypto.randomUUID(), type: 'doc', name, done: false, bgColor: null });
const newProcess = () => ({
  id: crypto.randomUUID(), title: `${TITLE_PREFIX}${crypto.randomUUID().slice(0, 8)}`, processNumber: '001/2026', setor: 'Maria',
  type: 'Compras', typeColor: '#2563eb', dueDate: '2030-01-15', status: 'active', docs: [doc('Termo'), doc('Edital')],
});
const itemNames = async (id) => (await db.query('SELECT name FROM process_items WHERE process_id = ? ORDER BY order_index', [id]))[0].map((i) => i.name);

describe('itens do processo', { skip: testDbSkip || false }, () => {
  beforeEach(async () => {
    await assertTestDatabase();
    await removeProcesses();
    emitted.length = 0;
  });

  test('editar o processo sem mandar os itens mantém os itens', async () => {
    const p = newProcess();
    assert.equal((await call('POST', '/processes', p)).status, 201);
    const { docs, ...semItens } = p;
    const res = await call('PUT', `/processes/${p.id}`, { ...semItens, title: `${p.title}-novo` });
    assert.equal(res.status, 200);
    assert.deepEqual(await itemNames(p.id), ['Termo', 'Edital']);
  });

  test('editar sem mandar os itens avisa os outros usuários com os itens que ficaram', async () => {
    const p = newProcess();
    await call('POST', '/processes', p);
    emitted.length = 0;
    const { docs, ...semItens } = p;
    await call('PUT', `/processes/${p.id}`, semItens);
    const update = emitted.find((e) => e.event === 'process:updated');
    assert.ok(update, 'deveria avisar a edição em tempo real');
    assert.deepEqual(update.payload.docs.map((d) => d.name), ['Termo', 'Edital']);
  });

  test('editar mandando a lista de itens continua trocando os itens', async () => {
    const p = newProcess();
    await call('POST', '/processes', p);
    const res = await call('PUT', `/processes/${p.id}`, { ...p, docs: [doc('Contrato')] });
    assert.equal(res.status, 200);
    assert.deepEqual(await itemNames(p.id), ['Contrato']);
  });

  test('editar com itens que não são uma lista é recusado e nada muda', async () => {
    const p = newProcess();
    await call('POST', '/processes', p);
    const res = await call('PUT', `/processes/${p.id}`, { ...p, title: `${p.title}-novo`, docs: 'x' });
    assert.equal(res.status, 400);
    assert.deepEqual(await itemNames(p.id), ['Termo', 'Edital']);
    assert.equal((await db.query('SELECT title FROM processes WHERE id = ?', [p.id]))[0][0].title, p.title);
  });

  test('salvar os itens sem mandar a lista é recusado e mantém os itens', async () => {
    const p = newProcess();
    await call('POST', '/processes', p);
    const res = await call('PUT', `/processes/${p.id}/items`, {});
    assert.equal(res.status, 400);
    assert.deepEqual(await itemNames(p.id), ['Termo', 'Edital']);
  });

  test('salvar os itens com uma lista vazia continua apagando os itens (escolha do usuário)', async () => {
    const p = newProcess();
    await call('POST', '/processes', p);
    const res = await call('PUT', `/processes/${p.id}/items`, { docs: [] });
    assert.equal(res.status, 200);
    assert.deepEqual(await itemNames(p.id), []);
  });
});
