// Duas alterações ao mesmo tempo no mesmo contrato: cada uma lia o contrato antes da outra gravar e as duas
// passavam (aditivos com o mesmo número, acima do limite, encerramento ou reabertura em dobro no histórico).
// A proteção useTestDatabase vem primeiro: este processo só enxerga o BANCO DE TESTE (TEST_DB_NAME).
import { testDbSkip } from './helpers/useTestDatabase.js';
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import db from '../db.js';
import contractsRouter from '../routes/contracts.js';

const NAME_PREFIX = 'teste-corrida-';
// A corrida depende do tempo: repetir algumas rodadas torna a falha previsível sem a correção.
const ROUNDS = 5;
let server;
let baseUrl;

const assertTestDatabase = async () => {
  const [[{ name }]] = await db.query('SELECT DATABASE() AS name');
  assert.ok(String(name).endsWith('_test'), `banco inesperado nos testes: ${name}`);
};

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
  await assertTestDatabase();
  const app = express();
  app.use(express.json());
  // A autenticação não é o que está em teste: editor, com um id por pedido para o limite de ações não interferir.
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

const createContract = async () => {
  const res = await call('POST', '/contracts', {
    processName: `${NAME_PREFIX}${crypto.randomUUID().slice(0, 8)}`, objectDescription: 'Objeto de teste', processNumber: '001/2026',
    contractValue: 1000, dueDate: '2030-01-01', fiscalEffective: 'Maria', modality: 'Pregão Eletrônico', lawType: 'new',
  });
  assert.equal(res.status, 201);
  return res.body.id;
};

const events = async (id, type) => (await db.query(
  'SELECT amendment_number FROM contract_events WHERE contract_id = ? AND type = ? ORDER BY id', [id, type]
))[0];

// Uma das duas pode ser recusada pela regra (4xx), nunca por erro do servidor (ex.: deadlock).
const assertNoServerError = (responses, round) => {
  const statuses = responses.map((res) => res.status);
  assert.ok(statuses.every((status) => status < 500), `rodada ${round}: respostas ${statuses.join(', ')}`);
};

describe('alterações simultâneas no mesmo contrato', { skip: testDbSkip || false }, () => {
  beforeEach(async () => {
    await assertTestDatabase();
    await removeContracts();
  });

  test('dois aditivos ao mesmo tempo recebem números diferentes', async () => {
    for (let round = 1; round <= ROUNDS; round += 1) {
      const id = await createContract();
      const responses = await Promise.all([
        call('POST', `/contracts/${id}/amendments`, { newDueDate: '2031-01-01' }),
        call('POST', `/contracts/${id}/amendments`, { newDueDate: '2032-01-01' }),
      ]);
      assertNoServerError(responses, round);
      const numbers = (await events(id, 'amendment')).map((e) => e.amendment_number);
      assert.equal(new Set(numbers).size, numbers.length, `rodada ${round}: números de aditivo repetidos (${numbers.join(', ')})`);
    }
  });

  test('aditivos ao mesmo tempo não passam do limite de 4', async () => {
    for (let round = 1; round <= ROUNDS; round += 1) {
      const id = await createContract();
      for (const year of [2031, 2032, 2033]) {
        assert.equal((await call('POST', `/contracts/${id}/amendments`, { newDueDate: `${year}-01-01` })).status, 200);
      }
      const responses = await Promise.all([
        call('POST', `/contracts/${id}/amendments`, { newDueDate: '2034-01-01' }),
        call('POST', `/contracts/${id}/amendments`, { newDueDate: '2035-01-01' }),
      ]);
      assertNoServerError(responses, round);
      assert.ok((await events(id, 'amendment')).length <= 4, `rodada ${round}: mais de 4 aditivos`);
    }
  });

  test('encerrar duas vezes ao mesmo tempo registra um encerramento só', async () => {
    for (let round = 1; round <= ROUNDS; round += 1) {
      const id = await createContract();
      const responses = await Promise.all([
        call('POST', `/contracts/${id}/close`, { reason: 'a' }),
        call('POST', `/contracts/${id}/close`, { reason: 'b' }),
      ]);
      assertNoServerError(responses, round);
      assert.equal((await events(id, 'closed')).length, 1, `rodada ${round}: encerramento em dobro no histórico`);
    }
  });

  test('reabrir duas vezes ao mesmo tempo registra uma reabertura só', async () => {
    for (let round = 1; round <= ROUNDS; round += 1) {
      const id = await createContract();
      assert.equal((await call('POST', `/contracts/${id}/close`, {})).status, 200);
      const responses = await Promise.all([
        call('POST', `/contracts/${id}/reopen`, {}),
        call('POST', `/contracts/${id}/reopen`, {}),
      ]);
      assertNoServerError(responses, round);
      assert.equal((await events(id, 'reopened')).length, 1, `rodada ${round}: reabertura em dobro no histórico`);
    }
  });

  test('aditivo e encerramento ao mesmo tempo não deixam aditivo lançado depois de encerrar', async () => {
    for (let round = 1; round <= ROUNDS; round += 1) {
      const id = await createContract();
      const responses = await Promise.all([
        call('POST', `/contracts/${id}/close`, {}),
        call('POST', `/contracts/${id}/amendments`, { newDueDate: '2031-01-01' }),
      ]);
      assertNoServerError(responses, round);
      const [rows] = await db.query("SELECT type FROM contract_events WHERE contract_id = ? AND type IN ('closed', 'amendment') ORDER BY id", [id]);
      assert.notDeepEqual(rows.map((r) => r.type), ['closed', 'amendment'], `rodada ${round}: aditivo gravado num contrato já encerrado`);
    }
  });
});
