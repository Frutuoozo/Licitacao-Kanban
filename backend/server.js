import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { parse } from 'cookie';
import authRouter from './routes/auth.js';
import processesRouter from './routes/processes.js';
import templatesRouter from './routes/templates.js';
import contractsRouter from './routes/contracts.js';
import adminRouter from './routes/admin.js';
import sectorsRouter from './routes/sectors.js';
import contractModalitiesRouter from './routes/contractModalities.js';
import settingsRouter from './routes/settings.js';
import collaboratorsRouter from './routes/collaborators.js';
import { verifyToken } from './middleware/auth.js';
import { requireAdmin } from './middleware/admin.js';
import { requireCsrf } from './middleware/csrf.js';
import db from './db.js';
import { migrateDemandPriority, migrateDemands } from './demandsMigration.js';
import { initSocket } from './socket.js';
import { CORS_ORIGINS, configureClientIp } from './config.js';
import { getJwtSecret } from './security.js';

dotenv.config();

const app = express();
const httpServer = http.createServer(app);
getJwtSecret();
initSocket(httpServer);

const PORT = process.env.PORT || 3001;

app.disable('x-powered-by');
configureClientIp(app, process.env);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: CORS_ORIGINS, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], exposedHeaders: ['X-CSRF-Token'] }));
// gzip nas respostas (a lista de processos cresce com os arquivados; JSON fica ~4x menor).
// Só comprime tipos compressíveis acima de 1 KB; PDFs e imagens anexados seguem como estão.
app.use(compression());
app.use(express.json({ limit: '100kb' }));

// Site e API em domínios diferentes (Vercel x Render): o site não consegue ler o cookie csrf_token
// da API. Por isso o token também segue no cabeçalho X-CSRF-Token, visível só para origens liberadas no CORS.
app.use((req, res, next) => {
  const csrfCookie = parse(req.headers.cookie || '').csrf_token;
  if (csrfCookie) res.setHeader('X-CSRF-Token', csrfCookie);
  next();
});

// Basic health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Mount routers
app.use('/api/auth', authRouter);
app.use('/api/admin', verifyToken, requireCsrf, requireAdmin, adminRouter);
app.use('/api/sectors', verifyToken, requireCsrf, sectorsRouter);
app.use('/api/contract-modalities', verifyToken, requireCsrf, contractModalitiesRouter);
app.use('/api/settings', verifyToken, requireCsrf, settingsRouter);
app.use('/api/collaborators', verifyToken, requireCsrf, collaboratorsRouter);
app.use('/api/contracts', verifyToken, requireCsrf, contractsRouter);
app.use('/api/processes', verifyToken, requireCsrf, processesRouter);
app.use('/api/templates', verifyToken, requireCsrf, templatesRouter);

// Rota da API que não existe: responde em JSON (antes vinha a página HTML padrão do Express).
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// Tratador de erros global: tudo que chegar aqui responde em JSON, sem expor detalhes internos.
// Pega erros da leitura do corpo (JSON malformado, arquivo grande demais) e qualquer erro que uma rota repasse.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Conteúdo da requisição inválido (JSON malformado).' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Conteúdo grande demais para ser enviado.' });
  const status = err.status || err.statusCode;
  if (status >= 400 && status < 500) return res.status(status).json({ error: 'Requisição inválida.' });
  console.error(`Erro em ${req.method} ${req.originalUrl}:`, err);
  return res.status(500).json({ error: 'Erro interno do servidor.' });
});

// Rede de segurança: uma promise rejeitada sem tratamento não deve derrubar o servidor inteiro
// (o padrão do Node é encerrar o processo). Fica registrada no log para ser corrigida na origem.
process.on('unhandledRejection', (reason) => {
  console.error('Promise rejeitada sem tratamento:', reason);
});

