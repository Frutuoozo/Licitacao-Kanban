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
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('disconnect', () => {});
  });

  return io;
}

export function getIO() {
  return io;
}
