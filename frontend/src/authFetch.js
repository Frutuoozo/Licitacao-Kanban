// Endereço da API. Sem REACT_APP_API_URL (desenvolvimento), usa o mesmo host em que o site foi aberto,
// na porta 3001: localhost, IP da rede e Tailscale funcionam sem editar o .env e o cookie de sessão
// continua no mesmo site (localhost e 192.168.x.x contam como sites diferentes para o navegador).
// Em produção, "same-origin": a Vercel repassa /api e /socket.io ao backend (frontend/vercel.json), e o
// cookie de login deixa de ser "de outro site", que o Safari bloqueia.
const configuredApiUrl = process.env.REACT_APP_API_URL;
export const API_URL = configuredApiUrl === "same-origin"
  ? window.location.origin
  : configuredApiUrl || `${window.location.protocol}//${window.location.hostname}:3001`;

export function getCookie(name) {
  if (typeof document === "undefined") return "";
  const escaped = name.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

// Token CSRF recebido no cabeçalho da API. Necessário quando o site e a API estão em domínios
// diferentes, porque aí o navegador não deixa o site ler o cookie csrf_token da API.
const CSRF_KEY = "lk-csrf";
let csrfToken = "";
try { csrfToken = sessionStorage.getItem(CSRF_KEY) || ""; } catch { /* sem storage: só memória */ }

function rememberCsrf(response) {
  const token = response.headers.get("X-CSRF-Token");
  if (token && token !== csrfToken) {
    csrfToken = token;
    try { sessionStorage.setItem(CSRF_KEY, token); } catch { /* sem storage: só memória */ }
  }
  return response;
}

export function authFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const method = (options.method || "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = getCookie("csrf_token") || csrfToken;
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }
  return fetch(url, {
    ...options,
    headers,
    credentials: "include",
  }).then(rememberCsrf);
}
