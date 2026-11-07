// Regras que impedem os testes de gravar no banco de verdade (local ou de produção).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveTestDatabase } from './helpers/testDatabase.js';

// Num processo separado: carrega a proteção e o db.js e pergunta ao MySQL em qual banco está.
// Só leitura (SELECT DATABASE()); a conexão falhar também conta como "não tocou no banco real".
function databaseSeenByApp(extraEnv) {
  const script = `
    await import('./test/helpers/useTestDatabase.js');
    const { default: db } = await import('./db.js');
    try { const [[row]] = await db.query('SELECT DATABASE() AS name'); console.log('BANCO=' + row.name); }
    catch (error) { console.log('BANCO=erro:' + error.code); }
    await db.end();`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8',
  });
  return result.stdout.match(/BANCO=(.*)/)?.[1];
}

test('sem banco de teste, o app nos testes não enxerga o banco da aplicação', () => {
  const seen = databaseSeenByApp({ TEST_DB_NAME: '', DB_NAME: 'licitacao_kanban' });
  assert.ok(seen, 'o processo de teste não respondeu');
  assert.notEqual(seen, 'licitacao_kanban');
});

test('com banco de teste apontando para o da aplicação, o app também não o enxerga', () => {
  const seen = databaseSeenByApp({ TEST_DB_NAME: 'licitacao_kanban', DB_NAME: 'licitacao_kanban' });
  assert.ok(seen, 'o processo de teste não respondeu');
  assert.notEqual(seen, 'licitacao_kanban');
});

test('sem TEST_DB_NAME os testes de banco são pulados', () => {
  const result = resolveTestDatabase({ DB_NAME: 'licitacao_kanban' });
  assert.equal(result.name, undefined);
  assert.match(result.skip, /TEST_DB_NAME/);
});

test('recusa usar o mesmo banco da aplicação', () => {
  const result = resolveTestDatabase({ DB_NAME: 'app_test', TEST_DB_NAME: 'app_test' });
  assert.equal(result.name, undefined);
  assert.match(result.skip, /mesmo banco/);
});

test('recusa banco de teste cujo nome não termina em _test', () => {
  const result = resolveTestDatabase({ DB_NAME: 'licitacao_kanban', TEST_DB_NAME: 'licitacao_kanban_prod' });
  assert.equal(result.name, undefined);
  assert.match(result.skip, /_test/);
});

test('nunca roda com NODE_ENV=production', () => {
  const result = resolveTestDatabase({ NODE_ENV: 'production', DB_NAME: 'licitacao_kanban', TEST_DB_NAME: 'licitacao_kanban_test' });
  assert.equal(result.name, undefined);
  assert.match(result.skip, /produção/);
});

test('recusa nome de banco com caracteres fora de letras, números e _', () => {
  const result = resolveTestDatabase({ DB_NAME: 'licitacao_kanban', TEST_DB_NAME: 'x`; DROP DATABASE licitacao_kanban; --_test' });
  assert.equal(result.name, undefined);
  assert.match(result.skip, /letras, números e _/);
});

test('aceita um banco separado terminado em _test', () => {
  const result = resolveTestDatabase({ DB_NAME: 'licitacao_kanban', TEST_DB_NAME: 'licitacao_kanban_test' });
  assert.deepEqual(result, { name: 'licitacao_kanban_test', source: 'licitacao_kanban' });
});
