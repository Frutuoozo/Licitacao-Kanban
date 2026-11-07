// Importe ESTE arquivo como primeiro import de qualquer teste que use o banco: ele troca DB_NAME pelo
// banco de teste antes de db.js ser carregado (db.js lê DB_NAME uma vez, ao abrir o pool).
// Servidores e scripts iniciados pelo teste herdam o mesmo process.env, então também usam o banco de teste.
//
// O banco de teste recebe a estrutura de tabelas do banco da aplicação (CREATE TABLE ... LIKE), sem
// copiar nenhum dado. Se não der para usá-lo, `testDbSkip` traz o motivo e os testes de banco são pulados.
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { resolveDbSsl } from '../../dbSsl.js';
import { resolveTestDatabase } from './testDatabase.js';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

const resolved = resolveTestDatabase(process.env);
let skip = resolved.skip || null;

// Daqui em diante, nada deste processo enxerga o banco da aplicação. Se o banco de teste não puder ser
// usado, aponta para um nome que não existe: qualquer consulta esquecida falha em vez de gravar dados reais.
process.env.DB_NAME = resolved.name || '__sem_banco_de_teste__';

if (!skip) {
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      port: process.env.DB_PORT || 3306,
      ssl: resolveDbSsl(process.env),
    });
    try {
      const [schemas] = await conn.query('SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?', [resolved.name]);
      if (schemas.length === 0) {
        skip = `o banco de teste ${resolved.name} não existe (veja como criar em backend/.env.example)`;
      } else {
        const [tables] = await conn.query(
          "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'",
          [resolved.source]
        );
        for (const { TABLE_NAME: table } of tables) {
          await conn.query(`CREATE TABLE IF NOT EXISTS \`${resolved.name}\`.\`${table}\` LIKE \`${resolved.source}\`.\`${table}\``);
        }
      }
    } finally {
      await conn.end();
    }
  } catch (error) {
    skip = `banco de teste indisponível (${error.code || error.message})`;
  }
}

export const testDbSkip = skip;
