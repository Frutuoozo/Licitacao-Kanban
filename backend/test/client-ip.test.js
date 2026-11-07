// O IP de quem acessa (limite de tentativas e histórico de acessos) só pode vir do X-Forwarded-For quando
// o pedido provou que passou pela Vercel. Quem chama o Render direto pode escrever o que quiser nesse cabeçalho.
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { configureClientIp } from '../config.js';

const SECRET = 'segredo-de-teste-com-tamanho-suficiente';
const VISITOR = '203.0.113.9';
const FORGED = '10.9.8.7';
// O último endereço é o que o proxy do Render viu: o da Vercel, ou o de quem chamou direto.
const LAST_HOP = '198.51.100.7';

async function ipSeenByBackend(env, headers) {
  const app = express();
  configureClientIp(app, env);
  app.get('/', (req, res) => res.json({ ip: req.ip }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/`, { headers });
    return (await res.json()).ip;
  } finally {
    server.close();
  }
}

test('com o segredo certo, o backend vê o IP do visitante informado pela Vercel', async () => {
  const ip = await ipSeenByBackend({ ORIGIN_SECRET: SECRET }, {
    'X-Origin-Secret': SECRET,
    'X-Forwarded-For': `${VISITOR}, ${LAST_HOP}`,
  });
  assert.equal(ip, VISITOR);
});

test('sem o segredo, um IP forjado é ignorado', async () => {
  const ip = await ipSeenByBackend({ ORIGIN_SECRET: SECRET }, { 'X-Forwarded-For': `${FORGED}, ${LAST_HOP}` });
  assert.equal(ip, LAST_HOP);
});

for (const [name, sent] of [
  ['errado', 'chute'],
  ['com o mesmo tamanho, mas diferente', SECRET.replace(/.$/, '#')],
  ['maior que o certo', `${SECRET}x`],
  ['literal, de quando a variável falta na Vercel', '$ORIGIN_SECRET'],
]) {
  test(`segredo ${name} não vale`, async () => {
    const ip = await ipSeenByBackend({ ORIGIN_SECRET: SECRET }, {
      'X-Origin-Secret': sent,
      'X-Forwarded-For': `${FORGED}, ${LAST_HOP}`,
    });
    assert.equal(ip, LAST_HOP);
  });
}

for (const [name, env] of [['ausente', {}], ['vazio', { ORIGIN_SECRET: '' }]]) {
  test(`com ORIGIN_SECRET ${name} no backend, nenhum cabeçalho é aceito`, async () => {
    const ip = await ipSeenByBackend(env, { 'X-Origin-Secret': '', 'X-Forwarded-For': `${FORGED}, ${LAST_HOP}` });
    assert.equal(ip, LAST_HOP);
  });
}

test('com o segredo certo, um valor que não é IP é ignorado', async () => {
  const ip = await ipSeenByBackend({ ORIGIN_SECRET: SECRET }, {
    'X-Origin-Secret': SECRET,
    'X-Forwarded-For': `nao-e-um-ip, ${LAST_HOP}`,
  });
  assert.equal(ip, LAST_HOP);
});
