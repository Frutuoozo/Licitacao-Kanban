// Próxima opção ativa na lista do SelectMenu para uma tecla (como num seletor nativo).
// `current` = -1 quando nenhuma opção está ativa. Teclas que não navegam mantêm a atual.
export function nextOptionIndex(key, current, count) {
  if (count <= 0) return -1;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowDown") return current < 0 ? 0 : Math.min(current + 1, count - 1);
  if (key === "ArrowUp") return current < 0 ? count - 1 : Math.max(current - 1, 0);
  return current;
}
