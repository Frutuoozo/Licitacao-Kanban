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
