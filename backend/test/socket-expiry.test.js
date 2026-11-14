// Tempo real com o login vencido: o token só era conferido na entrada, e um socket aberto continuava
// recebendo os avisos (processos, contratos) depois de as 8 h do login acabarem. Agora a conexão fecha
// quando o token vence, e a reconexão com o mesmo token é recusada.
// Servidor e cliente reais do Socket.IO; usuário temporário no BANCO DE TESTE (TEST_DB_NAME).
import { testDbSkip } from './helpers/useTestDatabase.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import { io as connect } from 'socket.io-client';
import db from '../db.js';
import { getJwtSecret } from '../security.js';
import { getIO, initSocket } from '../socket.js';

const USER = { id: 'test-socket-expiry', username: 'teste_socket_validade' };

describe('tempo real quando o login vence', { skip: testDbSkip || false }, () => {
  let httpServer;
  let url;
  const clients = [];

  const removeUser = () => db.query('DELETE FROM users WHERE id = ?', [USER.id]);
  const tokenValidFor = (seconds) => jwt.sign({ id: USER.id, ver: 0 }, getJwtSecret(), { algorithm: 'HS256', expiresIn: seconds });
  const open = (token) => {
    const client = connect(url, { extraHeaders: { Cookie: `auth_token=${token}` }, transports: ['websocket'], reconnectionDelay: 200, reconnectionDelayMax: 200 });
    clients.push(client);
    return client;
  };

  before(async () => {
    await removeUser();
    await db.query(
      "INSERT INTO users (id, username, password_hash, role, first_access, session_version, password_changed_at) VALUES (?, ?, 'x', 'viewer', FALSE, 0, NOW())",
      [USER.id, USER.username]
    );
    httpServer = http.createServer();
    initSocket(httpServer);
    httpServer.listen(0);
    await once(httpServer, 'listening');
    url = `http://127.0.0.1:${httpServer.address().port}`;
  });

  after(async () => {
    clients.forEach((client) => client.close());
    getIO()?.close();
    httpServer?.close();
    await removeUser();
    await db.end();
  });

  test('a conexão fecha quando o token vence e não volta com o mesmo token', async () => {
    const client = open(tokenValidFor(2));
    await once(client, 'connect');
    const connectedAt = Date.now();

    let refused = false;
    client.on('connect_error', () => { refused = true; });
    const [reason] = await Promise.race([
      once(client, 'disconnect'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('o socket continuou aberto depois de o token vencer')), 4500)),
    ]);
    const elapsed = Date.now() - connectedAt;
    assert.ok(elapsed >= 900, `fechou cedo demais (${elapsed} ms), antes de o token vencer`);
    assert.notEqual(reason, 'io client disconnect');

    // O cliente tenta voltar sozinho; com o token vencido, a entrada recusa.
    await new Promise((resolve) => setTimeout(resolve, 1000));
    assert.equal(client.connected, false, 'reconectou com o token vencido');
    assert.ok(refused, 'a reconexão não foi recusada');
  });

  test('token válido por mais tempo continua conectado', async () => {
    const client = open(tokenValidFor(60));
    await once(client, 'connect');
    await new Promise((resolve) => setTimeout(resolve, 2500));
    assert.equal(client.connected, true);
  });
});
