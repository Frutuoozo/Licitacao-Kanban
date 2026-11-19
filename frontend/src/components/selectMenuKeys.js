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

// Seleção múltipla: marca ou desmarca `value`; `allValue` ("Todas") limpa tudo (lista vazia = todas).
// Com `order` (os valores das opções), a seleção fica na ordem da lista, não na ordem dos cliques.
export function toggleSelection(selected, value, allValue, order) {
  if (value === allValue) return [];
  const next = selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value];
  return order ? order.filter((item) => next.includes(item)) : next;
}
