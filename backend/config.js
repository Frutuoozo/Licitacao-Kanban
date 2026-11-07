import { createHash, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';
import dotenv from 'dotenv';

dotenv.config();

const normalizeOrigin = (origin) => {
  if (!origin) return '';
  return origin.trim().replace(/\/$/, '');
};

// Só as origens listadas em FRONTEND_URL (ex.: o domínio da Vercel) podem chamar a API com cookies.
// Nenhuma origem fica liberada fixa no código.
const rawOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001')
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean);

// Remove duplicatas case-insensitive
const seen = new Set();
const configuredOrigins = [];
for (const origin of rawOrigins) {
  const key = origin.toLowerCase();
  if (!seen.has(key)) {
    seen.add(key);
    configuredOrigins.push(origin);
  }
}

const corsOriginHandler = (origin, callback) => {
  if (!origin) {
    callback(null, true);
    return;
  }

  const normalizedOrigin = normalizeOrigin(origin);
  const allowed = configuredOrigins.some(item => normalizeOrigin(item).toLowerCase() === normalizedOrigin.toLowerCase());

  callback(null, allowed);
};

const sha256 = (value) => createHash('sha256').update(value).digest();

// Define o IP de quem acessa (req.ip), usado no limite de tentativas e no histórico de acessos.
// O único proxy sempre confiável é o do Render. O IP informado pela Vercel só vale com o segredo que ela
// envia (ORIGIN_SECRET, em frontend/vercel.json): quem chama o Render direto não consegue forjar o próprio IP.
export function configureClientIp(app, env) {
  const secret = env.ORIGIN_SECRET;
  app.set('trust proxy', 1);
  app.use((req, _res, next) => {
    const sent = req.get('x-origin-secret');
    if (secret && sent && timingSafeEqual(sha256(sent), sha256(secret))) {
      // A Vercel sobrescreve o X-Forwarded-For com o IP do visitante; o Render acrescenta depois dele.
      const visitor = String(req.get('x-forwarded-for') || '').split(',')[0].trim();
      if (isIP(visitor)) Object.defineProperty(req, 'ip', { value: visitor });
    }
    next();
  });
}

export { corsOriginHandler as CORS_ORIGINS };
