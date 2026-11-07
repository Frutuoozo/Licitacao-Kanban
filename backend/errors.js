// Erro causado pelo pedido do usuário (dado inválido, regra de negócio): a mensagem é segura para
// mostrar na tela. Qualquer outro erro (banco, bug) deve virar 500 com mensagem genérica, com o
// detalhe só no log do servidor.
export class ClientError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
