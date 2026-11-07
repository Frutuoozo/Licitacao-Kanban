import { parse } from 'cookie';

/** Exige o token CSRF nas gravações: o cabeçalho X-CSRF-Token precisa ser igual ao cookie csrf_token. */
export function requireCsrf(req, res, next) {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();

  const cookies = parse(req.headers.cookie || '');
  const csrfCookie = cookies.csrf_token;
  const csrfHeader = req.headers['x-csrf-token'];
  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    return res.status(403).json({ error: 'CSRF token inválido' });
  }
  next();
}
