// Falha do banco ao conferir a sessão: o verifyToken respondia 500 e descartava o erro, então o log não
// mostrava o motivo (banco fora do ar, senha do banco errada, certificado vencido...).
// O banco é simulado (db.query substituído): nada é gravado. useTestDatabase vem primeiro por segurança.
import './helpers/useTestDatabase.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import db from '../db.js';
import { verifyToken } from '../middleware/auth.js';
import { getJwtSecret } from '../security.js';

describe('verifyToken com o banco falhando', () => {
  let server;
  let baseUrl;
  const originalQuery = db.query;
  const originalConsoleError = console.error;
  let logged = [];

  before(() => {
    const app = express();
    app.get('/privado', verifyToken, (_req, res) => res.json({ ok: true }));
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    db.query = originalQuery;
    console.error = originalConsoleError;
    server?.close();
    await db.end();
  });

  test('responde 500 e registra o erro do banco no log', async () => {
    const dbError = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:3306'), { code: 'ECONNREFUSED' });
    db.query = () => Promise.reject(dbError);
    logged = [];
    console.error = (...args) => { logged.push(args); };

    const token = jwt.sign({ id: 'qualquer', ver: 0 }, getJwtSecret(), { algorithm: 'HS256', expiresIn: '1h' });
    const res = await fetch(`${baseUrl}/privado`, { headers: { Cookie: `auth_token=${token}` }, signal: AbortSignal.timeout(2000) });

    console.error = originalConsoleError;
    db.query = originalQuery;
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), { error: 'Erro ao verificar sessão' });
    assert.ok(logged.some((args) => args.includes(dbError)), `o erro do banco não foi registrado: ${JSON.stringify(logged)}`);
  });
});
