import { compareDemands } from "./demandOrder";

const demand = (id, priority, status = "pending", dueDate = "2030-01-01") => ({ id, priority, status, dueDate });
const order = (list) => [...list].sort(compareDemands).map((d) => d.id);

test("urgente em cima, depois prioritária, moderada e rotina embaixo", () => {
  const list = [demand("r", "routine"), demand("m", "moderate"), demand("u", "urgent"), demand("h", "high")];
  expect(order(list)).toEqual(["u", "h", "m", "r"]);
});

test("a prioridade vem antes da situação e do vencimento", () => {
  const list = [demand("rotina-pendente-cedo", "routine", "pending", "2026-11-20"), demand("urgente-iniciada-tarde", "urgent", "active", "2031-01-01")];
  expect(order(list)).toEqual(["urgente-iniciada-tarde", "rotina-pendente-cedo"]);
});

test("na mesma prioridade, pendentes antes das iniciadas", () => {
  expect(order([demand("iniciada", "high", "active"), demand("pendente", "high", "pending")])).toEqual(["pendente", "iniciada"]);
});

test("na mesma prioridade e situação, o vencimento mais próximo primeiro; sem vencimento por último", () => {
  const list = [demand("sem", "moderate", "pending", null), demand("dez", "moderate", "pending", "2026-12-01"), demand("nov", "moderate", "pending", "2026-11-20")];
  expect(order(list)).toEqual(["nov", "dez", "sem"]);
});

test("sem prioridade conta como rotina", () => {
  expect(order([demand("sem", undefined), demand("moderada", "moderate")])).toEqual(["moderada", "sem"]);
});
