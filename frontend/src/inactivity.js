// Sessão automática (Administração → Segurança): encerra depois de `limitMs` sem atividade e avisa com
// contagem regressiva no último minuto. Antes havia também um limite fixo de 15 min que valia sempre,
// mesmo com a opção desligada, e encerrava sem aviso.
export const INACTIVITY_WARNING_MS = 60 * 1000;

export function inactivityStatus({ enabled, limitMs, lastActivity, now }) {
  if (!enabled) return { expired: false, warningSeconds: null };
  const remaining = limitMs - (now - lastActivity);
  if (remaining <= 0) return { expired: true, warningSeconds: null };
  if (remaining <= INACTIVITY_WARNING_MS) return { expired: false, warningSeconds: Math.ceil(remaining / 1000) };
  return { expired: false, warningSeconds: null };
}
