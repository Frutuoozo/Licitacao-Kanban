// Ordem da página Demandas (cards e tabela): prioridade primeiro, de Urgente a Rotina; na mesma prioridade,
// pendentes antes das iniciadas; depois o vencimento mais próximo, e quem não tem vencimento por último.
const PRIORITY_RANK = { urgent: 0, high: 1, moderate: 2, routine: 3 };
const rank = (priority) => PRIORITY_RANK[priority] ?? PRIORITY_RANK.routine;

export function compareDemands(a, b) {
  return (rank(a.priority) - rank(b.priority))
    || ((a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1))
    || String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999"));
}
