import { monthlyEvolution } from "./processEvolution";

// Gráfico "Evolução dos processos" (Relatórios): cinza = abertos no início do mês, azul = iniciados no mês,
// verde = concluídos no mês. Assim, cinza do mês seguinte = cinza + azul − verde.
const day = (year, month, date = 15) => new Date(year, month - 1, date, 12);
const proc = (created, archived = null) => ({ createdDate: created, archivedDate: archived });
const now = day(2026, 11, 13);
const byLabel = (months) => Object.fromEntries(months.map((m) => [`${m.year}-${m.month + 1}`, m]));

test("exemplo: 10 abertos + 2 criados − 5 concluídos = 7 abertos no mês seguinte", () => {
  const processes = [
    ...Array.from({ length: 5 }, () => proc(day(2026, 8))), // abertos desde agosto, seguem abertos
    ...Array.from({ length: 5 }, () => proc(day(2026, 8), day(2026, 10, 20))), // abertos desde agosto, concluídos em outubro
    proc(day(2026, 10, 5)), proc(day(2026, 10, 25)), // criados em outubro
  ];
  const months = byLabel(monthlyEvolution(processes, now, 7));
  expect(months["2026-10"]).toMatchObject({ open: 10, created: 2, completed: 5 });
  expect(months["2026-11"]).toMatchObject({ open: 7, created: 0, completed: 0 });
});

test("processo criado e concluído no mesmo mês aparece no azul e no verde, mas não no cinza", () => {
  const months = byLabel(monthlyEvolution([proc(day(2026, 10, 3), day(2026, 10, 28))], now, 7));
  expect(months["2026-10"]).toMatchObject({ open: 0, created: 1, completed: 1 });
  expect(months["2026-11"]).toMatchObject({ open: 0, created: 0, completed: 0 });
});

test("em todo mês, cinza do mês seguinte = cinza + azul − verde", () => {
  const processes = [
    proc(day(2025, 12)), proc(day(2026, 3), day(2026, 6)), proc(day(2026, 5, 1), day(2026, 5, 30)),
    proc(day(2026, 6)), proc(day(2026, 7), day(2026, 11, 2)), proc(day(2026, 9, 30)), proc(day(2026, 11, 1)),
  ];
  const months = monthlyEvolution(processes, now, 7);
  for (let i = 0; i < months.length - 1; i += 1) {
    expect(months[i + 1].open).toBe(months[i].open + months[i].created - months[i].completed);
  }
});

test("devolve os últimos meses, do mais antigo ao atual", () => {
  const months = monthlyEvolution([], now, 7);
  expect(months.map((m) => `${m.year}-${m.month + 1}`)).toEqual(["2026-5", "2026-6", "2026-7", "2026-8", "2026-9", "2026-10", "2026-11"]);
});

test("processo sem data de início fica fora do gráfico", () => {
  const months = monthlyEvolution([proc(null)], now, 7);
  expect(months.every((m) => m.open === 0 && m.created === 0 && m.completed === 0)).toBe(true);
});