// Migrations: cada uma confere se já foi aplicada, então rodar de novo é seguro.
// Qualquer erro aqui é repassado para start(), que impede o servidor de subir com o banco pela metade.
async function runMigrations() {
  // Estrutura atual do banco numa consulta só (antes: uma consulta ao INFORMATION_SCHEMA por migration).
  // Toda tabela tem colunas, então a lista de colunas também diz quais tabelas existem.
  const [schemaRows] = await db.query(
    `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE()`
  );
  const tables = new Set(schemaRows.map((row) => row.TABLE_NAME));
  const columnTypes = new Map(schemaRows.map((row) => [`${row.TABLE_NAME}.${row.COLUMN_NAME}`, row.COLUMN_TYPE]));
  const hasTable = (table) => tables.has(table);
  const hasColumn = (table, column) => columnTypes.has(`${table}.${column}`);

  // Migration 001: coluna role em users
  if (!hasColumn('users', 'role')) {
    await db.query(`ALTER TABLE users ADD COLUMN role ENUM('user','admin') NOT NULL DEFAULT 'user'`);
    const [users] = await db.query('SELECT id FROM users ORDER BY created_at ASC LIMIT 1');
    if (users.length > 0) {
      await db.query('UPDATE users SET role = ? WHERE id = ?', ['admin', users[0].id]);
    }
    // A 007 lê o tipo desta coluna logo abaixo.
    columnTypes.set('users.role', "enum('user','admin')");
    console.log('Migration 001: coluna role adicionada.');
  }

  // Migration 002: coluna due_date em processes
  if (!hasColumn('processes', 'due_date')) {
    await db.query(`ALTER TABLE processes ADD COLUMN due_date DATE NULL`);
    console.log('Migration 002: coluna due_date adicionada em processes.');
  }

  // Migration 003: tabela sectors
  if (!hasTable('sectors')) {
    await db.query(`
      CREATE TABLE sectors (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Migration 003: tabela sectors criada.');
  }

  // Migration 004: tabela collaborators
  if (!hasTable('collaborators')) {
    await db.query(`
      CREATE TABLE collaborators (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        cpf VARCHAR(18) UNIQUE NOT NULL,
        email VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Migration 004: tabela collaborators criada.');
  }

  // Migration 005: coluna first_access em users
  if (!hasColumn('users', 'first_access')) {
    await db.query(`ALTER TABLE users ADD COLUMN first_access BOOLEAN NOT NULL DEFAULT TRUE`);
    await db.query(`UPDATE users SET first_access = FALSE WHERE password_hash != ''`);
    console.log('Migration 005: coluna first_access adicionada.');
  }

  // Migration 006: coluna session_version em users
  if (!hasColumn('users', 'session_version')) {
    await db.query(`ALTER TABLE users ADD COLUMN session_version INT NOT NULL DEFAULT 0`);
    console.log('Migration 006: coluna session_version adicionada.');
  }

  // Migration 007: atualizar ENUM role para admin, editor, viewer
  const roleType = columnTypes.get('users.role');
  if (roleType && !roleType.includes('editor')) {
    await db.query(`UPDATE users SET role = 'editor' WHERE role = 'user'`);
    await db.query(`ALTER TABLE users MODIFY COLUMN role ENUM('admin', 'editor', 'viewer') NOT NULL DEFAULT 'viewer'`);
    console.log('Migration 006: ENUM role atualizado para admin, editor, viewer.');
  }

  // Migration 008: contratos ativos com cadastro manual
  if (!hasTable('contracts')) {
    await db.query(`
      CREATE TABLE contracts (
        id VARCHAR(36) PRIMARY KEY,
        process_name VARCHAR(255) NOT NULL,
        object_description TEXT NOT NULL,
        process_number VARCHAR(120) NOT NULL,
        contract_value DECIMAL(15,2) NOT NULL,
        due_date DATE NOT NULL,
        fiscal_effective VARCHAR(255) NOT NULL,
        fiscal_substitute VARCHAR(255) NULL,
        modality VARCHAR(120) NOT NULL,
        law_type ENUM('old', 'new') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_contracts_due_date (due_date),
        INDEX idx_contracts_modality (modality),
        INDEX idx_contracts_process_number (process_number)
      )
    `);
    console.log('Migration 008: tabela contracts criada.');
  }

  // Migration 009: modalidades de contrato (cadastráveis pelo admin), com as 4 iniciais.
  // A carga inicial só acontece na criação da tabela, para não recriar o que o admin remover.
  if (!hasTable('contract_modalities')) {
    await db.query(`
      CREATE TABLE contract_modalities (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.query(
      'INSERT INTO contract_modalities (name) VALUES (?), (?), (?), (?)',
      ['Dispensa Eletrônica', 'Inexigibilidade', 'Pregão Eletrônico', 'Leilão']
    );
    console.log('Migration 009: tabela contract_modalities criada com as modalidades iniciais.');
  }

  // Migration 010: encerramento manual + histórico de contratos (criação, edições, aditivos, encerramento).
  if (!hasColumn('contracts', 'closed_at')) {
    await db.query(`ALTER TABLE contracts ADD COLUMN closed_at DATE NULL, ADD COLUMN closed_reason VARCHAR(500) NULL`);
    console.log('Migration 010: colunas de encerramento adicionadas em contracts.');
  }
  if (!hasTable('contract_events')) {
    await db.query(`
      CREATE TABLE contract_events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        contract_id VARCHAR(36) NOT NULL,
        type VARCHAR(20) NOT NULL,
        event_date DATE NOT NULL,
        amendment_number TINYINT NULL,
        previous_due_date DATE NULL,
        new_due_date DATE NULL,
        previous_value DECIMAL(15,2) NULL,
        new_value DECIMAL(15,2) NULL,
        notes VARCHAR(500) NULL,
        changes JSON NULL,
        user_id VARCHAR(36) NULL,
        user_name VARCHAR(100) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_contract_events_contract (contract_id, created_at)
      )
    `);
    // Contratos já existentes: a criação (termo de contrato) entra no histórico com a data de cadastro.
    await db.query(`
      INSERT INTO contract_events (contract_id, type, event_date, new_due_date, new_value, notes, created_at)
      SELECT id, 'created', DATE(created_at), due_date, contract_value, 'Termo de contrato', created_at FROM contracts
    `);
    console.log('Migration 010: tabela contract_events criada e criação dos contratos existentes registrada.');
  }

  // Migration 011: valor "Variável" (sem valor definido) no contrato e nos registros do histórico.
  if (!hasColumn('contracts', 'value_variable')) {
    await db.query(`ALTER TABLE contracts ADD COLUMN value_variable TINYINT(1) NOT NULL DEFAULT 0`);
    await db.query(`ALTER TABLE contract_events ADD COLUMN previous_value_variable TINYINT(1) NULL, ADD COLUMN new_value_variable TINYINT(1) NULL`);
    console.log('Migration 011: suporte a valor variável em contratos.');
  }

  // Migration 012: documentos anexados (termo de contrato e termos de aditivo), guardados no banco
  // para não depender do disco do servidor.
  if (!hasTable('contract_documents')) {
    await db.query(`
      CREATE TABLE contract_documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        contract_id VARCHAR(36) NOT NULL,
        event_id INT NULL,
        kind VARCHAR(20) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        size_bytes INT NOT NULL,
        data LONGBLOB NOT NULL,
        user_name VARCHAR(100) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_contract_documents_contract (contract_id)
      )
    `);
    console.log('Migration 012: tabela contract_documents criada.');
  }

  // Migration 013: colaboradores com código interno de matrícula (COD) e status ativo/inativo.
  if (!hasColumn('collaborators', 'codigo')) {
    await db.query(`ALTER TABLE collaborators ADD COLUMN codigo VARCHAR(20) NULL UNIQUE, ADD COLUMN ativo TINYINT(1) NOT NULL DEFAULT 1`);
    await db.query(`UPDATE collaborators SET codigo = CONCAT('COD', LPAD(id, 3, '0')) WHERE codigo IS NULL`);
    console.log('Migration 013: código e status adicionados em collaborators.');
  }

  // Migration 014: configurações administrativas (chave/valor).
  if (!hasTable('app_settings')) {
    await db.query(`
      CREATE TABLE app_settings (
        setting_key VARCHAR(64) PRIMARY KEY,
        setting_value VARCHAR(255) NOT NULL,
        updated_by VARCHAR(36) NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('Migration 014: tabela app_settings criada.');
  }

  // Migration 015: bloqueio por tentativas inválidas e validade da senha.
  if (!hasColumn('users', 'failed_attempts')) {
    await db.query(`ALTER TABLE users
      ADD COLUMN failed_attempts INT NOT NULL DEFAULT 0,
      ADD COLUMN locked_until DATETIME NULL,
      ADD COLUMN password_changed_at DATETIME NULL`);
    // Senhas atuais contam a partir de hoje, para ninguém ser obrigado a trocar logo de cara.
    await db.query(`UPDATE users SET password_changed_at = NOW() WHERE password_changed_at IS NULL`);
    console.log('Migration 015: colunas de bloqueio e validade de senha adicionadas em users.');
  }

  // Migration 016: descrição curta dos modelos de processo (ex.: "Compras e bens").
  if (!hasColumn('templates', 'description')) {
    await db.query(`ALTER TABLE templates ADD COLUMN description VARCHAR(255) NULL`);
    console.log('Migration 016: coluna description adicionada em templates.');
  }

  // Migration 017: página inicial preferida de cada usuário (aberta logo após o login).
  if (!hasColumn('users', 'start_page')) {
    await db.query(`ALTER TABLE users ADD COLUMN start_page VARCHAR(30) NULL`);
    console.log('Migration 017: coluna start_page adicionada em users.');
  }

  // Migration 018: preferências pessoais (tema, letra, alertas, exportação, datas) em JSON.
  if (!hasColumn('users', 'preferences')) {
    await db.query(`ALTER TABLE users ADD COLUMN preferences TEXT NULL`);
    console.log('Migration 018: coluna preferences adicionada em users.');
  }

  // Migration 019: histórico de acessos de cada usuário (aba Segurança do perfil).
  if (!hasTable('login_events')) {
    await db.query(`CREATE TABLE IF NOT EXISTS login_events (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      event VARCHAR(30) NOT NULL,
      ip VARCHAR(64) NULL,
      user_agent VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_login_events_user (user_id, created_at)
    )`);
    console.log('Migration 019: tabela login_events criada.');
  }

  // Migration 020: data em que o processo foi arquivado (concluído), para os gráficos e relatórios.
  // Os já arquivados recebem a última atualização, a melhor informação disponível para eles.
  if (!hasColumn('processes', 'archived_at')) {
    await db.query(`ALTER TABLE processes ADD COLUMN archived_at DATETIME NULL`);
    // updated_at = updated_at: a coluna tem ON UPDATE CURRENT_TIMESTAMP e, sem isso, viraria "agora".
    await db.query(`UPDATE processes SET archived_at = updated_at, updated_at = updated_at WHERE status = 'archived'`);
    console.log('Migration 020: coluna archived_at adicionada em processes.');
  }

  // Migration 021: demandas (situação pendente, data de início e observação).
  if (await migrateDemands(db)) console.log('Migration 021: demandas adicionadas em processes.');

  // Migration 022: prioridade da demanda; os processos existentes ficam como rotina.
  if (await migrateDemandPriority(db)) console.log('Migration 022: coluna priority adicionada em processes.');
}

// Erros de rede ao conectar no MySQL (banco ainda ligando, reiniciando ou fora do ar): vale tentar de novo.
// Outros erros (senha errada, banco inexistente, SQL inválido) não se resolvem esperando: falham na hora.
const TRANSIENT_DB_ERRORS = new Set(['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'PROTOCOL_CONNECTION_LOST']);
const DB_CONNECT_ATTEMPTS = 10;
const DB_RETRY_DELAY_MS = 3000;

async function waitForDatabase() {
  for (let attempt = 1; ; attempt += 1) {
    try {
      await db.query('SELECT 1');
      return;
    } catch (error) {
      if (!TRANSIENT_DB_ERRORS.has(error.code) || attempt >= DB_CONNECT_ATTEMPTS) throw error;
      console.warn(`Banco de dados indisponível (${error.code}). Tentativa ${attempt}/${DB_CONNECT_ATTEMPTS}, nova tentativa em ${DB_RETRY_DELAY_MS / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, DB_RETRY_DELAY_MS));
    }
  }
}

// Só abre a porta depois que o banco respondeu e todas as migrations rodaram.
// Se algo falhar, encerra com código 1: melhor não subir do que subir com o banco incompleto.
async function start() {
  try {
    await waitForDatabase();
    await runMigrations();
  } catch (error) {
    console.error('Não foi possível preparar o banco de dados. O servidor NÃO foi iniciado.');
    console.error(error);
    process.exit(1);
  }
  httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

start();
