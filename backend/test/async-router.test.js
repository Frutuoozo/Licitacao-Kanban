// Erro em rota async: o Express 4 não pega promise rejeitada, e o pedido ficava sem resposta até o
// navegador desistir (o erro só aparecia no log como "Promise rejeitada sem tratamento").
// createRouter repassa esses erros ao tratador global, que responde 500 em JSON.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createRouter } from '../asyncRouter.js';

describe('rotas async repassam o erro', () => {
  let server;
  let baseUrl;

  before(() => {
    const router = createRouter();
    router.get('/depois-do-await', async () => {
      await Promise.resolve();
      throw new Error('falha depois do await');
    });
    router.post('/antes-do-try', express.json(), async (req) => {
      req.body.naoExiste.campo; // TypeError síncrono dentro da função async
    });
    router.get('/middleware-async', async () => { throw new Error('falha no middleware'); }, (_req, res) => res.json({ ok: true }));
    router.get('/ok', async (_req, res) => res.json({ ok: true }));
    router.get('/sincrona', (_req, res) => res.json({ sync: true }));

    const app = express();
    app.use('/api', router);
    // eslint-disable-next-line no-unused-vars
    app.use((err, _req, res, _next) => res.status(500).json({ error: 'Erro interno do servidor.' }));
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  });

  after(() => server?.close());

  const call = (path, init) => fetch(`${baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(2000) });

  for (const [path, init] of [
    ['/depois-do-await'],
    ['/antes-do-try', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }],
    ['/middleware-async'],
  ]) {
    test(`${path}: responde 500 em vez de ficar sem resposta`, async () => {
      const res = await call(path, init);
      assert.equal(res.status, 500);
      assert.deepEqual(await res.json(), { error: 'Erro interno do servidor.' });
    });
  }

  test('rotas que dão certo, async ou não, continuam iguais', async () => {
    assert.deepEqual(await (await call('/ok')).json(), { ok: true });
    assert.deepEqual(await (await call('/sincrona')).json(), { sync: true });
  });
});

test('todo arquivo de rotas usa createRouter', () => {
  const dir = fileURLToPath(new URL('../routes/', import.meta.url));
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.js'))) {
    const source = readFileSync(`${dir}${file}`, 'utf8');
    assert.ok(!/express\.Router\(/.test(source), `${file} ainda cria o router com express.Router()`);
    if (/router\.(get|post|put|patch|delete)\(/.test(source)) {
      assert.match(source, /createRouter\(\)/, `${file} não usa createRouter()`);
    }
  }
});
