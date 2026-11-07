import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { resolveDbSsl } from './dbSsl.js';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'licitacao_kanban',
  port: process.env.DB_PORT || 3306,
  ssl: resolveDbSsl(process.env),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Executa `work(conn)` numa transação: commit se der certo, rollback se lançar erro.
// A conexão sempre volta ao pool, e qualquer falha (inclusive ao abrir a conexão) vira um erro
// comum que a rota captura no seu try/catch — nada escapa e derruba o processo.
export async function withTransaction(work) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback().catch(() => {});
    throw error;
  } finally {
    conn.release();
  }
}

export default pool;
