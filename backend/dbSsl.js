// Com DB_CA_CERT, a conexão só é aceita se o certificado do servidor foi assinado por esse CA e traz o
// nome do host. No mysql2, rejectUnauthorized confere só a assinatura; o nome depende de verifyIdentity.
// No Aiven o CA é obrigatório: é melhor não subir do que mandar a senha do banco a um servidor não confirmado.
export function resolveDbSsl(env) {
  if (env.DB_CA_CERT) {
    return { ca: env.DB_CA_CERT, rejectUnauthorized: true, verifyIdentity: true };
  }
  if (env.DB_HOST?.includes('aivencloud.com')) {
    throw new Error('Defina DB_CA_CERT com o certificado CA do Aiven (veja backend/.env.example).');
  }
  return undefined;
}
