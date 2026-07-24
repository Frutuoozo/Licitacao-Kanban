import dotenv from 'dotenv';

dotenv.config();

const rawOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

// GitHub Pages — normalizado para lowercase (browsers enviam Origin em lowercase)
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

export { configuredOrigins as CORS_ORIGINS };
