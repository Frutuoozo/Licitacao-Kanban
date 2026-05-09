import db from '../db.js';

/** Exige que o usuário autenticado tenha role = admin no banco (req.userId definido por verifyToken). */
export const requireAdmin = async (req, res, next) => {
  try {
    const [rows] = await db.query('SELECT role FROM users WHERE id = ?', [req.userId]);
    if (rows.length === 0 || rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Acesso restrito a administradores' });
    }
    next();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro ao verificar permissões' });
  }
};
