// Só as origens do FRONTEND_URL podem chamar a API com cookies (e ler o token CSRF do cabeçalho).
import test from 'node:test';
import assert from 'node:assert/strict';

// Definido antes de carregar config.js (o dotenv não sobrescreve variáveis já definidas).
process.env.FRONTEND_URL = 'https://licitacao.vercel.app, http://localhost:3000/';
const { CORS_ORIGINS: corsOrigin } = await import('../config.js');

const isAllowed = (origin) => new Promise((resolve, reject) => {
  corsOrigin(origin, (error, allowed) => (error ? reject(error) : resolve(allowed)));
});

test('libera as origens configuradas em FRONTEND_URL', async () => {
  assert.equal(await isAllowed('https://licitacao.vercel.app'), true);
  assert.equal(await isAllowed('http://localhost:3000'), true);
});

test('bloqueia o antigo GitHub Pages quando ele não está em FRONTEND_URL', async () => {
  assert.equal(await isAllowed('https://frutuoozo.github.io'), false);
});

test('bloqueia origens desconhecidas', async () => {
  assert.equal(await isAllowed('https://site-malicioso.example'), false);
});
