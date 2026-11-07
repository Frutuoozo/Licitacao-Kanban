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

// Abre uma página limpa só com a tabela e chama a impressão; o navegador oferece "Salvar como PDF".
// Retorna false se o navegador bloqueou a nova janela.
export function printTable({ title, subtitle, header, rows }) {
  const win = window.open("", "_blank");
  if (!win) return false;
  const issued = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  @page { size: A4 landscape; margin: 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 11px/1.45 Inter, Arial, sans-serif; color: #111827; }
  header { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; padding-bottom: 10px; margin-bottom: 14px; border-bottom: 2px solid #2563eb; }
  h1 { margin: 0; font-size: 18px; } .brand { color: #2563eb; font-weight: 800; }
  header p { margin: 2px 0 0; color: #6b7280; } header small { color: #6b7280; white-space: nowrap; }
  table { width: 100%; border-collapse: collapse; }
  th { padding: 7px 8px; background: #eff6ff; color: #1e3a8a; font-size: 10px; text-align: left; text-transform: uppercase; letter-spacing: .03em; }
  td { padding: 7px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #f8fafc; }
  thead { display: table-header-group; } tr { page-break-inside: avoid; }
  footer { margin-top: 10px; color: #6b7280; font-size: 10px; }
</style></head><body>
<header><div><h1><span class="brand">Licit</span>Kanban · ${escapeHtml(title)}</h1>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}</div><small>Emitido em ${escapeHtml(issued)}</small></header>
<table><thead><tr>${header.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>
<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>
<footer>${rows.length} ${rows.length === 1 ? "registro" : "registros"}</footer>
<script>window.onload = function () { window.focus(); window.print(); };</script>
</body></html>`);
  win.document.close();
  return true;
}
