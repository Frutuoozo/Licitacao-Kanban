import { useCallback, useEffect, useState } from "react";
import { IconClose } from "../icons";
import "./Toast.css";

// Notificação no canto superior direito, que some sozinha. Modelo único do sistema para avisos
// passageiros (erros, confirmações, alertas): as páginas não exibem mais frases soltas na tela.
// Tipos: ok (sucesso), error, warning e info — cada um com sua cor e ícone.
const TOAST_ICONS = {
  ok: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8.5 12.2 2.4 2.4 4.6-4.9" /></svg>,
  error: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.4v.1" /></svg>,
  warning: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 4.1 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.1a2 2 0 0 0-3.4 0Z" /><path d="M12 9.5v4M12 17v.1" /></svg>,
  info: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.6v.1" /></svg>,
};

// Erros e alertas ficam mais tempo na tela: costumam pedir que a pessoa faça algo.
const DURATION_MS = { error: 6000, warning: 6000, ok: 3500, info: 3500 };

export function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(onClose, DURATION_MS[toast.type] || DURATION_MS.info);
    return () => clearTimeout(timer);
  }, [toast, onClose]);
  return (
    <div className="lk-toast-area" aria-live="polite" role="status">
      {toast && (
        <div key={toast.id} className={`lk-toast ${toast.type}`}>
          <span className="lk-toast-icon" aria-hidden="true">{TOAST_ICONS[toast.type] || TOAST_ICONS.info}</span>
          <div className="lk-toast-text"><strong>{toast.title}</strong>{toast.text && <small>{toast.text}</small>}</div>
          <button type="button" className="lk-toast-close" onClick={onClose} aria-label="Fechar notificação"><IconClose /></button>
        </div>
      )}
    </div>
  );
}

// Uma notificação por vez: uma nova substitui a anterior.
export function useToast() {
  const [toast, setToast] = useState(null);
  const closeToast = useCallback(() => setToast(null), []);
  const notify = useCallback((type, title, text) => setToast({ id: Date.now(), type, title, text }), []);
  return { toast, notify, closeToast };
}
