// Rollback que falha: a conexão pode continuar no meio da transação (com as linhas travadas por FOR UPDATE).
// Antes ela voltava ao pool assim mesmo, e o próximo pedido rodava dentro dessa transação alheia; o erro do
// rollback era descartado sem log. Agora a conexão é destruída (o pool abre outra) e o erro vai para o log.
// A conexão é simulada (pool.getConnection substituído): nada toca o banco.
import './helpers/useTestDatabase.js';
import { after, afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import db, { withTransaction } from '../db.js';

function fakeConnection({ rollbackFails = false } = {}) {
  const calls = [];
  return {
    calls,
    beginTransaction: async () => { calls.push('begin'); },
    commit: async () => { calls.push('commit'); },
    rollback: async () => {
      calls.push('rollback');
      if (rollbackFails) throw Object.assign(new Error('Connection lost: The server closed the connection.'), { code: 'PROTOCOL_CONNECTION_LOST' });
    },
    release: () => { calls.push('release'); },
    destroy: () => { calls.push('destroy'); },
  };
}

describe('withTransaction quando algo falha', () => {
  const originalGetConnection = db.getConnection;
  const originalConsoleError = console.error;

  afterEach(() => {
    db.getConnection = originalGetConnection;
    console.error = originalConsoleError;
  });
  after(() => db.end());

  test('rollback que falha: destrói a conexão, registra o erro e repassa o erro original', async () => {
    const conn = fakeConnection({ rollbackFails: true });
    db.getConnection = async () => conn;
    const logged = [];
    console.error = (...args) => { logged.push(args); };
    const workError = new Error('falha no meio da transação');

    await assert.rejects(withTransaction(async () => { throw workError; }), (error) => error === workError);

    assert.deepEqual(conn.calls, ['begin', 'rollback', 'destroy']);
    assert.ok(logged.some((args) => args.some((arg) => arg?.code === 'PROTOCOL_CONNECTION_LOST')), 'o erro do rollback não foi registrado');
  });

  test('rollback que dá certo: a conexão volta ao pool', async () => {
    const conn = fakeConnection();
    db.getConnection = async () => conn;
    const workError = new Error('regra de negócio');

    await assert.rejects(withTransaction(async () => { throw workError; }), (error) => error === workError);
    assert.deepEqual(conn.calls, ['begin', 'rollback', 'release']);
  });

  test('sem erro: commit e a conexão volta ao pool', async () => {
    const conn = fakeConnection();
    db.getConnection = async () => conn;
    assert.equal(await withTransaction(async () => 'ok'), 'ok');
    assert.deepEqual(conn.calls, ['begin', 'commit', 'release']);
  });
});
