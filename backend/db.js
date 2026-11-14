import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { resolveDbSsl } from './dbSsl.js';

dotenv.config();

// Configuração de TLS impossível (Aiven sem DB_CA_CERT): nenhuma conexão é aberta, para a senha não sair sem
// TLS confirmado. Em vez de quebrar ao ser importado (o servidor caía com o stack cru e os arquivos de teste
// quebravam inteiros), cada consulta é recusada com a mensagem do que falta: o servidor mostra o aviso de
// "não foi iniciado" e encerra, e os testes de banco são pulados.
function unusablePool(configError) {
  const refuse = () => Promise.reject(configError);
  return { query: refuse, execute: refuse, getConnection: refuse, end: async () => {} };
}

function createPool() {
  let ssl;
  try {
    ssl = resolveDbSsl(process.env);
  } catch (error) {
    return unusablePool(error);
  }
  return mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'licitacao_kanban',
    port: process.env.DB_PORT || 3306,
    ssl,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
}

const pool = createPool();

// Executa `work(conn)` numa transação: commit se der certo, rollback se lançar erro.
// Qualquer falha (inclusive ao abrir a conexão) vira um erro comum que a rota captura no seu try/catch.
// A conexão volta ao pool, exceto quando o rollback falha: aí ela pode estar no meio da transação, com
// linhas travadas, e o próximo pedido rodaria dentro dela. Nesse caso é destruída (o pool abre outra).
export async function withTransaction(work) {
  const conn = await pool.getConnection();
  let reusable = true;
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (error) {
    try {
      await conn.rollback();
    } catch (rollbackError) {
      reusable = false;
      console.error('Falha ao desfazer a transação; a conexão será descartada:', rollbackError);
    }
    throw error;
  } finally {
    if (reusable) conn.release();
    else conn.destroy();
  }
}

export default pool;
