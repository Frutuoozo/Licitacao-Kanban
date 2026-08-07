import dotenv from 'dotenv';

dotenv.config();

const normalizeOrigin = (origin) => {
  if (!origin) return '';
  return origin.trim().replace(/\/$/, '');
};

const rawOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000,http://127.0.0.1:3000')
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

const isVercelOrigin = (origin) => {
  if (!origin) return false;

  try {
    const { hostname } = new URL(origin);
    return hostname === 'vercel.app' || hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
};

const corsOriginHandler = (origin, callback) => {
  if (!origin) {
    callback(null, true);
    return;
  }

  const normalizedOrigin = normalizeOrigin(origin);
  const allowed = configuredOrigins.some(item => normalizeOrigin(item).toLowerCase() === normalizedOrigin.toLowerCase())
    || isVercelOrigin(normalizedOrigin);

  callback(null, allowed);
};

export { corsOriginHandler as CORS_ORIGINS };
