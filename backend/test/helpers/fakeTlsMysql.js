// Servidor MySQL falso, só para testar a verificação do certificado: anuncia suporte a TLS, faz o
// handshake TLS de verdade e aceita qualquer login. Roda em localhost e não guarda nada.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import tls from 'node:tls';

const CLIENT_LONG_PASSWORD = 0x1;
const CLIENT_CONNECT_WITH_DB = 0x8;
const CLIENT_PROTOCOL_41 = 0x200;
const CLIENT_SSL = 0x800;
const CLIENT_SECURE_CONNECTION = 0x8000;
const CLIENT_PLUGIN_AUTH = 0x80000;
const CAPABILITIES = CLIENT_LONG_PASSWORD | CLIENT_CONNECT_WITH_DB | CLIENT_PROTOCOL_41
  | CLIENT_SSL | CLIENT_SECURE_CONNECTION | CLIENT_PLUGIN_AUTH;

function packet(sequence, payload) {
  const header = Buffer.alloc(4);
  header.writeUIntLE(payload.length, 0, 3);
  header[3] = sequence;
  return Buffer.concat([header, payload]);
}

// Initial Handshake v10 do protocolo MySQL.
function greeting() {
  const flags = Buffer.alloc(2);
  flags.writeUInt16LE(CAPABILITIES & 0xffff);
  const upperFlags = Buffer.alloc(2);
  upperFlags.writeUInt16LE(CAPABILITIES >>> 16);
  return packet(0, Buffer.concat([
    Buffer.from([0x0a]),
    Buffer.from('8.0.0-fake\0'),
    Buffer.alloc(4, 1), // id da conexão
    Buffer.from('abcdefgh\0'), // primeira parte do desafio de senha
    flags,
    Buffer.from([45]), // charset
    Buffer.from([0x02, 0x00]), // status
    upperFlags,
    Buffer.from([21]), // tamanho do desafio de senha
    Buffer.alloc(10),
    Buffer.from('ijklmnopqrst\0'), // segunda parte do desafio
    Buffer.from('mysql_native_password\0'),
  ]));
}

const OK_AFTER_LOGIN = packet(3, Buffer.from([0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00]));

const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const close = (server) => new Promise((resolve) => server.close(resolve));

export async function startFakeTlsMysql({ key, cert }) {
  const sockets = new Set();
  const track = (socket) => {
    sockets.add(socket);
    socket.on('error', () => {}); // o cliente derruba a conexão quando recusa o certificado
    socket.on('close', () => sockets.delete(socket));
  };

  const tlsServer = tls.createServer({ key, cert }, (socket) => {
    socket.once('data', () => socket.write(OK_AFTER_LOGIN));
  });
  tlsServer.on('connection', track);
  tlsServer.on('tlsClientError', () => {});
  const tlsPort = await listen(tlsServer);

  // O pedido de TLS chega em texto puro; dali em diante os bytes vão direto para o servidor TLS.
  const server = net.createServer((socket) => {
    track(socket);
    socket.write(greeting());
    socket.once('data', (chunk) => {
      const sslRequestLength = chunk.readUIntLE(0, 3) + 4;
      const upstream = net.connect(tlsPort, '127.0.0.1');
      track(upstream);
      upstream.write(chunk.subarray(sslRequestLength));
      socket.pipe(upstream);
      upstream.pipe(socket);
    });
  });
  const port = await listen(server);

  return {
    port,
    async stop() {
      for (const socket of sockets) socket.destroy();
      await Promise.all([close(server), close(tlsServer)]);
    },
  };
}

// Gera um CA próprio e devolve uma função que emite certificados assinados por ele para um nome.
export function createCertificateAuthority(commonName) {
  const dir = mkdtempSync(join(tmpdir(), 'db-ssl-test-'));
  const path = (name) => join(dir, name);
  const openssl = (...args) => execFileSync('openssl', args, { stdio: 'pipe' });
  const newKey = ['-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1', '-nodes'];

  openssl('req', '-x509', ...newKey, '-keyout', path('ca.key'), '-out', path('ca.crt'), '-subj', `/CN=${commonName}`, '-days', '1');

  return {
    ca: readFileSync(path('ca.crt'), 'utf8'),
    issue(hostname) {
      writeFileSync(path('san.ext'), `subjectAltName=DNS:${hostname}\n`);
      openssl('req', '-new', ...newKey, '-keyout', path('server.key'), '-out', path('server.csr'), '-subj', `/CN=${hostname}`);
      openssl('x509', '-req', '-in', path('server.csr'), '-CA', path('ca.crt'), '-CAkey', path('ca.key'), '-CAcreateserial',
        '-out', path('server.crt'), '-days', '1', '-extfile', path('san.ext'));
      return { key: readFileSync(path('server.key'), 'utf8'), cert: readFileSync(path('server.crt'), 'utf8') };
    },
    destroy() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
