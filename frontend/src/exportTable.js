// Exportação de tabelas em CSV (Excel) ou PDF (janela de impressão → "Salvar como PDF").

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

export function downloadCsv(filename, header, rows) {
  // Separador ";" e BOM para abrir com acentos corretos no Excel em português.
  const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  link.click();
  URL.revokeObjectURL(url);
}

// Imprime uma página limpa (cabeçalho com a marca, título, data e o conteúdo) num quadro escondido; o navegador oferece
// "Salvar como PDF". A impressão acontece na própria página (antes abria outra aba, e o usuário saía da tela em que estava).
function printDocument({ title, subtitle, css, body, count }) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0", visibility: "hidden" });
  document.body.appendChild(frame);
  const win = frame.contentWindow;
  const issued = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  @page { size: A4 landscape; margin: 14mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font: 11px/1.45 Inter, Arial, sans-serif; color: #111827; }
  header { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; padding-bottom: 10px; margin-bottom: 14px; border-bottom: 2px solid #2563eb; }
  h1 { margin: 0; font-size: 18px; } .brand { color: #2563eb; font-weight: 800; }
  header p { margin: 2px 0 0; color: #6b7280; } header small { color: #6b7280; white-space: nowrap; }
  footer { margin-top: 10px; color: #6b7280; font-size: 10px; }
${css}
</style></head><body>
<header><div><h1><span class="brand">Licit</span>Kanban · ${escapeHtml(title)}</h1>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}</div><small>Emitido em ${escapeHtml(issued)}</small></header>
${body}
<footer>${count} ${count === 1 ? "registro" : "registros"}</footer>
</body></html>`);
  win.document.close();
  // Some depois da impressão (ou, se o navegador não avisar, depois de um minuto).
  const remove = () => frame.remove();
  win.addEventListener("afterprint", remove);
  setTimeout(remove, 60000);
  setTimeout(() => { if (typeof win.print === "function") { win.focus(); win.print(); } }, 50);
  return true;
}

export function printTable({ title, subtitle, header, rows }) {
  return printDocument({
    title, subtitle, count: rows.length,
    css: `
  table { width: 100%; border-collapse: collapse; }
  th { padding: 7px 8px; background: #eff6ff; color: #1e3a8a; font-size: 10px; text-align: left; text-transform: uppercase; letter-spacing: .03em; }
  td { padding: 7px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #f8fafc; }
  thead { display: table-header-group; } tr { page-break-inside: avoid; }`,
    body: `<table><thead><tr>${header.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`,
  });
}

// Gráfico de barras empilhadas, horizontal (ex.: contratos por gestor: principal + substituto).
// series: [{ key, label, color }]; rows: [{ label, values: { [key]: número } }]. A maior barra ocupa a escala inteira;
// cada pedaço mostra o seu número e o total fica no fim da barra.
export function printStackedBars({ title, subtitle, series, rows }) {
  const totals = rows.map((row) => series.reduce((sum, serie) => sum + (row.values[serie.key] || 0), 0));
  const max = Math.max(1, ...totals);
  const step = Math.max(1, Math.ceil(max / 5));
  const axisMax = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: axisMax / step + 1 }, (_, i) => i * step);
  const pct = (value) => `${Math.round((value / axisMax) * 10000) / 100}%`;
  const grid = ticks.slice(1).map((tick) => `<i style="left:${pct(tick)}"></i>`).join("");
  return printDocument({
    title, subtitle, count: rows.length,
    css: `
  .legend { display: flex; gap: 18px; margin: 0 0 12px; font-size: 10px; color: #374151; }
  .legend span { display: inline-flex; align-items: center; gap: 6px; }
  .legend span::before { content: ""; width: 10px; height: 10px; border-radius: 3px; background: var(--c); }
  .bar-axis, .bar-row { display: grid; grid-template-columns: 210px minmax(0, 1fr) 40px; align-items: center; gap: 12px; }
  .bar-axis { padding-bottom: 4px; border-bottom: 1px solid #d1d5db; color: #6b7280; font-size: 9px; }
  .bar-axis .bar-ticks { position: relative; height: 12px; }
  .bar-axis .bar-ticks span { position: absolute; transform: translateX(-50%); }
  .bar-axis .bar-ticks span:first-child { transform: none; }
  .bar-row { padding: 5px 0; border-bottom: 1px solid #f1f5f9; break-inside: avoid; }
  .bar-name { font-weight: 600; overflow-wrap: anywhere; }
  .bar-track { position: relative; height: 18px; }
  .bar-track i { position: absolute; top: -5px; bottom: -5px; width: 1px; background: #eef0f3; }
  .bar { position: relative; display: flex; height: 100%; border-radius: 4px; overflow: hidden; }
  .bar-seg { display: grid; place-items: center; min-width: 14px; color: #fff; font-size: 9px; font-weight: 700; }
  .bar-total { font-weight: 700; text-align: left; }`,
    body: `<div class="legend">${series.map((serie) => `<span style="--c:${escapeHtml(serie.color)}">${escapeHtml(serie.label)}</span>`).join("")}</div>
<div class="bar-axis"><span></span><div class="bar-ticks">${ticks.map((tick) => `<span style="left:${pct(tick)}">${tick}</span>`).join("")}</div><span></span></div>
${rows.map((row, index) => `<div class="bar-row"><span class="bar-name">${escapeHtml(row.label)}</span>
<div class="bar-track">${grid}<div class="bar" style="width:${pct(totals[index])}">${series.filter((serie) => row.values[serie.key] > 0)
    .map((serie) => `<span class="bar-seg" style="flex-grow:${row.values[serie.key]};background:${escapeHtml(serie.color)}">${row.values[serie.key]}</span>`).join("")}</div></div>
<span class="bar-total">${totals[index]}</span></div>`).join("")}`,
  });
}
