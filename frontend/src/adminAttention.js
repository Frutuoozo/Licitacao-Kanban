// "Precisa de atenção" no painel do administrador: pendências calculadas com os dados que o sistema já tem.
// Devolve só os itens com alguma ocorrência: { key, count, label, action, users? }.
// action: "contracts" (abre Contratos), "users" (abre o painel de usuários) ou "unlock" (lista contas para desbloquear).
const DAY = 86400000;
const isoDay = (date) => date.toLocaleDateString("en-CA");
const daysSince = (value, today) => (value ? (today.getTime() - new Date(value).getTime()) / DAY : Infinity);

const DORMANT_DAYS = 30;
const EXPIRY_WARNING_DAYS = 7;

export function attentionItems({ contracts, collaborators, users, settings, today }) {
  const todayIso = isoDay(today);
  // Contrato em vigor: não encerrado à mão e com vencimento hoje ou depois.
  const open = contracts.filter((c) => !c.closedAt && c.dueDate && String(c.dueDate).slice(0, 10) >= todayIso);
  const inactive = new Set(collaborators.filter((c) => c.ativo === false).map((c) => c.nome));
  const regularUsers = users.filter((u) => !u.firstAccess);

  const items = [
    { key: "contractsMissing", action: "contracts", one: "contrato sem CNPJ, início da vigência ou PCA", many: "contratos sem CNPJ, início da vigência ou PCA",
      count: open.filter((c) => !c.contractorCnpj || !c.startDate || !c.pcaProject || !c.pcaAccount).length },
    { key: "inactiveFiscal", action: "contracts", one: "contrato com fiscal inativo", many: "contratos com fiscal inativo",
      count: open.filter((c) => inactive.has(c.fiscalEffective) || (c.fiscalSubstitute && inactive.has(c.fiscalSubstitute))).length },
    { key: "tempPassword", action: "users", one: "usuário com senha temporária", many: "usuários com senha temporária",
      count: users.filter((u) => u.firstAccess).length },
    { key: "locked", action: "unlock", one: "conta bloqueada agora", many: "contas bloqueadas agora",
      users: users.filter((u) => u.lockedMinutes > 0) },
    { key: "passwordExpiring", action: "users", one: `senha vence em até ${EXPIRY_WARNING_DAYS} dias`, many: `senhas vencem em até ${EXPIRY_WARNING_DAYS} dias`,
      count: settings.passwordExpiryEnabled
        ? regularUsers.filter((u) => daysSince(u.passwordChangedAt, today) >= settings.passwordExpiryDays - EXPIRY_WARNING_DAYS).length : 0 },
    { key: "dormant", action: "users", one: `usuário sem entrar há ${DORMANT_DAYS}+ dias`, many: `usuários sem entrar há ${DORMANT_DAYS}+ dias`,
      count: regularUsers.filter((u) => daysSince(u.lastLoginAt, today) >= DORMANT_DAYS).length },
  ];
  return items
    .map(({ one, many, ...item }) => {
      const count = item.users ? item.users.length : item.count;
      return { ...item, count, label: count === 1 ? one : many };
    })
    .filter((item) => item.count > 0);
}
