import dotenv from 'dotenv';

dotenv.config();

const configuredOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

export const CORS_ORIGINS = configuredOrigins;
