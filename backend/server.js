import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
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
import db from './db.js';
import { initSocket } from './socket.js';
import { CORS_ORIGINS } from './config.js';
import { getJwtSecret } from './security.js';

dotenv.config();

const app = express();
const httpServer = http.createServer(app);
getJwtSecret();
initSocket(httpServer);

const PORT = process.env.PORT || 3001;

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: CORS_ORIGINS, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] }));
app.use(express.json({ limit: '100kb' }));

function requireCsrf(req, res, next) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();

  const cookies = parse(req.headers.cookie || '');
  const csrfCookie = cookies.csrf_token;
  const csrfHeader = req.headers['x-csrf-token'];
  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    return res.status(403).json({ error: 'CSRF token inválido' });
  }
  next();
}

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

async function runMigrations() {
  try {
    // Migration 001: coluna role em users
    const [cols] = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'`
    );
    if (cols.length === 0) {
      await db.query(`ALTER TABLE users ADD COLUMN role ENUM('user','admin') NOT NULL DEFAULT 'user'`);
      const [users] = await db.query('SELECT id FROM users ORDER BY created_at ASC LIMIT 1');
      if (users.length > 0) {
        await db.query('UPDATE users SET role = ? WHERE id = ?', ['admin', users[0].id]);
      }
      console.log('Migration 001: coluna role adicionada.');
    }

    // Migration 002: coluna due_date em processes
    const [dueDateCols] = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'processes' AND COLUMN_NAME = 'due_date'`
    );
    if (dueDateCols.length === 0) {
      await db.query(`ALTER TABLE processes ADD COLUMN due_date DATE NULL`);
      console.log('Migration 002: coluna due_date adicionada em processes.');
    }

    // Migration 003: tabela sectors
    const [tables] = await db.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sectors'`
    );
    if (tables.length === 0) {
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
    const [collabTables] = await db.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'collaborators'`
    );
    if (collabTables.length === 0) {
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
    const [firstAccessCols] = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'first_access'`
    );
    if (firstAccessCols.length === 0) {
      await db.query(`ALTER TABLE users ADD COLUMN first_access BOOLEAN NOT NULL DEFAULT TRUE`);
      await db.query(`UPDATE users SET first_access = FALSE WHERE password_hash != ''`);
      console.log('Migration 005: coluna first_access adicionada.');
    }

    // Migration 006: coluna session_version em users
    const [sessionVersionCols] = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'session_version'`
    );
    if (sessionVersionCols.length === 0) {
      await db.query(`ALTER TABLE users ADD COLUMN session_version INT NOT NULL DEFAULT 0`);
      console.log('Migration 006: coluna session_version adicionada.');
    }

    // Migration 007: atualizar ENUM role para admin, editor, viewer
    const [roleType] = await db.query(
      `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'`
    );
    if (roleType.length > 0 && !roleType[0].COLUMN_TYPE.includes('editor')) {
      await db.query(`UPDATE users SET role = 'editor' WHERE role = 'user'`);
      await db.query(`ALTER TABLE users MODIFY COLUMN role ENUM('admin', 'editor', 'viewer') NOT NULL DEFAULT 'viewer'`);
      console.log('Migration 006: ENUM role atualizado para admin, editor, viewer.');
    }

    // Migration 008: contratos ativos com cadastro manual
    const [contractTables] = await db.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contracts'`
    );
    if (contractTables.length === 0) {
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
    const [modalityTables] = await db.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contract_modalities'`
    );
    if (modalityTables.length === 0) {
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
    const [closedCols] = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contracts' AND COLUMN_NAME = 'closed_at'`
    );
    if (closedCols.length === 0) {
      await db.query(`ALTER TABLE contracts ADD COLUMN closed_at DATE NULL, ADD COLUMN closed_reason VARCHAR(500) NULL`);
      console.log('Migration 010: colunas de encerramento adicionadas em contracts.');
    }
    const [eventTables] = await db.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contract_events'`
    );
    if (eventTables.length === 0) {
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
    const [variableCols] = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contracts' AND COLUMN_NAME = 'value_variable'`
    );
    if (variableCols.length === 0) {
      await db.query(`ALTER TABLE contracts ADD COLUMN value_variable TINYINT(1) NOT NULL DEFAULT 0`);
      await db.query(`ALTER TABLE contract_events ADD COLUMN previous_value_variable TINYINT(1) NULL, ADD COLUMN new_value_variable TINYINT(1) NULL`);
      console.log('Migration 011: suporte a valor variável em contratos.');
    }

    // Migration 012: documentos anexados (termo de contrato e termos de aditivo), guardados no banco
    // para não depender do disco do servidor.
    const [docTables] = await db.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contract_documents'`
    );
    if (docTables.length === 0) {
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
    const [codCols] = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'collaborators' AND COLUMN_NAME = 'codigo'`
    );
    if (codCols.length === 0) {
      await db.query(`ALTER TABLE collaborators ADD COLUMN codigo VARCHAR(20) NULL UNIQUE, ADD COLUMN ativo TINYINT(1) NOT NULL DEFAULT 1`);
      await db.query(`UPDATE collaborators SET codigo = CONCAT('COD', LPAD(id, 3, '0')) WHERE codigo IS NULL`);
      console.log('Migration 013: código e status adicionados em collaborators.');
    }

    // Migration 014: configurações administrativas (chave/valor).
    const [settingsTables] = await db.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_settings'`
    );
    if (settingsTables.length === 0) {
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
    const [lockCols] = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'failed_attempts'`
    );
    if (lockCols.length === 0) {
      await db.query(`ALTER TABLE users
        ADD COLUMN failed_attempts INT NOT NULL DEFAULT 0,
        ADD COLUMN locked_until DATETIME NULL,
        ADD COLUMN password_changed_at DATETIME NULL`);
      // Senhas atuais contam a partir de hoje, para ninguém ser obrigado a trocar logo de cara.
      await db.query(`UPDATE users SET password_changed_at = NOW() WHERE password_changed_at IS NULL`);
      console.log('Migration 015: colunas de bloqueio e validade de senha adicionadas em users.');
    }

    // Migration 016: descrição curta dos modelos de processo (ex.: "Compras e bens").
    const [descCols] = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'templates' AND COLUMN_NAME = 'description'`
    );
    if (descCols.length === 0) {
      await db.query(`ALTER TABLE templates ADD COLUMN description VARCHAR(255) NULL`);
      console.log('Migration 016: coluna description adicionada em templates.');
    }
  } catch (err) {
    console.error('Erro ao executar migrations:', err);
  }
}

runMigrations().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
});
