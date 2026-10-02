import dotenv from 'dotenv';

dotenv.config();

const normalizeOrigin = (origin) => {
  if (!origin) return '';
  return origin.trim().replace(/\/$/, '');
};

const rawOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:3001,http://127.0.0.1:3001')
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean);

// Compatibilidade com GitHub Pages e com domínios Vercel
rawOrigins.push('https://frutuoozo.github.io');

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

export { corsOriginHandler as CORS_ORIGINS };
