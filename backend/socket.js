import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

let io;

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: '*' }
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Unauthorized'));
    try {
      jwt.verify(token, process.env.JWT_SECRET || 'secret-licitacao-123');
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
