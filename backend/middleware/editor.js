import db from '../db.js';

/** Exige que o usuário autenticado tenha role = admin ou role = editor no banco (req.userId definido por verifyToken). */
export const requireEditorOrAdmin = async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT role FROM users WHERE id = ?', [req.userId]);
    if (rows.length === 0 || (rows[0].role !== 'admin' && rows[0].role !== 'editor')) {
      return res.status(403).json({ error: 'Acesso restrito a editores ou administradores' });
    }
    next();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao verificar permissões' });
  }
};
