import { isAdminRole } from '../permissions.js';

/** Exige que o usuário autenticado tenha role = admin (req.userRole lido do banco por verifyToken). */
export const requireAdmin = (req, res, next) => {
  if (!isAdminRole(req.userRole)) {
    return res.status(403).json({ error: 'Acesso restrito a administradores' });
  }
  next();
};
