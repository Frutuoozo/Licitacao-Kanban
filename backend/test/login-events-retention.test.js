// Histórico de acessos guardado por no máximo 180 dias, para todo mundo: antes, só um login com sucesso
// apagava os registros antigos daquele usuário. Quem só errava a senha (ou nunca mais entrou) acumulava
// IPs e navegadores para sempre. Sobe o servidor de verdade contra o BANCO DE TESTE (TEST_DB_NAME).
import { testDbSkip } from './helpers/useTestDatabase.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import db from '../db.js';

const PORT = 3993;
const BACKEND_DIR = fileURLToPath(new URL('..', import.meta.url));
const USER = { id: 'test-events-retention', username: 'teste_historico_antigo' };

describe('prazo do histórico de acessos', { skip: testDbSkip || false }, () => {
  let server;

  const removeUser = async () => {
    await db.query('DELETE FROM login_events WHERE user_id = ?', [USER.id]);
    await db.query('DELETE FROM users WHERE id = ?', [USER.id]);
  };

  before(async () => {
    await removeUser();
    await db.query(
      "INSERT INTO users (id, username, password_hash, role, first_access, password_changed_at) VALUES (?, ?, 'x', 'viewer', FALSE, NOW())",
      [USER.id, USER.username]
    );
    // Só tentativas erradas, nenhum login com sucesso.
    await db.query(
      `INSERT INTO login_events (user_id, event, ip, user_agent, created_at) VALUES
        (?, 'wrong_password', '10.0.0.1', 'antigo', DATE_SUB(NOW(), INTERVAL 200 DAY)),
        (?, 'locked', '10.0.0.1', 'antigo', DATE_SUB(NOW(), INTERVAL 181 DAY)),
        (?, 'wrong_password', '10.0.0.2', 'recente', DATE_SUB(NOW(), INTERVAL 10 DAY))`,
      [USER.id, USER.id, USER.id]
    );
    server = spawn(process.execPath, ['server.js'], { cwd: BACKEND_DIR, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('servidor de teste não subiu em 20s')), 20000);
      server.stdout.on('data', (chunk) => { if (String(chunk).includes('Server is running')) { clearTimeout(timer); resolve(); } });
      server.on('exit', (code) => { clearTimeout(timer); reject(new Error(`servidor de teste saiu com código ${code}`)); });
    });
  });

  after(async () => {
    server?.kill();
    await removeUser();
    await db.end();
  });

  test('registros com mais de 180 dias somem ao subir o servidor, mesmo sem login com sucesso', async () => {
    const [rows] = await db.query('SELECT user_agent FROM login_events WHERE user_id = ? ORDER BY created_at', [USER.id]);
    assert.deepEqual(rows.map((row) => row.user_agent), ['recente']);
  });
});
