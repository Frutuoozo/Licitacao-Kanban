import { attentionItems } from "./adminAttention";

// "Precisa de atenção" no painel do administrador: só os itens com alguma ocorrência, cada um com a quantidade.
const today = new Date("2026-11-19T12:00:00");
const contract = (over = {}) => ({
  id: Math.random().toString(36).slice(2), closedAt: null, dueDate: "2027-06-30", fiscalEffective: "Ana", fiscalSubstitute: "",
  contractorCnpj: "11222333000181", startDate: "2026-01-01", pcaProject: "P", pcaAccount: "C", ...over,
});
const user = (over = {}) => ({ id: Math.random().toString(36).slice(2), username: "u", firstAccess: false, lockedMinutes: 0,
  passwordChangedAt: "2026-11-01T10:00:00", lastLoginAt: "2026-11-18T10:00:00", ...over });
const run = (data) => Object.fromEntries(attentionItems({ contracts: [], collaborators: [], users: [], settings: {}, today, ...data }).map((item) => [item.key, item]));

test("tudo em dia: nenhum item", () => {
  expect(attentionItems({ contracts: [contract()], collaborators: [], users: [user()], settings: {}, today })).toEqual([]);
});

test("contratos em vigor sem CNPJ, início da vigência ou PCA", () => {
  const items = run({ contracts: [contract({ contractorCnpj: "" }), contract({ startDate: null }), contract({ pcaAccount: "" }), contract()] });
  expect(items.contractsMissing.count).toBe(3);
});

test("contratos encerrados ou vencidos não entram nas pendências de cadastro", () => {
  const items = run({ contracts: [contract({ contractorCnpj: "", closedAt: "2026-10-01" }), contract({ pcaProject: "", dueDate: "2026-11-01" })] });
  expect(items.contractsMissing).toBeUndefined();
});

test("contratos em vigor com fiscal efetivo ou substituto inativo", () => {
  const collaborators = [{ nome: "Ana", ativo: true }, { nome: "Beto", ativo: false }];
  const items = run({ collaborators, contracts: [contract({ fiscalEffective: "Beto" }), contract({ fiscalSubstitute: "Beto" }), contract()] });
  expect(items.inactiveFiscal.count).toBe(2);
});

test("usuários com senha temporária e contas bloqueadas (com a lista para desbloquear)", () => {
  const locked = user({ username: "maria", lockedMinutes: 12 });
  const items = run({ users: [user({ firstAccess: true }), user({ firstAccess: true }), locked, user()] });
  expect(items.tempPassword.count).toBe(2);
  expect(items.locked.count).toBe(1);
  expect(items.locked.users).toEqual([locked]);
});

test("senhas que vencem em até 7 dias, só com a troca periódica ligada", () => {
  const users = [user({ passwordChangedAt: "2026-08-25T10:00:00" }), user({ passwordChangedAt: "2026-11-10T10:00:00" })];
  expect(run({ users, settings: { passwordExpiryEnabled: false, passwordExpiryDays: 90 } }).passwordExpiring).toBeUndefined();
  expect(run({ users, settings: { passwordExpiryEnabled: true, passwordExpiryDays: 90 } }).passwordExpiring.count).toBe(1);
});

test("usuários sem entrar há 30 dias ou mais (quem tem senha temporária fica no item dela)", () => {
  const users = [user({ lastLoginAt: "2026-10-01T10:00:00" }), user({ lastLoginAt: null }), user({ lastLoginAt: null, firstAccess: true }), user()];
  expect(run({ users }).dormant.count).toBe(2);
});

test("os textos usam singular e plural", () => {
  expect(run({ users: [user({ firstAccess: true })] }).tempPassword.label).toBe("usuário com senha temporária");
  expect(run({ users: [user({ firstAccess: true }), user({ firstAccess: true })] }).tempPassword.label).toBe("usuários com senha temporária");
});
