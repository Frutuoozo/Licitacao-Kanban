// O CPF é dado pessoal sensível: só admin recebe. Os demais perfis veem nome, e-mail, COD e status.
// A proteção useTestDatabase vem primeiro: este processo só enxerga o BANCO DE TESTE (TEST_DB_NAME).
import { testDbSkip } from './helpers/useTestDatabase.js';
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import db from '../db.js';
import { requireAdmin } from '../middleware/admin.js';
import adminRouter from '../routes/admin.js';
import collaboratorsRouter from '../routes/collaborators.js';

const CPF = '111.222.333-44';

describe('dados pessoais de colaboradores', { skip: testDbSkip || false }, () => {
  let server;
  let baseUrl;
  let collaboratorId;

  before(async () => {
    const app = express();
    app.use(express.json());
    // A autenticação não é o que está em teste: o perfil vem no cabeçalho, como se verifyToken o tivesse lido.
    app.use((req, _res, next) => { req.userId = 'teste'; req.userRole = req.get('x-role'); next(); });
    // Mesma montagem de server.js.
    app.use('/api/admin', requireAdmin, adminRouter);
    app.use('/api/collaborators', collaboratorsRouter);
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}/api`;

    await db.query('DELETE FROM collaborators WHERE cpf = ?', [CPF]);
    const [result] = await db.query(
      'INSERT INTO collaborators (nome, cpf, email, codigo, ativo) VALUES (?, ?, ?, ?, ?)',
      ['Pessoa de Teste', CPF, 'pessoa@teste.example', 'TESTE01', 1]
    );
    collaboratorId = result.insertId;
  });

  after(async () => {
    server?.close();
    await db.query('DELETE FROM collaborators WHERE cpf = ?', [CPF]);
    await db.end();
  });

  const get = async (path, role) => {
    const res = await fetch(`${baseUrl}${path}`, { headers: { 'x-role': role } });
    return { status: res.status, body: await res.json() };
  };

  for (const role of ['viewer', 'editor']) {
    test(`${role} recebe nome, e-mail, COD e status, sem CPF`, async () => {
      const { status, body } = await get('/collaborators', role);
      assert.equal(status, 200);
      assert.deepEqual(body.find((c) => c.id === collaboratorId), {
        id: collaboratorId,
        nome: 'Pessoa de Teste',
        email: 'pessoa@teste.example',
        codigo: 'TESTE01',
        ativo: true,
      });
    });

    test(`${role} não consegue pegar o CPF pela rota de admin`, async () => {
      const { status, body } = await get('/admin/collaborators', role);
      assert.equal(status, 403);
      assert.equal(JSON.stringify(body).includes(CPF), false);
    });
  }

  test('admin continua recebendo o CPF na rota de admin', async () => {
    const { status, body } = await get('/admin/collaborators', 'admin');
    assert.equal(status, 200);
    assert.equal(body.find((c) => c.id === collaboratorId).cpf, CPF);
  });
});
