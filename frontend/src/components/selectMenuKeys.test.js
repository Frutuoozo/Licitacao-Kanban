import { nextOptionIndex, toggleSelection } from "./selectMenuKeys";

// Navegação pelo teclado na lista do SelectMenu, igual à de um seletor nativo.
test("seta para baixo vai para a próxima opção e para na última", () => {
  expect(nextOptionIndex("ArrowDown", 0, 3)).toBe(1);
  expect(nextOptionIndex("ArrowDown", 2, 3)).toBe(2);
});

test("seta para cima vai para a anterior e para na primeira", () => {
  expect(nextOptionIndex("ArrowUp", 2, 3)).toBe(1);
  expect(nextOptionIndex("ArrowUp", 0, 3)).toBe(0);
});

test("Home e End vão para a primeira e a última", () => {
  expect(nextOptionIndex("Home", 1, 5)).toBe(0);
  expect(nextOptionIndex("End", 1, 5)).toBe(4);
});

test("sem opção ativa, seta para baixo começa na primeira e seta para cima na última", () => {
  expect(nextOptionIndex("ArrowDown", -1, 4)).toBe(0);
  expect(nextOptionIndex("ArrowUp", -1, 4)).toBe(3);
});

test("outras teclas não mudam a opção ativa", () => {
  expect(nextOptionIndex("a", 1, 3)).toBe(1);
});

// Seleção múltipla (Categoria e Tipo em Demandas): a lista vazia significa "Todas".
test("marcar uma opção a acrescenta à seleção", () => {
  expect(toggleSelection([], "urgent", "all")).toEqual(["urgent"]);
  expect(toggleSelection(["urgent"], "high", "all")).toEqual(["urgent", "high"]);
});

test("marcar de novo uma opção já escolhida a tira da seleção", () => {
  expect(toggleSelection(["urgent", "high"], "urgent", "all")).toEqual(["high"]);
});

test('"Todas" limpa a seleção', () => {
  expect(toggleSelection(["urgent", "high"], "all", "all")).toEqual([]);
});

test("a seleção segue a ordem das opções, não a ordem dos cliques", () => {
  const order = ["all", "urgent", "high", "moderate", "routine"];
  expect(toggleSelection(["moderate"], "urgent", "all", order)).toEqual(["urgent", "moderate"]);
});
