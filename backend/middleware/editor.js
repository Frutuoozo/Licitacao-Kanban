import { isEditorOrAdminRole } from '../permissions.js';

/** Exige que o usuário autenticado tenha role = admin ou role = editor (req.userRole lido do banco por verifyToken). */
export const requireEditorOrAdmin = (req, res, next) => {
  if (!isEditorOrAdminRole(req.userRole)) {
    return res.status(403).json({ error: 'Acesso restrito a editores ou administradores' });
  }
  next();
};
