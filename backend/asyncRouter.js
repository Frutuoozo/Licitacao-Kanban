import express from 'express';

// O Express 4 não acompanha a promise de um handler async: um erro que escapa do try (ou numa rota sem try)
// deixava o pedido sem resposta até o navegador desistir. Este Router passa esses erros para next(err),
// e o tratador global de server.js responde 500 em JSON e registra o erro no log.
// Todo arquivo em routes/ cria o router por aqui (test/async-router.test.js confere).
const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'all', 'use'];

function forwardRejection(handler) {
  if (typeof handler !== 'function' || handler.length === 4) return handler; // tratador de erro fica como está
  return function asyncSafe(req, res, next) {
    const result = handler(req, res, next);
    if (result && typeof result.then === 'function') result.then(undefined, next);
    return result;
  };
}

const wrapAll = (args) => args.map((arg) => (Array.isArray(arg) ? wrapAll(arg) : forwardRejection(arg)));

export function createRouter(options) {
  const router = express.Router(options);
  for (const method of METHODS) {
    const original = router[method].bind(router);
    router[method] = (...args) => original(...wrapAll(args));
  }
  return router;
}
