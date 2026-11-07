// PUT /api/templates: erros de validação voltam com mensagem clara (400); erros do banco nunca chegam
// ao navegador (500 com mensagem genérica).
// A proteção useTestDatabase vem primeiro: este processo só enxerga o BANCO DE TESTE (TEST_DB_NAME),
// nunca o da aplicação. Os casos de validação não chegam ao banco e rodam sempre; o caso de erro do
// banco precisa do banco de teste e é pulado sem ele.
import { testDbSkip } from './helpers/useTestDatabase.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import db from '../db.js';
import templatesRouter, { parseTemplates } from '../routes/templates.js';

let server;
let baseUrl;

before(() => {
  const app = express();
  app.use(express.json());
  // A autenticação não é o que está em teste: a rota recebe um admin já identificado.
  app.use((req, _res, next) => { req.userId = 'test-admin'; req.userRole = 'admin'; next(); });
  app.use('/api/templates', templatesRouter);
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}/api/templates`;
});

after(async () => {
  server?.close();
  await db.end();
});

const put = async (body) => {
  const res = await fetch(baseUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
};

describe('PUT /api/templates: validação (não chega ao banco)', () => {
  // Salvar apaga todos os modelos e grava a lista recebida: lista vazia apagaria tudo.
  test('lista vazia é recusada e nada é apagado', async () => {
    const res = await put({});
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'É preciso ter pelo menos um modelo.' });
  });

  test('nomes que ficam iguais sem os espaços são recusados com mensagem clara', async () => {
    const res = await put({ Compras: { items: [] }, ' Compras ': { items: [] } });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Nome de modelo repetido: Compras' });
  });

  // O MySQL (utf8mb4_0900_ai_ci) considera iguais nomes que só diferem em maiúsculas ou acentos.
  test('nomes que só diferem em maiúsculas ou acentos são recusados com mensagem clara', async () => {
    const res = await put({ 'Licitação': { items: [] }, LICITACAO: { items: [] } });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Nome de modelo repetido: LICITACAO' });
  });

  test('cor inválida continua com a mensagem de validação', async () => {
    const res = await put({ Compras: { items: [], color: 'vermelho' } });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Cor de template inválida' });
  });
});

describe('PUT /api/templates: erro do banco', { skip: testDbSkip || false }, () => {
  test('erro do banco não é mostrado ao usuário', async () => {
    // Ordem fora do limite da coluna INT: o MySQL recusa o INSERT.
    const res = await put({ 'Modelo de teste': { items: [], order: 1e12 } });
    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { error: 'Falha ao salvar os modelos.' });
  });
});

// Conversão do payload em linhas da tabela (o que o INSERT recebe), no formato atual e no legado.
test('parseTemplates converte o payload em linhas ordenadas pela ordem informada', () => {
  const rows = parseTemplates({
    ' Obras ': { items: [{ type: 'doc', name: 'Projeto' }], color: '#ff0000', order: 2, description: '  Engenharia  ' },
    Compras: { items: ['Termo de referência'], order: 0 },
    Legado: ['Item antigo'],
  });
  assert.deepEqual(rows, [
    ['Compras', '["Termo de referência"]', 0, null, null],
    ['Obras', '[{"type":"doc","name":"Projeto"}]', 2, '#ff0000', 'Engenharia'],
    ['Legado', '["Item antigo"]', 2, null, null],
  ]);
});
