// Erro causado pelo pedido do usuário (dado inválido, regra de negócio): a mensagem é segura para
// mostrar na tela. Qualquer outro erro (banco, bug) deve virar 500 com mensagem genérica, com o
// detalhe só no log do servidor.
export class ClientError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Resposta de erro padrão das rotas: ClientError mostra a própria mensagem; o resto vai para o log e
// responde 500 com `fallbackMessage` (sem expor detalhes do banco ou do código).
export function sendError(res, error, fallbackMessage) {
  if (error instanceof ClientError) return res.status(error.status).json({ error: error.message });
  console.error(error);
  return res.status(500).json({ error: fallbackMessage });
}
