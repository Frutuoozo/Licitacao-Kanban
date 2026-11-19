// Contratada (CNPJ, e-mail, telefone), início da vigência e PCA: migration 023, gravação, leitura e
// registro das edições no histórico. Contratos antigos (sem esses dados) continuam salvando normalmente.
// A proteção useTestDatabase vem primeiro: este processo só enxerga o BANCO DE TESTE (TEST_DB_NAME).
import { testDbSkip } from './helpers/useTestDatabase.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import db from '../db.js';
import contractsRouter from '../routes/contracts.js';
import { migrateContractDetails } from '../contractDetailsMigration.js';

const NAME_PREFIX = 'teste-contratada-';
let server;
let baseUrl;

const removeContracts = async () => {
  const [rows] = await db.query('SELECT id FROM contracts WHERE process_name LIKE ?', [`${NAME_PREFIX}%`]);
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return;
  await db.query('DELETE FROM contract_documents WHERE contract_id IN (?)', [ids]);
  await db.query('DELETE FROM contract_events WHERE contract_id IN (?)', [ids]);
  await db.query('DELETE FROM contracts WHERE id IN (?)', [ids]);
};

before(async () => {
  if (testDbSkip) return;
  const [[{ name }]] = await db.query('SELECT DATABASE() AS name');
  assert.ok(String(name).endsWith('_test'), `banco inesperado nos testes: ${name}`);
  await migrateContractDetails(db);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.userId = crypto.randomUUID(); req.userRole = 'editor'; req.userName = 'teste'; next(); });
  app.use('/api/contracts', contractsRouter);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  if (!testDbSkip) await removeContracts();
  server?.close();
  await db.end();
});

