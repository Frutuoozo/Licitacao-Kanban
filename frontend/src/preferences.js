import { createContext, useContext } from "react";

// Preferências pessoais (aba Preferências do perfil). Ficam no servidor, por usuário, e uma cópia
// no navegador para aplicar tema e letra já na abertura, antes da sessão carregar.
export const DEFAULT_PREFERENCES = {
  theme: "light",        // light | dark | auto (segue o sistema)
  fontSize: "normal",    // normal | large | xlarge
  hideDoneDocs: false,   // esconder documentos concluídos nos cartões dos processos
  exportFormat: "csv",   // csv | pdf
  dateFormat: "short",   // short (15/10/2026) | long (15 de out. de 2026)
};
export const FONT_ZOOM = { normal: 1, large: 1.1, xlarge: 1.2 };

const CACHE_KEY = "lk-prefs";
export function readCachedPreferences() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (cached && typeof cached === "object") return { ...DEFAULT_PREFERENCES, ...cached };
    // Tema escolhido antes das preferências existirem.
    if (localStorage.getItem("lk-theme") === "dark") return { ...DEFAULT_PREFERENCES, theme: "dark" };
  } catch { /* navegador sem armazenamento */ }
  return { ...DEFAULT_PREFERENCES };
}
export function cachePreferences(preferences) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(preferences)); } catch { /* ignore */ }
}

export const PreferencesContext = createContext({ preferences: DEFAULT_PREFERENCES, updatePreferences: async () => {} });
export const usePreferences = () => useContext(PreferencesContext);

// Formato de data atual, usado pelas funções de formatação fora dos componentes.
let currentDateFormat = DEFAULT_PREFERENCES.dateFormat;
export const setDateFormat = (format) => { currentDateFormat = format === "long" ? "long" : "short"; };

const toDate = (value) => {
  if (!value) return null;
  const text = String(value);
  // "AAAA-MM-DD" sem hora: meio-dia local, para não voltar um dia por causa do fuso.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text.slice(0, 10)) && text.length <= 10 ? new Date(`${text}T12:00:00`) : new Date(text);
  return Number.isFinite(date.getTime()) ? date : null;
};
// 15/10/2026 ou 15 de out. de 2026, conforme a preferência.
export function formatDate(value, fallback = "—") {
  const date = toDate(value);
  if (!date) return fallback;
  return currentDateFormat === "long"
    ? date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
    : date.toLocaleDateString("pt-BR");
}
export function formatDateTime(value, fallback = "—") {
  const date = toDate(value);
  if (!date) return fallback;
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${formatDate(date.toISOString())} ${currentDateFormat === "long" ? "às " : ""}${time}`;
}
