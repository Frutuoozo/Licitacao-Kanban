// Cria um administrador direto no banco. Uso (dentro de backend/): node scripts/create-admin.js <usuario>
//
// Substitui a antiga rota pública /setup-admin: só quem tem acesso ao servidor consegue rodar.
// Serve para o primeiro admin de um banco novo e para recuperar o acesso se nenhum admin conseguir entrar.
// A senha gerada é temporária: no primeiro login o sistema pede uma senha nova (fluxo de primeiro acesso).
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'crypto';
import db from '../db.js';
import { isNonEmptyString, MAX_LENGTHS, normalizeText } from '../validation.js';

const username = normalizeText(process.argv[2]);

if (!isNonEmptyString(username, MAX_LENGTHS.username)) {
  console.error(`Uso: node scripts/create-admin.js <usuario>   (nome com até ${MAX_LENGTHS.username} caracteres)`);
  process.exit(1);
}

// Mesmo formato das senhas temporárias criadas pela tela de Administração.
const temporaryPassword = `${randomBytes(12).toString('base64url')}!`;

try {
  await db.query(
    'INSERT INTO users (id, username, password_hash, role, first_access, password_changed_at) VALUES (?, ?, ?, ?, TRUE, NOW())',
    [randomUUID(), username, await bcrypt.hash(temporaryPassword, 10), 'admin']
  );
  console.log(`Administrador "${username}" criado.`);
  console.log(`Senha temporária: ${temporaryPassword}`);
  console.log('Entre com ela no sistema: será pedida uma senha nova no primeiro acesso.');
  process.exitCode = 0;
} catch (error) {
  console.error(error.code === 'ER_DUP_ENTRY'
    ? `O usuário "${username}" já existe. Escolha outro nome.`
    : `Não foi possível criar o administrador: ${error.message}`);
  process.exitCode = 1;
} finally {
  await db.end();
}
