import { printStackedBars, printTable } from "./exportTable";

// A impressão acontece na própria página (num quadro escondido), sem abrir outra aba.
afterEach(() => { document.body.innerHTML = ""; jest.restoreAllMocks(); });

test("printTable não abre outra aba", () => {
  const open = jest.spyOn(window, "open").mockImplementation(() => null);
  printTable({ title: "Gestores", header: ["Gestor"], rows: [["Ana"]] });
  expect(open).not.toHaveBeenCalled();
});

test("printTable monta a tabela num quadro escondido da página", () => {
  jest.spyOn(window, "open").mockImplementation(() => null);
  expect(printTable({ title: "Gestores", subtitle: "Vigentes", header: ["Gestor", "Total"], rows: [["Ana <b>", 3]] })).toBe(true);
  const frame = document.querySelector("iframe");
  expect(frame).not.toBeNull();
  const doc = frame.contentDocument;
  expect([...doc.querySelectorAll("th")].map((th) => th.textContent)).toEqual(["Gestor", "Total"]);
  expect(doc.querySelector("td").textContent).toBe("Ana <b>");
});

// Gestores: a impressão leva o próprio gráfico de barras empilhadas (principal + substituto), não uma tabela.
test("printStackedBars imprime uma barra por linha, com os pedaços e o total", () => {
  jest.spyOn(window, "open").mockImplementation(() => null);
  const series = [{ key: "principal", label: "Gestor principal", color: "#2563eb" }, { key: "substituto", label: "Gestor substituto", color: "#d97706" }];
  printStackedBars({ title: "Gestores", series, rows: [
    { label: "Ana <i>", values: { principal: 1, substituto: 3 } },
    { label: "Bruno", values: { principal: 2, substituto: 0 } },
  ] });
  const doc = document.querySelector("iframe").contentDocument;
  const rows = [...doc.querySelectorAll(".bar-row")];
  expect(rows.map((row) => row.querySelector(".bar-name").textContent)).toEqual(["Ana <i>", "Bruno"]);
  expect(rows.map((row) => row.querySelector(".bar-total").textContent)).toEqual(["4", "2"]);
  // Barra do maior total ocupa a escala inteira; pedaços vazios não aparecem.
  expect(rows[0].querySelector(".bar").style.width).toBe("100%");
  expect(rows[1].querySelector(".bar").style.width).toBe("50%");
  expect(rows[1].querySelectorAll(".bar-seg")).toHaveLength(1);
  expect([...doc.querySelectorAll(".legend span")].map((span) => span.textContent)).toEqual(["Gestor principal", "Gestor substituto"]);
});
