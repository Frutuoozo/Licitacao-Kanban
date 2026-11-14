// O banco de teste copia a estrutura do banco da aplicação. Antes só copiava tabelas que ainda não existiam:
// coluna nova, tipo alterado ou índice novo nunca chegavam, e os testes rodavam contra uma estrutura antiga.
// Aqui, duas tabelas temporárias dentro do próprio BANCO DE TESTE fazem o papel de "aplicação" e "teste".
import { testDbSkip } from './helpers/useTestDatabase.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import db from '../db.js';
import { syncTableStructure } from './helpers/testDatabase.js';

const SOURCE = 'zz_estrutura_origem';
const TARGET = 'zz_estrutura_copia';

describe('estrutura do banco de teste acompanha a da aplicação', { skip: testDbSkip || false }, () => {
  let schema;
  const columns = async (table) => (await db.query(
    'SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION',
    [schema, table]
  ))[0].map((c) => `${c.name}:${c.type}`);
  const indexes = async (table) => (await db.query(
    'SELECT DISTINCT INDEX_NAME AS name FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY INDEX_NAME',
    [schema, table]
  ))[0].map((i) => i.name);
  const dropBoth = () => db.query(`DROP TABLE IF EXISTS \`${SOURCE}\`, \`${TARGET}\``);
  const sync = () => syncTableStructure(db, { schema, table: SOURCE }, { schema, table: TARGET });

  before(async () => {
    [[{ name: schema }]] = await db.query('SELECT DATABASE() AS name');
    assert.ok(schema.endsWith('_test'), `banco inesperado: ${schema}`);
    await dropBoth();
  });
  after(async () => {
    await dropBoth();
    await db.end();
  });

  test('tabela que não existe é criada', async () => {
    await db.query(`CREATE TABLE \`${SOURCE}\` (id INT PRIMARY KEY, nome VARCHAR(50))`);
    assert.equal(await sync(), 'created');
    assert.deepEqual(await columns(TARGET), await columns(SOURCE));
  });

  test('coluna nova, tipo alterado e índice novo chegam à cópia', async () => {
    await db.query(`ALTER TABLE \`${SOURCE}\` ADD COLUMN prioridade ENUM('alta','baixa') NOT NULL DEFAULT 'baixa', MODIFY nome VARCHAR(120), ADD INDEX idx_nome (nome)`);
    assert.equal(await sync(), 'recreated');
    assert.deepEqual(await columns(TARGET), await columns(SOURCE));
    assert.deepEqual(await indexes(TARGET), await indexes(SOURCE));
  });

  test('mesma coluna em outra posição também conta como diferente', async () => {
    await db.query(`ALTER TABLE \`${TARGET}\` MODIFY prioridade ENUM('alta','baixa') NOT NULL DEFAULT 'baixa' AFTER id`);
    assert.equal(await sync(), 'recreated');
    assert.deepEqual(await columns(TARGET), await columns(SOURCE));
  });

  test('só um índice novo, sem mudar colunas, também chega à cópia', async () => {
    await db.query(`ALTER TABLE \`${SOURCE}\` ADD INDEX idx_prioridade (prioridade)`);
    assert.equal(await sync(), 'recreated');
    assert.deepEqual(await indexes(TARGET), await indexes(SOURCE));
  });

  test('estrutura igual: nada é recriado e os dados ficam', async () => {
    await db.query(`INSERT INTO \`${TARGET}\` (id, nome) VALUES (1, 'continua aqui')`);
    assert.equal(await sync(), 'unchanged');
    const [[row]] = await db.query(`SELECT nome FROM \`${TARGET}\` WHERE id = 1`);
    assert.equal(row.nome, 'continua aqui');
  });

  test('nunca recria fora de um banco *_test', async () => {
    await assert.rejects(
      syncTableStructure(db, { schema, table: SOURCE }, { schema: 'licitacao_kanban', table: TARGET }),
      /_test/
    );
  });
});
