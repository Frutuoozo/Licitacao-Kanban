import { nextOptionIndex } from "./selectMenuKeys";

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
