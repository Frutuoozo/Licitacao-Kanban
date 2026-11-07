// Em produção o site chama a API no próprio domínio: para o Safari, o cookie de login deixa de ser
// "de outro site". O endereço precisa ser absoluto porque o Socket.IO não aceita endereço vazio.
describe("API_URL", () => {
  const original = process.env.REACT_APP_API_URL;

  const loadApiUrl = (value) => {
    if (value === undefined) delete process.env.REACT_APP_API_URL;
    else process.env.REACT_APP_API_URL = value;
    let apiUrl;
    jest.isolateModules(() => { apiUrl = require("./authFetch").API_URL; });
    return apiUrl;
  };

  afterAll(() => {
    if (original === undefined) delete process.env.REACT_APP_API_URL;
    else process.env.REACT_APP_API_URL = original;
  });

  test("same-origin usa o domínio em que o site foi aberto", () => {
    expect(loadApiUrl("same-origin")).toBe("http://localhost");
  });

  test("um endereço informado é usado como está", () => {
    expect(loadApiUrl("http://192.168.0.104:3001")).toBe("http://192.168.0.104:3001");
  });

  test("sem configuração, usa o mesmo host na porta 3001", () => {
    expect(loadApiUrl(undefined)).toBe("http://localhost:3001");
  });
});
