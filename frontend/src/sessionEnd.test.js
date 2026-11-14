import { createSessionEnder } from "./sessionEnd";

// Promessa controlada pelo teste: simula o pedido de logout ainda em andamento.
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test("vários 401 ao mesmo tempo mandam um logout só e mostram o primeiro aviso", async () => {
  const request = deferred();
  const sendLogout = jest.fn(() => request.promise);
  const onEnd = jest.fn();
  const ender = createSessionEnder({ sendLogout, onEnd });

  ender.end({ title: "Sessão expirada" });
  ender.end({ title: "Sessão expirada" });
  ender.end(null);
  expect(sendLogout).toHaveBeenCalledTimes(1);
  // A tela só troca depois que o logout termina: uma resposta atrasada não apaga o cookie de um login novo.
  expect(onEnd).not.toHaveBeenCalled();

  request.resolve();
  await request.promise;
  await Promise.resolve();
  expect(onEnd).toHaveBeenCalledTimes(1);
  expect(onEnd).toHaveBeenCalledWith({ title: "Sessão expirada" });
});

test("logout que falha na rede também volta ao login", async () => {
  const request = deferred();
  const onEnd = jest.fn();
  const ender = createSessionEnder({ sendLogout: () => request.promise, onEnd });
  ender.end(null);
  request.reject(new Error("offline"));
  await request.promise.catch(() => {});
  await Promise.resolve();
  expect(onEnd).toHaveBeenCalledWith(null);
});

test("depois de entrar de novo, a próxima expiração volta a funcionar", async () => {
  const sendLogout = jest.fn(() => Promise.resolve());
  const onEnd = jest.fn();
  const ender = createSessionEnder({ sendLogout, onEnd });
  ender.end(null);
  await Promise.resolve(); await Promise.resolve();
  ender.reset();
  ender.end({ title: "Sessão expirada" });
  await Promise.resolve(); await Promise.resolve();
  expect(sendLogout).toHaveBeenCalledTimes(2);
  expect(onEnd).toHaveBeenLastCalledWith({ title: "Sessão expirada" });
});