const call = async (method, path, body) => {
  const res = await fetch(`${baseUrl}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const basePayload = () => ({
  processName: `${NAME_PREFIX}${crypto.randomUUID().slice(0, 8)}`, objectDescription: 'Objeto de teste', processNumber: '001/2026',
  contractValue: 1000, dueDate: '2030-01-01', fiscalEffective: 'Maria', modality: 'Pregão Eletrônico', lawType: 'new',
  contractorCnpj: '11222333000181', startDate: '2026-01-10', pcaProject: 'Projeto 12', pcaAccount: '3.3.90.39',
});
const details = {
  contractorCnpj: '11.222.333/0001-81', contractorEmail: 'a@b.com', contractorPhone: '(86) 3222-1111',
  startDate: '2026-01-10', pcaProject: 'Projeto 12', pcaAccount: '3.3.90.39',
};

const lastEdit = async (id) => (await db.query(
  "SELECT changes FROM contract_events WHERE contract_id = ? AND type = 'edited' ORDER BY id DESC LIMIT 1", [id]
))[0][0];
const editCount = async (id) => (await db.query(
  "SELECT COUNT(*) AS n FROM contract_events WHERE contract_id = ? AND type = 'edited'", [id]
))[0][0].n;
const parse = (changes) => (typeof changes === 'string' ? JSON.parse(changes) : changes);

describe('contratada, início da vigência e PCA', { skip: testDbSkip || false }, () => {
  test('a migration é idempotente', async () => {
    assert.equal(await migrateContractDetails(db), false);
  });

  test('cadastro com os campos novos devolve todos (CNPJ só com dígitos)', async () => {
    const res = await call('POST', '/contracts', { ...basePayload(), ...details });
    assert.equal(res.status, 201);
    assert.equal(res.body.contractorCnpj, '11222333000181');
    assert.equal(res.body.contractorEmail, 'a@b.com');
    assert.equal(res.body.contractorPhone, '(86) 3222-1111');
    assert.equal(res.body.startDate, '2026-01-10');
    assert.equal(res.body.pcaProject, 'Projeto 12');
    assert.equal(res.body.pcaAccount, '3.3.90.39');
  });

  test('cadastro sem CNPJ é recusado', async () => {
    const { contractorCnpj, ...payload } = basePayload();
    const res = await call('POST', '/contracts', payload);
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'CNPJ obrigatório');
  });

  test('contrato antigo (sem CNPJ, vigência e PCA) só salva a edição com eles informados', async () => {
    const payload = basePayload();
    const { body: created } = await call('POST', '/contracts', payload);
    await db.query('UPDATE contracts SET contractor_cnpj = NULL, start_date = NULL, pca_project = NULL, pca_account = NULL WHERE id = ?', [created.id]);
    const { contractorCnpj, startDate, pcaProject, pcaAccount, ...legacy } = payload;
    assert.equal((await call('PUT', `/contracts/${created.id}`, legacy)).status, 400);
    const res = await call('PUT', `/contracts/${created.id}`, payload);
    assert.equal(res.status, 200);
    assert.equal(res.body.contractorCnpj, '11222333000181');
  });

  test('cadastro sem e-mail e telefone devolve os dois vazios', async () => {
    const res = await call('POST', '/contracts', basePayload());
    assert.equal(res.status, 201);
    assert.deepEqual([res.body.contractorEmail, res.body.contractorPhone], ['', '']);
  });

  for (const [field, message] of [['startDate', 'Início da vigência obrigatório'], ['pcaProject', 'Projeto do PCA obrigatório'], ['pcaAccount', 'Conta contábil obrigatória']]) {
    test(`cadastro sem ${field} é recusado`, async () => {
      const res = await call('POST', '/contracts', { ...basePayload(), [field]: '' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error, message);
    });
  }

  test('a lista também devolve os campos novos', async () => {
    const created = await call('POST', '/contracts', { ...basePayload(), ...details });
    const list = await call('GET', '/contracts');
    const found = list.body.find((c) => c.id === created.body.id);
    assert.equal(found.contractorCnpj, '11222333000181');
    assert.equal(found.startDate, '2026-01-10');
  });

  test('apagar o e-mail grava vazio e registra a alteração no histórico', async () => {
    const payload = { ...basePayload(), ...details };
    const { body: created } = await call('POST', '/contracts', payload);
    const res = await call('PUT', `/contracts/${created.id}`, { ...payload, contractorEmail: '' });
    assert.equal(res.status, 200);
    assert.equal(res.body.contractorEmail, '');
    const [[row]] = await db.query('SELECT contractor_email FROM contracts WHERE id = ?', [created.id]);
    assert.equal(row.contractor_email, null);
    assert.deepEqual(parse((await lastEdit(created.id)).changes),
      [{ field: 'contractorEmail', label: 'E-mail', from: 'a@b.com', to: '' }]);
  });

  test('mudar o início da vigência registra a alteração com as datas', async () => {
    const payload = { ...basePayload(), ...details };
    const { body: created } = await call('POST', '/contracts', payload);
    await call('PUT', `/contracts/${created.id}`, { ...payload, startDate: '2026-02-01' });
    assert.deepEqual(parse((await lastEdit(created.id)).changes),
      [{ field: 'startDate', label: 'Início da vigência', from: '2026-01-10', to: '2026-02-01' }]);
  });

  test('salvar contrato sem mudar nada não cria registro de edição', async () => {
    const payload = basePayload();
    const { body: created } = await call('POST', '/contracts', payload);
    assert.equal((await call('PUT', `/contracts/${created.id}`, payload)).status, 200);
    assert.equal(await editCount(created.id), 0);
  });

  test('salvar com os mesmos dados (CNPJ com máscara) não cria registro de edição', async () => {
    const payload = { ...basePayload(), ...details };
    const { body: created } = await call('POST', '/contracts', payload);
    assert.equal((await call('PUT', `/contracts/${created.id}`, payload)).status, 200);
    assert.equal(await editCount(created.id), 0);
  });

  test('o histórico usa o rótulo "Nome da empresa"', async () => {
    const payload = basePayload();
    const { body: created } = await call('POST', '/contracts', payload);
    await call('PUT', `/contracts/${created.id}`, { ...payload, processName: `${payload.processName}-novo` });
    assert.equal(parse((await lastEdit(created.id)).changes)[0].label, 'Nome da empresa');
  });

  test('editar grava cada campo novo na sua coluna', async () => {
    const payload = { ...basePayload(), ...details };
    const { body: created } = await call('POST', '/contracts', payload);
    const edited = {
      contractorCnpj: '11222333000505', contractorEmail: 'novo@b.com', contractorPhone: '(86) 99999-0000',
      startDate: '2026-03-01', pcaProject: 'Projeto 99', pcaAccount: '4.4.90.52',
    };
    const res = await call('PUT', `/contracts/${created.id}`, { ...payload, ...edited });
    assert.equal(res.status, 200);
    for (const [field, value] of Object.entries(edited)) assert.equal(res.body[field], value, field);
  });

  test('aditivo não muda o início da vigência', async () => {
    const { body: created } = await call('POST', '/contracts', { ...basePayload(), ...details });
    const res = await call('POST', `/contracts/${created.id}/amendments`, { newDueDate: '2031-01-01' });
    assert.equal(res.status, 200);
    assert.equal(res.body.startDate, '2026-01-10');
  });
});
