import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { parse } from 'cookie';
import { CORS_ORIGINS } from './config.js';
import { getJwtSecret } from './security.js';
import db from './db.js';

let io;

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: CORS_ORIGINS, credentials: true }
  });

  io.use(async (socket, next) => {
    const cookies = parse(socket.request.headers.cookie || '');
    const token = cookies.auth_token;
    if (!token) return next(new Error('Unauthorized'));
    try {
      const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
      const [users] = await db.query('SELECT id, session_version FROM users WHERE id = ? LIMIT 1', [decoded.id]);
      if (users.length === 0) return next(new Error('Unauthorized'));
      if ((decoded.ver ?? 0) !== (users[0].session_version || 0)) return next(new Error('Unauthorized'));
      socket.userId = decoded.id;
      socket.tokenExpiresAt = decoded.exp ? decoded.exp * 1000 : null;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  // O token só é conferido na entrada: sem isto, um socket aberto seguia recebendo os avisos depois de o
  // login (8 h) vencer. Fecha o transporte no vencimento, como em closeUserSockets: o cliente tenta voltar
  // com o mesmo cookie e a entrada recusa o token vencido.
  io.on('connection', (socket) => {
    if (!socket.tokenExpiresAt) return;
    const expiry = setTimeout(() => socket.conn.close(), Math.max(0, socket.tokenExpiresAt - Date.now()));
    expiry.unref();
    socket.on('disconnect', () => clearTimeout(expiry));
  });

  return io;
}

export function getIO() {
  return io;
}

// Chamar depois de invalidar as sessões do usuário ou excluí-lo. Fecha só o transporte (e não socket.disconnect):
// o cliente tenta reconectar, então quem tem sessão válida volta e quem foi revogado é barrado na entrada.
export function closeUserSockets(userId) {
  if (!io) return;
  for (const socket of io.of('/').sockets.values()) {
    if (socket.userId === userId) socket.conn.close();
  }
}
