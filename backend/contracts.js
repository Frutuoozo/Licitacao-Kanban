const ALLOWED_HOSTS = new Set(['docs.google.com', 'drive.google.com']);
const MAX_URL_LENGTH = 2048;

export function isAllowedContractHost(urlString) {
  try {
    const url = new URL(urlString);
    return ALLOWED_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function normalizeContractUrl(input) {
  if (typeof input !== 'string') {
    return { ok: false, error: 'URL inválida' };
  }
  const raw = input.trim();
  if (!raw || raw.length > MAX_URL_LENGTH) {
    return { ok: false, error: 'URL inválida' };
  }
  if (!isAllowedContractHost(raw)) {
    return { ok: false, error: 'Apenas links do Google Sheets ou Drive são permitidos' };
  }
  return { ok: true, url: raw };
}

const contractsCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

export function getCachedContract(key) {
  const entry = contractsCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    contractsCache.delete(key);
    return null;
  }
  return entry;
}

export function setCachedContract(key, value) {
  contractsCache.set(key, { ...value, createdAt: Date.now() });
}

export function clearContractsCache() {
  contractsCache.clear();
}
