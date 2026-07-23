import dotenv from 'dotenv';

dotenv.config();

const configuredOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

// Aceitar GitHub Pages (case-sensitive)
const githubPagesOrigin = 'https://Frutuoozo.github.io';
if (!configuredOrigins.includes(githubPagesOrigin)) {
  configuredOrigins.push(githubPagesOrigin);
}

export const CORS_ORIGINS = configuredOrigins;
