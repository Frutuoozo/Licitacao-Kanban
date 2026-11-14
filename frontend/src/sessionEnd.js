// Encerra a sessão uma vez só. Quando ela expira, várias partes da tela recebem 401 ao mesmo tempo
// (processos, modelos, a página aberta); antes cada uma mandava o próprio logout e a pessoa voltava ao
// login sem saber por quê. Aqui as chamadas repetidas são ignoradas até `reset()` (novo login), e o
// aviso que vale é o da primeira chamada.
// `onEnd(notice)` só roda depois que o logout termina (com ou sem erro de rede): uma resposta atrasada
// do logout não pode apagar o cookie de um login novo feito nesse meio-tempo.
export function createSessionEnder({ sendLogout, onEnd }) {
  let ending = false;
  return {
    end(notice = null) {
      if (ending) return;
      ending = true;
      let request;
      try { request = Promise.resolve(sendLogout()); } catch { request = Promise.resolve(); }
      const finish = () => onEnd(notice);
      request.then(finish, finish);
    },
    reset() {
      ending = false;
    },
  };
}
