// A conexão com o banco na nuvem precisa confirmar que está falando com o servidor certo.
// Estes testes usam o db.js real contra um MySQL falso em localhost: nenhum banco de verdade é tocado.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveDbSsl } from '../dbSsl.js';
import { createCertificateAuthority, startFakeTlsMysql } from './helpers/fakeTlsMysql.js';

let importCount = 0;

// db.js lê as variáveis uma vez, ao ser importado; cada import com query string é uma cópia nova.
async function importDb(env) {
  // O dotenv não sobrescreve variáveis já definidas, então o .env local não interfere.
  Object.assign(process.env, { DB_USER: 'teste', DB_PASSWORD: 'teste', DB_NAME: 'nao_existe_test', DB_CA_CERT: '' }, env);
  importCount += 1;
  return (await import(`../db.js?teste=${importCount}`)).default;
}

async function connectToFakeServer(server, ca) {
  const pool = await importDb({ DB_HOST: 'localhost', DB_PORT: String(server.port), DB_CA_CERT: ca });
  try {
    const conn = await pool.getConnection();
    conn.release();
  } finally {
    await pool.end().catch(() => {});
  }
}

let realCa;
let otherCa;
let correctName;
let wrongName;

before(async () => {
  realCa = createCertificateAuthority('CA do banco');
  otherCa = createCertificateAuthority('CA de outra pessoa');
  correctName = await startFakeTlsMysql(realCa.issue('localhost'));
  wrongName = await startFakeTlsMysql(realCa.issue('outro-servico.aivencloud.com'));
});

after(async () => {
  await correctName?.stop();
  await wrongName?.stop();
  realCa?.destroy();
  otherCa?.destroy();
});

test('conecta quando o certificado foi assinado pelo CA informado e traz o nome do servidor', async () => {
  await connectToFakeServer(correctName, realCa.ca);
});

test('recusa servidor com certificado assinado por outro CA', async () => {
  await assert.rejects(connectToFakeServer(correctName, otherCa.ca), /unable to verify/);
});

test('recusa servidor com certificado do mesmo CA emitido para outro nome', async () => {
  await assert.rejects(connectToFakeServer(wrongName, realCa.ca), /does not match certificate's altnames/);
});

// Sem o CA, o db.js não abre nenhuma conexão (a senha não sai sem TLS), mas também não quebra ao ser
// importado: cada consulta é recusada com a mensagem do que falta. Assim o servidor mostra o aviso de
// "não foi iniciado" (em vez do stack cru) e os arquivos de teste podem ser pulados em vez de quebrar.
test('no Aiven sem DB_CA_CERT nenhuma consulta é feita, e o erro diz o que falta', async () => {
  const pool = await importDb({ DB_HOST: 'banco.aivencloud.com', DB_PORT: '3306' });
  // Uma tentativa de conexão daria ENOTFOUND (o nome não existe): a recusa vem antes de qualquer rede.
  await assert.rejects(pool.query('SELECT 1'), /DB_CA_CERT/);
  await assert.rejects(pool.getConnection(), /DB_CA_CERT/);
  await pool.end();
});

test('no Aiven sem DB_CA_CERT o servidor não sobe e explica o motivo', async () => {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, DB_HOST: 'banco.aivencloud.com', DB_PORT: '3306', DB_CA_CERT: '', PORT: '3991' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  server.stdout.on('data', (chunk) => { output += chunk; });
  server.stderr.on('data', (chunk) => { output += chunk; });
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { server.kill(); reject(new Error(`servidor não encerrou em 15s:\n${output}`)); }, 15000);
    server.on('exit', (exitCode) => { clearTimeout(timer); resolve(exitCode); });
  });
  assert.equal(code, 1);
  assert.match(output, /O servidor NÃO foi iniciado/);
  assert.match(output, /DB_CA_CERT/);
  assert.doesNotMatch(output, /Server is running/);
});

test('banco local sem DB_CA_CERT continua sem TLS', () => {
  assert.equal(resolveDbSsl({ DB_HOST: 'localhost' }), undefined);
  assert.equal(resolveDbSsl({}), undefined);
});
