import { randomBytes } from 'crypto';

const MIN_PASSWORD_LENGTH = 8;
const developmentJwtSecret = randomBytes(48).toString('base64url');
const isProduction = process.env.NODE_ENV === 'production';

export function buildAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 60 * 60 * 1000,
  };
}

export function buildCsrfCookieOptions() {
  return {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 8 * 60 * 60 * 1000,
  };
}

export function generateCsrfToken() {
  return randomBytes(32).toString('base64url');
}

export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return `A senha deve conter no mínimo ${MIN_PASSWORD_LENGTH} caracteres`;
  }
  // Política forte: 8+ caracteres, 1 maiúscula, 1 número e 1 caractere especial.
  if (!/[A-Z]/.test(password)) return 'A senha deve conter pelo menos uma letra maiúscula';
  if (!/[0-9]/.test(password)) return 'A senha deve conter pelo menos um número';
  if (!/[^a-zA-Z0-9]/.test(password)) {
    return 'A senha deve conter pelo menos um caractere especial';
  }
  return null;
}

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV !== 'production') return developmentJwtSecret;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET deve ser configurado com pelo menos 32 caracteres');
  }
}
