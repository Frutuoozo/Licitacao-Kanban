// Dados do gráfico "Evolução dos processos" (Relatórios), mês a mês, do mais antigo ao atual:
// - open (cinza): já estavam abertos no início do mês (iniciados antes dele e não concluídos até ele começar);
// - created (azul): iniciados no mês;
// - completed (verde): concluídos no mês.
// Assim o cinza de um mês é o do anterior + iniciados − concluídos.
// `processes`: { createdDate, archivedDate } (Date ou null); processo sem data de início fica fora.
export function monthlyEvolution(processes, now, monthsCount) {
  const months = Array.from({ length: monthsCount }, (_, i) => {
    const start = new Date(now.getFullYear(), now.getMonth() - (monthsCount - 1 - i), 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1); // início do mês seguinte
    return { key: `${start.getFullYear()}-${start.getMonth()}`, month: start.getMonth(), year: start.getFullYear(), start, end, open: 0, created: 0, completed: 0 };
  });
  for (const { createdDate, archivedDate } of processes) {
    if (!createdDate) continue;
    for (const m of months) {
      if (createdDate < m.start && (!archivedDate || archivedDate >= m.start)) m.open += 1;
      if (createdDate >= m.start && createdDate < m.end) m.created += 1;
      if (archivedDate && archivedDate >= m.start && archivedDate < m.end) m.completed += 1;
    }
  }
  return months;
}
