// Demandas: todo processo nasce como pendente ou iniciado; só iniciado exige gestor e só ele vale como processo.
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
import { isoToday, isPastDate } from '../validation.js';

let server;
let baseUrl;

const assertTestDatabase = async () => {
  const [[{ name }]] = await db.query('SELECT DATABASE() AS name');
  assert.ok(String(name).endsWith('_test'), `banco inesperado nos testes: ${name}`);
};

before(async () => {
  if (testDbSkip) return;
  await assertTestDatabase();
  await migrateDemands(db);
  await migrateDemandPriority(db);
  const app = express();
  app.use(express.json());
  // A autenticação não é o que está em teste: o papel vem de um cabeçalho do próprio teste.
  app.use((req, _res, next) => { req.userId = 'test-user'; req.userRole = req.get('x-test-role') || 'editor'; next(); });
  app.use('/api/processes', processesRouter);
  app.use('/api/templates', templatesRouter);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  server?.close();
  await db.end();
});

const call = async (method, path, body, role) => {
  const headers = { 'Content-Type': 'application/json', ...(role ? { 'x-test-role': role } : {}) };
  const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const demand = (over = {}) => ({
  id: crypto.randomUUID(), title: 'Compra de cadeiras', processNumber: '001/2026', type: 'Compras', typeColor: '#2563eb',
  dueDate: '2030-01-15', status: 'pending', docs: [{ id: crypto.randomUUID(), type: 'doc', name: 'Termo', done: false, bgColor: null }], ...over,
});
const row = async (id) => (await db.query('SELECT * FROM processes WHERE id = ?', [id]))[0][0];
const items = async (id) => (await db.query('SELECT name FROM process_items WHERE process_id = ? ORDER BY order_index', [id]))[0].map((i) => i.name);

describe('demandas', { skip: testDbSkip || false }, () => {
  beforeEach(async () => {
    await assertTestDatabase();
    await db.query('DELETE FROM process_items');
    await db.query('DELETE FROM processes');
  });

  describe('criar', () => {
    test('pendente pode nascer sem gestor e guarda a observação', async () => {
      const d = demand({ notes: 'Aguardando orçamento' });
      const res = await call('POST', '/processes', d);
      assert.equal(res.status, 201);
      const saved = await row(d.id);
      assert.equal(saved.status, 'pending');
      assert.equal(saved.setor, null);
      assert.equal(saved.started_at, null);
      assert.equal(saved.notes, 'Aguardando orçamento');
    });

    test('iniciada sem gestor é recusada', async () => {
      const d = demand({ status: 'active' });
      const res = await call('POST', '/processes', d);
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Informe o gestor principal.');
      assert.equal(await row(d.id), undefined);
    });

    test('iniciada com gestor registra a data de início', async () => {
      const d = demand({ status: 'active', setor: 'Maria' });
      const res = await call('POST', '/processes', d);
      assert.equal(res.status, 201);
      const saved = await row(d.id);
      assert.equal(saved.setor, 'Maria');
      assert.ok(saved.started_at instanceof Date);
      assert.ok(res.body.startedAt, 'a resposta traz a data de início');
    });

    for (const [field, value, message] of [
      ['processNumber', '', 'Informe o número do processo.'],
      ['dueDate', null, 'Informe a data de vencimento.'],
      ['type', null, 'Informe o tipo de processo.'],
    ]) {
      test(`pendente sem ${field} é recusada`, async () => {
        const res = await call('POST', '/processes', demand({ [field]: value }));
        assert.equal(res.status, 400);
        assert.equal(res.body.error, message);
      });
    }

    test('não cria processo já arquivado', async () => {
      const res = await call('POST', '/processes', demand({ status: 'archived', setor: 'Maria' }));
      assert.equal(res.status, 400);
    });

    test('observação longa demais é recusada', async () => {
      const res = await call('POST', '/processes', demand({ notes: 'x'.repeat(2001) }));
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Observação muito longa.');
    });

    test('visualizador não cria', async () => {
      const res = await call('POST', '/processes', demand(), 'viewer');
      assert.equal(res.status, 403);
    });
  });

  describe('listar', () => {
    test('devolve situação, observação e início', async () => {
      const pending = demand({ notes: 'Nota' });
      const active = demand({ status: 'active', setor: 'Maria' });
      await call('POST', '/processes', pending);
      await call('POST', '/processes', active);
      const { body } = await call('GET', '/processes');
      const p = body.find((x) => x.id === pending.id);
      const a = body.find((x) => x.id === active.id);
      assert.equal(p.status, 'pending');
      assert.equal(p.notes, 'Nota');
      assert.equal(p.startedAt, null);
      assert.equal(p.docs.length, 1);
      assert.equal(a.status, 'active');
      assert.ok(a.startedAt);
    });
  });

  describe('iniciar', () => {
    test('sem gestor é recusado e continua pendente', async () => {
      const d = demand();
      await call('POST', '/processes', d);
      const res = await call('PUT', `/processes/${d.id}/start`, {});
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Informe o gestor principal.');
      assert.equal((await row(d.id)).status, 'pending');
    });

    test('com o gestor informado passa a iniciada', async () => {
      const d = demand();
      await call('POST', '/processes', d);
      const res = await call('PUT', `/processes/${d.id}/start`, { setor: ' Maria ' });
      assert.equal(res.status, 200);
      assert.equal(res.body.setor, 'Maria');
      assert.ok(res.body.startedAt);
      const saved = await row(d.id);
      assert.equal(saved.status, 'active');
      assert.equal(saved.setor, 'Maria');
      assert.ok(saved.started_at instanceof Date);
    });

    test('usa o gestor que a demanda já tem', async () => {
      const d = demand({ setor: 'João' });
      await call('POST', '/processes', d);
      const res = await call('PUT', `/processes/${d.id}/start`, {});
      assert.equal(res.status, 200);
      assert.equal((await row(d.id)).setor, 'João');
    });

    test('demanda já iniciada não inicia de novo nem perde a data', async () => {
      const d = demand({ status: 'active', setor: 'Maria' });
      await call('POST', '/processes', d);
      const before = (await row(d.id)).started_at;
      const res = await call('PUT', `/processes/${d.id}/start`, { setor: 'João' });
      assert.equal(res.status, 409);
      const saved = await row(d.id);
      assert.equal(saved.setor, 'Maria');
      assert.deepEqual(saved.started_at, before);
    });

    test('demanda inexistente dá 404', async () => {
      const res = await call('PUT', `/processes/${crypto.randomUUID()}/start`, { setor: 'Maria' });
      assert.equal(res.status, 404);
    });

    test('visualizador não inicia', async () => {
      const d = demand({ setor: 'João' });
      await call('POST', '/processes', d);
      const res = await call('PUT', `/processes/${d.id}/start`, {}, 'viewer');
      assert.equal(res.status, 403);
      assert.equal((await row(d.id)).status, 'pending');
    });
  });

  describe('mudar a situação', () => {
    test('iniciada não volta para pendente', async () => {
      const d = demand({ status: 'active', setor: 'Maria' });
      await call('POST', '/processes', d);
      const res = await call('PUT', `/processes/${d.id}/status`, { status: 'pending' });
      assert.equal(res.status, 400);
      assert.equal((await row(d.id)).status, 'active');
    });

    test('pendente não pode ser arquivada', async () => {
      const d = demand();
      await call('POST', '/processes', d);
      const res = await call('PUT', `/processes/${d.id}/status`, { status: 'archived' });
      assert.equal(res.status, 409);
      assert.equal((await row(d.id)).status, 'pending');
    });

    test('pendente não vira ativa pela rota de situação (pularia a exigência de gestor)', async () => {
      const d = demand();
      await call('POST', '/processes', d);
      const res = await call('PUT', `/processes/${d.id}/status`, { status: 'active' });
      assert.equal(res.status, 409);
      assert.equal((await row(d.id)).status, 'pending');
    });

    test('arquivar e desarquivar uma iniciada continua funcionando e mantém o início', async () => {
      const d = demand({ status: 'active', setor: 'Maria' });
      await call('POST', '/processes', d);
      const started = (await row(d.id)).started_at;
      assert.equal((await call('PUT', `/processes/${d.id}/status`, { status: 'archived' })).status, 200);
      assert.equal((await row(d.id)).status, 'archived');
      assert.equal((await call('PUT', `/processes/${d.id}/status`, { status: 'active' })).status, 200);
      const saved = await row(d.id);
      assert.equal(saved.status, 'active');
      assert.deepEqual(saved.started_at, started);
    });
  });

  describe('editar', () => {
    test('pendente continua sem gestor e atualiza a observação', async () => {
      const d = demand();
      await call('POST', '/processes', d);
      const res = await call('PUT', `/processes/${d.id}`, { ...d, title: 'Novo título', setor: '', notes: 'Nova nota' });
      assert.equal(res.status, 200);
      const saved = await row(d.id);
      assert.equal(saved.title, 'Novo título');
      assert.equal(saved.setor, null);
      assert.equal(saved.notes, 'Nova nota');
      assert.equal(saved.status, 'pending');
    });

    test('edição sem o campo observação (tela de Processos) não apaga a observação', async () => {
      const d = demand({ status: 'active', setor: 'Maria', notes: 'Manter' });
      await call('POST', '/processes', d);
      const { notes, ...semNotas } = d;
      assert.equal((await call('PUT', `/processes/${d.id}`, { ...semNotas, title: 'Outro' })).status, 200);
      assert.equal((await row(d.id)).notes, 'Manter');
    });

    test('iniciada não pode ficar sem gestor', async () => {
      const d = demand({ status: 'active', setor: 'Maria' });
      await call('POST', '/processes', d);
      const res = await call('PUT', `/processes/${d.id}`, { ...d, setor: '' });
      assert.equal(res.status, 400);
      assert.equal((await row(d.id)).setor, 'Maria');
    });

    test('pendente não pode perder o número do processo', async () => {
      const d = demand();
      await call('POST', '/processes', d);
      const res = await call('PUT', `/processes/${d.id}`, { ...d, processNumber: '' });
      assert.equal(res.status, 400);
      assert.equal((await row(d.id)).processNumber, '001/2026');
    });

    test('editar não muda a situação, mesmo que o pedido tente', async () => {
      const d = demand();
      await call('POST', '/processes', d);
      await call('PUT', `/processes/${d.id}`, { ...d, status: 'active', setor: 'Maria' });
      assert.equal((await row(d.id)).status, 'pending');
    });

    test('processo inexistente dá 404 e não grava itens soltos', async () => {
      const d = demand();
      const res = await call('PUT', `/processes/${d.id}`, d);
      assert.equal(res.status, 404);
      assert.deepEqual(await items(d.id), []);
    });
  });

  test('salvar modelos também atualiza os itens das pendentes', async () => {
    const d = demand();
    await call('POST', '/processes', d);
    const res = await call('PUT', '/templates', { Compras: { items: ['Termo novo', 'Edital'], color: '#2563eb' } }, 'admin');
    assert.equal(res.status, 200);
    assert.deepEqual(await items(d.id), ['Termo novo', 'Edital']);
  });

  describe('prioridade', () => {
    const listed = async (id) => (await call('GET', '/processes')).body.find((p) => p.id === id);

    for (const priority of ['urgent', 'high', 'moderate', 'routine']) {
      test(`cria e lista com prioridade ${priority}`, async () => {
        const d = demand({ priority });
        assert.equal((await call('POST', '/processes', d)).status, 201);
        assert.equal((await row(d.id)).priority, priority);
        assert.equal((await listed(d.id)).priority, priority);
      });
    }

    test('sem prioridade informada, nasce como rotina', async () => {
      const d = demand();
      assert.equal((await call('POST', '/processes', d)).status, 201);
      assert.equal((await row(d.id)).priority, 'routine');
    });

    test('prioridade desconhecida é recusada ao criar', async () => {
      const d = demand({ priority: 'altissima' });
      const res = await call('POST', '/processes', d);
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Prioridade inválida.');
      assert.equal(await row(d.id), undefined);
    });

    test('a edição muda a prioridade', async () => {
      const d = demand();
      await call('POST', '/processes', d);
      assert.equal((await call('PUT', `/processes/${d.id}`, { ...d, priority: 'urgent' })).status, 200);
      assert.equal((await row(d.id)).priority, 'urgent');
    });

    test('prioridade desconhecida é recusada ao editar e nada muda', async () => {
      const d = demand({ priority: 'high' });
      await call('POST', '/processes', d);
      const res = await call('PUT', `/processes/${d.id}`, { ...d, priority: 'altissima' });
      assert.equal(res.status, 400);
      assert.equal((await row(d.id)).priority, 'high');
    });

    test('editar sem enviar a prioridade mantém a atual (tela de Processos)', async () => {
      const d = demand({ status: 'active', setor: 'Fulano', priority: 'urgent' });
      await call('POST', '/processes', d);
      const { priority: _omitted, ...withoutPriority } = d;
      assert.equal((await call('PUT', `/processes/${d.id}`, { ...withoutPriority, title: 'Novo título' })).status, 200);
      const saved = await row(d.id);
      assert.equal(saved.title, 'Novo título');
      assert.equal(saved.priority, 'urgent');
    });

    test('iniciar não muda a prioridade', async () => {
      const d = demand({ setor: 'Fulano', priority: 'moderate' });
      await call('POST', '/processes', d);
      assert.equal((await call('PUT', `/processes/${d.id}/start`, {})).status, 200);
      assert.equal((await row(d.id)).priority, 'moderate');
    });

    test('a migração deixa os processos existentes como rotina, sem mexer na data de atualização, e pode rodar de novo', async () => {
      await assertTestDatabase();
      const d = demand({ priority: 'urgent' });
      await call('POST', '/processes', d);
      await db.query("UPDATE processes SET updated_at = '2026-01-02 03:04:05' WHERE id = ?", [d.id]);
      await db.query('ALTER TABLE processes DROP COLUMN priority');
      assert.equal(await migrateDemandPriority(db), true);
      const saved = await row(d.id);
      assert.equal(saved.priority, 'routine');
      assert.equal(new Date(saved.updated_at).getFullYear(), 2026);
      assert.equal(new Date(saved.updated_at).getMonth(), 0);
      assert.equal(await migrateDemandPriority(db), false);
    });
  });

  describe('vencimento no passado', () => {
    const PAST_MESSAGE = 'A data de vencimento não pode estar no passado.';
    const shiftDays = (days) => isoToday(new Date(Date.now() + days * 86400000));

    test('demanda pendente não nasce vencida', async () => {
      const d = demand({ dueDate: shiftDays(-1) });
      const res = await call('POST', '/processes', d);
      assert.equal(res.status, 400);
      assert.equal(res.body.error, PAST_MESSAGE);
      assert.equal(await row(d.id), undefined);
    });

    test('demanda iniciada não nasce vencida', async () => {
      const d = demand({ status: 'active', setor: 'Fulano', dueDate: shiftDays(-1) });
      const res = await call('POST', '/processes', d);
      assert.equal(res.status, 400);
      assert.equal(res.body.error, PAST_MESSAGE);
      assert.equal(await row(d.id), undefined);
    });

    test('demanda pode vencer hoje', async () => {
      const res = await call('POST', '/processes', demand({ dueDate: shiftDays(0) }));
      assert.equal(res.status, 201);
    });

    test('editar pendente não pode trocar para uma data passada', async () => {
      const d = demand();
      await call('POST', '/processes', d);
      const res = await call('PUT', `/processes/${d.id}`, { ...d, dueDate: shiftDays(-1) });
      assert.equal(res.status, 400);
      assert.equal(res.body.error, PAST_MESSAGE);
      const [[saved]] = await db.query("SELECT DATE_FORMAT(due_date, '%Y-%m-%d') AS due FROM processes WHERE id = ?", [d.id]);
      assert.equal(saved.due, '2030-01-15');
    });

    test('pendente que venceu com o tempo continua editável sem mudar a data', async () => {
      const d = demand();
      await call('POST', '/processes', d);
      const past = shiftDays(-10);
      await db.query('UPDATE processes SET due_date = ? WHERE id = ?', [past, d.id]);
      const res = await call('PUT', `/processes/${d.id}`, { ...d, dueDate: past, notes: 'Nova observação' });
      assert.equal(res.status, 200);
      assert.equal((await row(d.id)).notes, 'Nova observação');
    });

    test('pendente que venceu com o tempo ainda pode ser iniciada', async () => {
      const d = demand({ setor: 'Fulano' });
      await call('POST', '/processes', d);
      await db.query('UPDATE processes SET due_date = ? WHERE id = ?', [shiftDays(-10), d.id]);
      const res = await call('PUT', `/processes/${d.id}/start`, {});
      assert.equal(res.status, 200);
    });

    test('processo iniciado pode corrigir a data para o passado', async () => {
      const d = demand({ status: 'active', setor: 'Fulano' });
      await call('POST', '/processes', d);
      const res = await call('PUT', `/processes/${d.id}`, { ...d, dueDate: shiftDays(-1) });
      assert.equal(res.status, 200);
    });

    test('"hoje" é o dia em Teresina, não em UTC', () => {
      // 01:30 UTC do dia 7 ainda é 22:30 do dia 6 em Teresina.
      const now = new Date('2026-11-07T01:30:00Z');
      assert.equal(isoToday(now), '2026-11-06');
      assert.equal(isPastDate('2026-11-06', now), false);
      assert.equal(isPastDate('2026-11-05', now), true);
      assert.equal(isPastDate('2026-11-07', now), false);
    });
  });

  describe('migração', () => {
    const toOldSchema = async () => {
      await assertTestDatabase();
      await db.query(`ALTER TABLE processes DROP COLUMN started_at, DROP COLUMN notes, MODIFY status ENUM('active','archived') DEFAULT 'active'`);
    };

    test('processos antigos viram iniciados na data de criação, sem mexer na última atualização', async () => {
      await toOldSchema();
      try {
        await db.query(
          `INSERT INTO processes (id, title, setor, status, created_at, updated_at) VALUES
           ('old-a', 'Ativo', 'Maria', 'active', '2026-01-10 10:00:00', '2026-02-20 11:00:00'),
           ('old-b', 'Arquivado', 'João', 'archived', '2026-03-05 09:00:00', '2026-04-01 08:00:00')`
        );
        await migrateDemands(db);
        const a = await row('old-a');
        const b = await row('old-b');
        assert.equal(a.status, 'active');
        assert.equal(b.status, 'archived');
        assert.deepEqual(a.started_at, new Date(2026, 0, 10, 10, 0, 0));
        assert.deepEqual(b.started_at, new Date(2026, 2, 5, 9, 0, 0));
        assert.deepEqual(a.updated_at, new Date(2026, 1, 20, 11, 0, 0));
        assert.deepEqual(b.updated_at, new Date(2026, 3, 1, 8, 0, 0));
        assert.equal(a.notes, null);
      } finally {
        await migrateDemands(db); // garante a estrutura nova para os demais testes, mesmo se algo falhar
      }
    });

    test('rodar de novo não altera nada', async () => {
      const d = demand();
      await call('POST', '/processes', d);
      await migrateDemands(db);
      const saved = await row(d.id);
      assert.equal(saved.status, 'pending');
      assert.equal(saved.started_at, null);
    });
  });
});
