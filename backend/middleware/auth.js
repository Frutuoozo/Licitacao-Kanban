import jwt from 'jsonwebtoken';
import { parse } from 'cookie';
import db from '../db.js';
import { getJwtSecret } from '../security.js';

function getCookieToken(req) {
  const cookies = parse(req.headers.cookie || '');
  return cookies.auth_token || null;
}

export const verifyToken = (req, res, next) => {
  const token = getCookieToken(req);
  if (!token) {
    return res.status(401).json({ error: 'No session' });
  }

  try {
    const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ['HS256'] });
    db.query('SELECT session_version FROM users WHERE id = ? LIMIT 1', [decoded.id])
      .then(([rows]) => {
        if (rows.length === 0) {
          return res.status(401).json({ error: 'Unauthorized!' });
        }
        const currentVersion = rows[0].session_version || 0;
        if ((decoded.ver ?? 0) !== currentVersion) {
          return res.status(401).json({ error: 'Session expired' });
        }
        req.userId = decoded.id;
        next();
      })
      .catch(() => res.status(500).json({ error: 'Erro ao verificar sessão' }));
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized!' });
  }
};
