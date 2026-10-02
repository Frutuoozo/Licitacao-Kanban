export function getCookie(name) {
  if (typeof document === "undefined") return "";
  const escaped = name.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

export function authFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const method = (options.method || "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = getCookie("csrf_token");
    if (csrf) headers.set("X-CSRF-Token", csrf);
  }
  return fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });
}
