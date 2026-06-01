import { useState, useEffect } from "react";

export const TYPE_COLORS = {
  "Aquisições":           "#e05500",
  "Dispensa sem Disputa": "#f07020",
  "Dispensa com Disputa": "#f0883e",
  "Pregão Eletrônico":    "#f85149",
  "Inexigibilidade":      "#e3b341",
  "Publicação":           "#e3b341",
  "Renovação Antiga":     "#3fb950",
  "Renovação Nova":       "#3fb950",
};

export const COLUMN_ORDER = ["Aquisições", "Dispensa sem Disputa", "Dispensa com Disputa", "Inexigibilidade", "Renovação Antiga", "Renovação Nova", "Publicação", "Pregão Eletrônico"];

export const DEFAULT_TEMPLATE_ITEMS = {};

export const CARD_COLORS = [
  { label: "Padrão",         value: null },
  { label: "Azul",           value: "#1e88e5" },
  { label: "Verde",          value: "#43a047" },
  { label: "Verde Claro",    value: "#66bb6a" },
  { label: "Verde Escuro",   value: "#2e7d32" },
  { label: "Amarelo",        value: "#f9a825" },
  { label: "Vermelho",       value: "#e53935" },
  { label: "Roxo",           value: "#8e24aa" },
  { label: "Ciano",          value: "#00acc1" },
  { label: "Laranja",        value: "#fb8c00" },
  { label: "Laranja Claro",  value: "#ffb74d" },
  { label: "Laranja Escuro", value: "#e65100" },
  { label: "Âmbar",          value: "#ffc107" },
];

export const PHASE_COLORS = ["#1e88e5","#8e24aa","#43a047","#66bb6a","#2e7d32","#f9a825","#e53935","#00acc1","#fb8c00","#ffb74d","#e65100","#ffc107"];

export function normalizeTemplateLine(item) {
  if (typeof item === "string") return { type: "doc", name: item, bgColor: null };
  return { type: item.type || "doc", name: item.name, bgColor: item.bgColor || null };
}

export function tmplItems(entry) {
  if (entry == null) return [];
  return Array.isArray(entry) ? entry : (entry.items || []);
}

export function tmplOrder(entry) {
  if (entry == null) return 999;
  return Array.isArray(entry) ? 999 : (entry.order ?? 999);
}

export function tmplColor(name, entry) {
  if (entry == null) return TYPE_COLORS[name] || "#30363d";
  if (Array.isArray(entry)) return TYPE_COLORS[name] || "#30363d";
  return entry.color || TYPE_COLORS[name] || "#30363d";
}

export function orderedTemplateTypeNames(templates) {
  return Object.entries(templates || {})
    .sort((a, b) => tmplOrder(a[1]) - tmplOrder(b[1]) || a[0].localeCompare(b[0]))
    .map(([k]) => k);
}

export function normalizeTemplatesFromApi(raw) {
  if (!raw || typeof raw !== "object") return {};
  const result = {};
  for (const [k, v] of Object.entries(raw)) {
    if (Array.isArray(v)) {
      result[k] = {
        items: v.map(normalizeTemplateLine),
        color: TYPE_COLORS[k] || "#30363d",
        order: COLUMN_ORDER.indexOf(k) === -1 ? 999 : COLUMN_ORDER.indexOf(k),
      };
    } else if (v && typeof v === "object") {
      result[k] = {
        items: (v.items || []).map(normalizeTemplateLine),
        color: v.color || TYPE_COLORS[k] || "#30363d",
        order: typeof v.order === "number" ? v.order : 999,
      };
    }
  }
  orderedTemplateTypeNames(result).forEach((key, i) => {
    if (result[key]) result[key].order = i;
  });
  return result;
}

export const DEFAULT_TEMPLATES = (() => {
  const out = {};
  let ord = 0;
  for (const name of COLUMN_ORDER) {
    if (!DEFAULT_TEMPLATE_ITEMS[name]) continue;
    out[name] = { items: DEFAULT_TEMPLATE_ITEMS[name].map(normalizeTemplateLine), color: TYPE_COLORS[name] || "#30363d", order: ord++ };
  }
  for (const name of Object.keys(DEFAULT_TEMPLATE_ITEMS)) {
    if (out[name]) continue;
    out[name] = { items: DEFAULT_TEMPLATE_ITEMS[name].map(normalizeTemplateLine), color: TYPE_COLORS[name] || "#30363d", order: ord++ };
  }
  return out;
})();

export function generateId() { return Math.random().toString(36).substr(2, 9); }

export function useStorage(key, defaultValue) {
  const [state, setState] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : defaultValue; } catch { return defaultValue; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(state)); } catch {} }, [key, state]);
  return [state, setState];
}

export function normalizeDocs(docs) {
  return docs.map(d => {
    if (typeof d === "string") return { id: generateId(), type: "doc", name: d, done: false, bgColor: null };
    if (!d.type) return { ...d, type: "doc", done: d.done ?? false };
    return d;
  });
}

export function groupByPhase(docs) {
  const groups = [];
  let currentPhase = null;
  let currentDocs = [];
  docs.forEach(doc => {
    if (doc.type === "phase") {
      if (currentPhase !== null || currentDocs.length > 0) groups.push({ phase: currentPhase, docs: currentDocs });
      currentPhase = doc;
      currentDocs = [];
    } else {
      currentDocs.push(doc);
    }
  });
  groups.push({ phase: currentPhase, docs: currentDocs });
  return groups;
}
