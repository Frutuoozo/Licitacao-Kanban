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
