// sendError: a resposta de erro que as rotas repetiam em 8 lugares. Erro do pedido (ClientError) mostra a
// própria mensagem; qualquer outro vira 500 com a mensagem genérica da rota e o detalhe só no log.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClientError, sendError } from '../errors.js';

function fakeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

test('ClientError responde com o status e a mensagem do próprio erro, sem log', (t) => {
  const log = t.mock.method(console, 'error', () => {});
  const res = fakeRes();
  sendError(res, new ClientError('Contrato não encontrado', 404), 'Falha ao atualizar contrato');
  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Contrato não encontrado' });
  assert.equal(log.mock.callCount(), 0);
});

test('outro erro responde 500 com a mensagem da rota e registra o detalhe', (t) => {
  const log = t.mock.method(console, 'error', () => {});
  const res = fakeRes();
  const dbError = Object.assign(new Error("Table 'x' doesn't exist"), { code: 'ER_NO_SUCH_TABLE' });
  sendError(res, dbError, 'Falha ao atualizar contrato');
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Falha ao atualizar contrato' });
  assert.ok(log.mock.calls.some((call) => call.arguments.includes(dbError)), 'o erro não foi para o log');
});

test('nenhuma rota repete mais o tratamento de ClientError à mão', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const dir = new URL('../routes/', import.meta.url);
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.js'))) {
    const source = readFileSync(new URL(file, dir), 'utf8');
    assert.doesNotMatch(source, /instanceof ClientError\) return res\.status/, `${file} ainda trata ClientError à mão`);
  }
});
