// Decide qual banco os testes podem usar. Os testes que gravam dados NUNCA usam o banco da aplicação
// (nem o local, nem o de produção): só um banco separado, informado em TEST_DB_NAME, cujo nome termina
// em "_test". Sem isso, ou com NODE_ENV=production, esses testes são pulados.
export function resolveTestDatabase(env) {
  const name = (env.TEST_DB_NAME || '').trim();
  const source = env.DB_NAME || 'licitacao_kanban';
  if (env.NODE_ENV === 'production') return { skip: 'testes de banco nunca rodam em produção (NODE_ENV=production)' };
  if (!name) return { skip: 'defina TEST_DB_NAME (ex.: licitacao_kanban_test) no .env para rodar os testes de banco' };
  // O nome entra direto em comandos SQL (CREATE TABLE `nome`.`tabela`): só letras, números e _.
  if (!/^[A-Za-z0-9_]+$/.test(name)) return { skip: `o nome do banco de teste aceita só letras, números e _ (recebido: ${name})` };
  if (name === source) return { skip: `TEST_DB_NAME aponta para o mesmo banco da aplicação (${source})` };
  if (!name.endsWith('_test')) return { skip: `o nome do banco de teste precisa terminar em _test (recebido: ${name})` };
  return { name, source };
}

// Estrutura de uma tabela para comparação: colunas (na ordem) e índices. Chaves estrangeiras ficam de fora,
// porque CREATE TABLE ... LIKE não as copia (a cópia nunca teria e pareceria sempre diferente).
async function tableStructure(conn, { schema, table }) {
  const [columns] = await conn.query(
    `SELECT COLUMN_NAME, ORDINAL_POSITION, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA, COLLATION_NAME
     FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`,
    [schema, table]
  );
  const [indexes] = await conn.query(
    `SELECT INDEX_NAME, SEQ_IN_INDEX, COLUMN_NAME, NON_UNIQUE
     FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    [schema, table]
  );
  return columns.length ? JSON.stringify({ columns, indexes }) : null;
}

// Deixa `target` com a mesma estrutura de `source`: cria se não existe; se mudou (coluna nova, tipo, ordem,
// índice), apaga e recria vazia. Os dados do banco de teste são descartáveis: cada teste cria os seus.
// Só mexe em banco cujo nome termina em _test.
export async function syncTableStructure(conn, source, target) {
  if (!String(target.schema).endsWith('_test')) {
    throw new Error(`a estrutura só é recriada em banco de teste (*_test); recebido: ${target.schema}`);
  }
  const quoted = (t) => `\`${t.schema}\`.\`${t.table}\``;
  const wanted = await tableStructure(conn, source);
  const current = await tableStructure(conn, target);
  if (current === wanted) return 'unchanged';
  if (current !== null) await conn.query(`DROP TABLE ${quoted(target)}`);
  await conn.query(`CREATE TABLE ${quoted(target)} LIKE ${quoted(source)}`);
  return current === null ? 'created' : 'recreated';
}
