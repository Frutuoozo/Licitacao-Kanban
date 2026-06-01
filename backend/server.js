import http from 'http';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRouter from './routes/auth.js';
import processesRouter from './routes/processes.js';
import templatesRouter from './routes/templates.js';
import adminRouter from './routes/admin.js';
import sectorsRouter from './routes/sectors.js';
import collaboratorsRouter from './routes/collaborators.js';
import { verifyToken } from './middleware/auth.js';
import { requireAdmin } from './middleware/admin.js';
import db from './db.js';
import { initSocket } from './socket.js';

dotenv.config();

const app = express();
const httpServer = http.createServer(app);
initSocket(httpServer);

const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Basic health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Mount routers
app.use('/api/auth', authRouter);
app.use('/api/admin', verifyToken, requireAdmin, adminRouter);
app.use('/api/sectors', verifyToken, sectorsRouter);
app.use('/api/collaborators', verifyToken, collaboratorsRouter);
app.use('/api/processes', verifyToken, processesRouter);
app.use('/api/templates', verifyToken, templatesRouter);

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
  } catch (err) {
    console.error('Erro ao executar migrations:', err);
  }
}

runMigrations().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
});
