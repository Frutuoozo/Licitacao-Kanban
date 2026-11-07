import { useCallback, useEffect, useState } from "react";
import { IconCalendar, IconChart, IconCheck, IconClipboard, IconClose, IconEdit, IconFileText, IconGrid, IconLock, IconLogout, IconSettings, IconShield, IconTrash, IconUser, IconUsers } from "../icons";
import { authFetch, API_URL } from "../authFetch";
import { useAppSettings } from "../appSettings";
import { formatDate, formatDateTime, usePreferences } from "../preferences";
import "./PerfilPage.css";

const ROLE_LABEL = { admin: "Administrador", editor: "Editor", viewer: "Visualizador" };
// O que cada perfil pode fazer (o mesmo quadro da Administração).
const ROLE_ACCESS = {
  admin: ["Total", "Total", "Total", "Total"],
  editor: ["Total", "Total", "Leitura", "—"],
  viewer: ["Leitura", "Leitura", "Leitura", "—"],
};
const MODULES = ["Processos", "Contratos", "Colaboradores", "Administração"];
const MODULE_HINT = ["Quadro, calendário e relatórios", "Vigências, aditivos e documentos", "Cadastro de colaboradores", "Usuários, segurança e modelos"];
const TABS = [
  { id: "profile", label: "Perfil", icon: IconUser },
  { id: "security", label: "Segurança", icon: IconShield },
  { id: "preferences", label: "Preferências", icon: IconSettings },
];
// Páginas que podem abrir logo após o login (mesma lista do backend).
const START_PAGES = [
  { value: "dashboard", icon: IconGrid, color: "#2563eb", label: "Dashboard", hint: "Visão geral de processos e contratos" },
  { value: "processos:board", icon: IconClipboard, color: "#0891b2", label: "Processos", hint: "Quadro com o checklist de cada processo" },
  { value: "processos:calendar", icon: IconCalendar, color: "#d97706", label: "Calendário", hint: "Prazos de vencimento dos processos" },
  { value: "processos:reports", icon: IconChart, color: "#7c3aed", label: "Relatórios", hint: "Indicadores e relatório detalhado" },
  { value: "contratos", icon: IconFileText, color: "#16a34a", label: "Contratos", hint: "Vigências, aditivos e documentos" },
  { value: "colaboradores", icon: IconUsers, color: "#db2777", label: "Colaboradores", hint: "Cadastro de colaboradores" },
  { value: "admin", icon: IconShield, color: "#475569", label: "Administração", hint: "Usuários, segurança e modelos", adminOnly: true },
];
// Política de senha (a mesma validada no backend).
const PASSWORD_RULES = [
  { label: "Mínimo de 8 caracteres", test: (pw) => pw.length >= 8 },
  { label: "Uma letra maiúscula", test: (pw) => /[A-Z]/.test(pw) },
  { label: "Um número", test: (pw) => /[0-9]/.test(pw) },
  { label: "Um caractere especial", test: (pw) => /[^a-zA-Z0-9]/.test(pw) },
];

const daysSince = (value) => {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? Math.floor((Date.now() - date.getTime()) / 86400000) : null;
};

// Notificação no canto superior direito, que some sozinha (confirma o que foi salvo).
// Tipos: ok (sucesso), error, warning e info — cada um com sua cor e ícone.
const TOAST_ICONS = {
  ok: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8.5 12.2 2.4 2.4 4.6-4.9" /></svg>,
  error: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.4v.1" /></svg>,
  warning: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 4.1 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.1a2 2 0 0 0-3.4 0Z" /><path d="M12 9.5v4M12 17v.1" /></svg>,
  info: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.6v.1" /></svg>,
};
function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(onClose, toast.type === "error" ? 6000 : 3500);
    return () => clearTimeout(timer);
  }, [toast, onClose]);
  return (
    <div className="pf-toast-area" aria-live="polite" role="status">
      {toast && (
        <div key={toast.id} className={`pf-toast ${toast.type}`}>
          <span className="pf-toast-icon" aria-hidden="true">{TOAST_ICONS[toast.type] || TOAST_ICONS.info}</span>
          <div className="pf-toast-text"><strong>{toast.title}</strong>{toast.text && <small>{toast.text}</small>}</div>
          <button type="button" className="pf-toast-close" onClick={onClose} aria-label="Fechar notificação"><IconClose /></button>
        </div>
      )}
    </div>
  );
}

// ── Histórico de acessos ──
const LOGIN_EVENTS = {
  success: { label: "Entrou", tone: "ok" },
  first_access: { label: "Primeiro acesso", tone: "ok" },
  wrong_password: { label: "Senha incorreta", tone: "bad" },
  locked: { label: "Conta bloqueada", tone: "bad" },
  password_changed: { label: "Senha alterada", tone: "info" },
  sessions_revoked: { label: "Outras sessões encerradas", tone: "info" },
};
// "Chrome no Windows" a partir do navegador informado no acesso.
function describeDevice(userAgent = "") {
  const ua = String(userAgent);
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\/|CriOS\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone/.test(ua) ? "iPhone"
    : /iPad/.test(ua) ? "iPad" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : "";
  const mobile = /Mobi|Android|iPhone|iPad/.test(ua);
  const name = browser && os ? `${browser} no ${os}` : browser || os || "Aparelho desconhecido";
  return { name, mobile };
}
const IconDesktop = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>);
const IconPhone = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2.2" /><path d="M11 18.5h2" /></svg>);

function LoginHistory({ reloadKey, onUnauthorized }) {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    let live = true;
    authFetch(`${API_URL}/api/auth/login-history`)
      .then(async (res) => {
        if (res.status === 401) { onUnauthorized?.(); throw new Error("Sessão expirada."); }
        const data = await res.json().catch(() => null);
        if (!res.ok || !Array.isArray(data)) throw new Error(data?.error || "Não foi possível carregar o histórico de acessos.");
        if (live) { setEvents(data); setError(""); }
      })
      .catch((err) => { if (live) setError(err.message); });
    return () => { live = false; };
  }, [reloadKey, onUnauthorized]);
  const shown = events ? events.slice(0, expanded ? undefined : 8) : [];
  const failed = events ? events.filter((event) => LOGIN_EVENTS[event.event]?.tone === "bad").length : 0;
  return (
    <section className="adm-panel pf-history" aria-labelledby="pf-history-title">
      <header className="adm-panel-head">
        <div><h2 id="pf-history-title">Histórico de acessos</h2><p>Últimos acessos e ações de segurança na sua conta. Não reconhece algum? Altere a senha e saia dos outros aparelhos.</p></div>
        {events && failed > 0 && <span className="pf-history-alert">{failed} {failed === 1 ? "tentativa com falha" : "tentativas com falha"}</span>}
      </header>
      {error ? <p className="pf-history-empty">{error}</p>
        : events === null ? <p className="pf-history-empty">Carregando acessos…</p>
        : events.length === 0 ? <p className="pf-history-empty">Nenhum acesso registrado ainda. Os próximos logins vão aparecer aqui.</p>
        : (
          <ul className="pf-history-list">
            {shown.map((event) => {
              const device = describeDevice(event.userAgent);
              const meta = LOGIN_EVENTS[event.event] || { label: event.event, tone: "info" };
              return (
                <li key={event.id}>
                  <span className={`pf-history-icon ${meta.tone}`} aria-hidden="true">{device.mobile ? <IconPhone /> : <IconDesktop />}</span>
                  <div className="pf-history-main"><strong>{device.name}</strong><small>{event.ip ? `IP ${event.ip}` : "IP não informado"}</small></div>
                  <time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
                  <span className={`pf-history-badge ${meta.tone}`}>{meta.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      {events && events.length > 8 && (
        <button type="button" className="mm-btn outline pf-history-more" onClick={() => setExpanded((value) => !value)}>{expanded ? "Ver menos" : `Ver todos (${events.length})`}</button>
      )}
    </section>
  );
}

// Botões de escolha única (segmentados) para as preferências.
function Segmented({ label, value, options, onChange }) {
  return (
    <div className="pf-seg" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button key={String(option.value)} type="button" role="radio" aria-checked={value === option.value} className={value === option.value ? "active" : ""} onClick={() => value !== option.value && onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function PasswordDrawer({ onClose, onChanged }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const allRules = PASSWORD_RULES.every((rule) => rule.test(next));
  const matches = next && next === confirm;

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape" && !saving) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!allRules) { setError("A nova senha não atende à política de senha."); return; }
    if (!matches) { setError("A confirmação não confere com a nova senha."); return; }
    if (next === current) { setError("A nova senha precisa ser diferente da atual."); return; }
    setSaving(true);
    try {
      const res = await authFetch(`${API_URL}/api/auth/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Não foi possível alterar a senha."); return; }
      onChanged();
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const type = show ? "text" : "password";
  return (
    <div className="ct-detail-overlay ct-form-overlay" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <div className="contract-form-modal ct-form-drawer pf-drawer" role="dialog" aria-modal="true" aria-labelledby="pf-pw-title">
        <div className="contract-form-header">
          <div>
            <span className="contract-form-eyebrow">Segurança da conta</span>
            <h2 id="pf-pw-title">Alterar senha</h2>
            <p>Por segurança, você vai precisar entrar novamente depois de alterar.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} disabled={saving} aria-label="Fechar"><IconClose /></button>
        </div>
        <form className="contract-form" onSubmit={submit}>
          <div className="contract-form-body">
            {error && <div className="contract-form-error">{error}</div>}
            <section className="contract-form-section">
              <div className="contract-form-grid">
                <label className="contract-field contract-field-wide">
                  <span>Senha atual *</span>
                  <input type={type} value={current} onChange={(event) => setCurrent(event.target.value)} required autoFocus autoComplete="current-password" />
                </label>
                <label className="contract-field contract-field-wide">
                  <span>Nova senha *</span>
                  <input type={type} value={next} onChange={(event) => setNext(event.target.value)} required autoComplete="new-password" />
                </label>
                <label className="contract-field contract-field-wide">
                  <span>Confirmar nova senha *</span>
                  <input type={type} value={confirm} onChange={(event) => setConfirm(event.target.value)} required autoComplete="new-password" />
                  {confirm && <small className={`pf-match ${matches ? "ok" : "bad"}`}>{matches ? "As senhas conferem" : "As senhas não conferem"}</small>}
                </label>
                <label className="ct-checkbox contract-field-wide">
                  <input type="checkbox" checked={show} onChange={(event) => setShow(event.target.checked)} />
                  <span>Mostrar senhas</span>
                </label>
              </div>
            </section>
            <section className="contract-form-section">
              <div className="contract-form-section-title"><div><strong>Política de senha</strong></div></div>
              <ul className="pf-rules">
                {PASSWORD_RULES.map((rule) => {
                  const ok = rule.test(next);
                  return (
                    <li key={rule.label} className={ok ? "ok" : ""}>
                      <span aria-hidden="true">{ok ? "✓" : "•"}</span> {rule.label}
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
          <div className="contract-form-footer">
            <button type="button" className="btn-cancel-lg" onClick={onClose} disabled={saving}><IconClose /> Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving || !allRules || !matches}><IconEdit /> {saving ? "Salvando..." : "Alterar senha"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PerfilPage({ onLogout, onPasswordChanged, sessionUser, onOpenMenu, onStartPageChange }) {
  const { settings } = useAppSettings();
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deletePw, setDeletePw] = useState("");
  const [deleteErr, setDeleteErr] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [startPage, setStartPage] = useState(sessionUser?.startPage || "dashboard");
  const [tab, setTab] = useState("profile");
  const { preferences, updatePreferences } = usePreferences();
  const [toast, setToast] = useState(null);
  const [showRevoke, setShowRevoke] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const closeToast = useCallback(() => setToast(null), []);
  const notify = (type, title, text) => setToast({ id: Date.now(), type, title, text });
  // label: o que mudou, para a notificação dizer exatamente o que foi salvo.
  const savePreference = async (changes, label) => {
    try {
      await updatePreferences(changes);
      notify("ok", "Alteração salva", label);
    } catch (error) {
      notify("error", "Não foi possível salvar", error.message);
    }
  };
  const today = new Date();
  const dateExample = { short: today.toLocaleDateString("pt-BR"), long: today.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) };

  useEffect(() => { if (me?.startPage) setStartPage(me.startPage); }, [me]);

  // Salva na hora ao escolher; em caso de erro, volta para a opção anterior.
  const chooseStartPage = async (value) => {
    const previous = startPage;
    setStartPage(value);
    try {
      const res = await authFetch(`${API_URL}/api/auth/preferences`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startPage: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar.");
      onStartPageChange?.(value);
      notify("ok", "Página inicial salva", `${START_PAGES.find((page) => page.value === value)?.label || "Página"} abre a partir do próximo login.`);
    } catch (error) {
      setStartPage(previous);
      notify("error", "Não foi possível salvar", error.message);
    }
  };

  useEffect(() => {
    authFetch(`${API_URL}/api/auth/me`)
      .then((res) => {
        if (res.status === 401 || res.status === 403) { onLogout(); throw new Error("Unauthorized"); }
        return res.json();
      })
      .then((data) => setMe(data))
      .catch(() => setMe(null))
      .finally(() => setLoading(false));
  }, [onLogout]);

  const username = me?.username ?? sessionUser?.username ?? "—";
  const role = me?.role ?? sessionUser?.role ?? "viewer";
  const roleLabel = ROLE_LABEL[role] || "Usuário";
  const passwordAge = daysSince(me?.passwordChangedAt);
  const passwordDaysLeft = settings.passwordExpiryEnabled && passwordAge !== null ? settings.passwordExpiryDays - passwordAge : null;

  // Encerra o login nos outros aparelhos; este continua conectado (o servidor emite uma sessão nova).
  const revokeOthers = async () => {
    setRevoking(true);
    try {
      const res = await authFetch(`${API_URL}/api/auth/sessions/revoke-others`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) { onLogout(); return; }
      if (!res.ok) throw new Error(data.error || "Não foi possível encerrar as outras sessões.");
      setShowRevoke(false);
      setHistoryKey((key) => key + 1);
      notify("ok", "Outras sessões encerradas", "Os outros aparelhos precisam entrar de novo. Este continua conectado.");
    } catch (error) {
      notify("error", "Não foi possível encerrar", error.message);
    } finally {
      setRevoking(false);
    }
  };

  const deleteAccount = async (event) => {
    event.preventDefault();
    setDeleteErr(""); setDeleting(true);
    try {
      const res = await authFetch(`${API_URL}/api/auth/account`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setDeleteErr(data.error || "Não foi possível apagar a conta."); return; }
      onLogout();
    } catch {
      setDeleteErr("Erro de conexão. Tente novamente.");
    } finally {
      setDeleting(false);
    }
  };

  const accessLevels = ROLE_ACCESS[role] || ROLE_ACCESS.viewer;
  const memberDays = daysSince(me?.createdAt);
  const stats = [
    { icon: IconCalendar, value: memberDays ?? "—", label: memberDays === 1 ? "Dia no sistema" : "Dias no sistema" },
    { icon: IconShield, value: accessLevels.filter((level) => level !== "—").length, label: "Módulos liberados" },
    { icon: IconLock, value: passwordAge ?? "—", label: passwordAge === 1 ? "Dia da senha" : "Dias da senha" },
  ];
  const passwordText = passwordDaysLeft === null ? "Use uma senha forte e não a compartilhe."
    : passwordDaysLeft > 0 ? `Pela política, sua senha vence em ${passwordDaysLeft} ${passwordDaysLeft === 1 ? "dia" : "dias"}.`
    : "Sua senha venceu: você vai precisar trocá-la no próximo login.";

  return (
    <div className="lk-contracts pf-page">
      <h1 className="lk-sr">Meu perfil</h1>
      <header className="lk-menu-bar">
        <button className="lk-menu" aria-label="Abrir navegação" onClick={onOpenMenu}>☰</button>
      </header>

      <section className="pf-card" aria-label="Resumo da conta">
        <div className="pf-cover" aria-hidden="true">
          <svg viewBox="0 0 1200 240" preserveAspectRatio="xMidYMid slice">
            <path className="pf-cover-3" d="M0 160C140 90 250 70 360 120s210 110 340 40 260-150 500-60v180H0Z" />
            <path className="pf-cover-2" d="M0 40c120 10 190 90 260 150s170 60 250 0 120-170 260-170 210 120 300 150 90 10 130-10v280H0Z" />
            <path className="pf-cover-1" d="M640 240c40-90 110-150 210-150s150 60 220 40 100-60 130-80v190Z" />
            <path className="pf-cover-1" d="M0 240c30-60 90-110 170-110s130 50 180 110Z" />
            <circle className="pf-cover-dot" cx="980" cy="56" r="34" />
            <circle className="pf-cover-dot" cx="180" cy="48" r="16" />
          </svg>
        </div>
        <div className="pf-card-body">
          <ul className="pf-stats">
            {stats.map(({ icon: Icon, value, label }) => (
              <li key={label}><Icon /><strong>{loading ? "—" : value}</strong><small>{label}</small></li>
            ))}
          </ul>
          <div className="pf-identity">
            <span className="pf-avatar" aria-hidden="true">{username !== "—" ? username[0].toUpperCase() : "?"}</span>
            <h2>{username}</h2>
            <span className={`pf-role ${role}`}><IconShield /> {roleLabel}</span>
          </div>
          <div className="pf-card-actions">
            <button type="button" className="pf-round" onClick={onLogout} aria-label="Sair" title="Sair"><IconLogout /></button>
            <button type="button" className="ct-new-button" onClick={() => setShowPassword(true)}><IconLock /> Alterar senha</button>
          </div>
        </div>
        <nav className="pf-tabs" role="tablist" aria-label="Seções do perfil">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}><Icon /> {label}</button>
          ))}
        </nav>
      </section>

      {loading ? (
        <div className="ct-state"><span className="contracts-spinner" /><p>Carregando seu perfil…</p></div>
      ) : tab === "profile" ? (
        <div className="pf-columns">
          <section className="adm-panel" aria-labelledby="pf-info-title">
            <header className="adm-panel-head"><div><h2 id="pf-info-title">Sobre a conta</h2><p>Dados do seu usuário no sistema.</p></div></header>
            <ul className="pf-about">
              <li><span><IconUser /></span><div><small>Usuário</small><strong>{username}</strong></div></li>
              <li><span><IconShield /></span><div><small>Perfil de acesso</small><strong>{roleLabel}</strong></div></li>
              <li><span><IconCalendar /></span><div><small>Membro desde</small><strong>{formatDate(me?.createdAt)}</strong></div></li>
              <li><span><IconLock /></span><div><small>Última troca de senha</small><strong>{formatDate(me?.passwordChangedAt)}{passwordAge !== null && <em> · há {passwordAge} {passwordAge === 1 ? "dia" : "dias"}</em>}</strong></div></li>
            </ul>
          </section>
          <section className="adm-panel" aria-labelledby="pf-access-title">
            <header className="adm-panel-head"><div><h2 id="pf-access-title">O que o seu perfil pode fazer</h2><p>Para mudar o seu perfil de acesso, fale com um administrador.</p></div></header>
            <ul className="pf-access">
              {MODULES.map((module, i) => {
                const level = accessLevels[i];
                return (
                  <li key={module}>
                    <div><strong>{module}</strong><small>{MODULE_HINT[i]}</small></div>
                    <span className={`pf-level ${level === "Total" ? "total" : level === "Leitura" ? "read" : "none"}`}>{level === "—" ? "Sem acesso" : level}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      ) : tab === "security" ? (
        <div className="pf-security-tab">
          <div className="pf-columns pf-columns-even">
            <section className="adm-panel" aria-labelledby="pf-sec-title">
              <header className="adm-panel-head"><div><h2 id="pf-sec-title">Senha</h2><p>{passwordText}</p></div></header>
              <ul className="pf-about">
                <li><span><IconLock /></span><div><small>Última troca</small><strong>{formatDate(me?.passwordChangedAt)}</strong></div></li>
                {passwordDaysLeft !== null && <li><span><IconCalendar /></span><div><small>Validade pela política</small><strong>{passwordDaysLeft > 0 ? `${passwordDaysLeft} ${passwordDaysLeft === 1 ? "dia restante" : "dias restantes"}` : "Vencida"}</strong></div></li>}
              </ul>
              <button type="button" className="mm-btn outline pf-panel-action" onClick={() => setShowPassword(true)}><IconLock /> Alterar senha</button>
            </section>
            <section className="adm-panel" aria-labelledby="pf-sessions-title">
              <header className="adm-panel-head"><div><h2 id="pf-sessions-title">Sessões</h2><p>Aparelhos conectados à sua conta.</p></div></header>
              <ul className="pf-about">
                <li><span><IconDesktop /></span><div><small>Este aparelho</small><strong>{describeDevice(navigator.userAgent).name}</strong></div></li>
                <li><span><IconLogout /></span><div><small>Esqueceu o login aberto em outro computador ou celular?</small><strong>Encerre todas as outras sessões de uma vez.</strong></div></li>
              </ul>
              <button type="button" className="mm-btn outline pf-panel-action" onClick={() => setShowRevoke(true)}><IconLogout /> Sair dos outros aparelhos</button>
            </section>
          </div>
          <LoginHistory reloadKey={historyKey} onUnauthorized={onLogout} />
          <section className="adm-panel" aria-labelledby="pf-danger-title">
            <header className="adm-panel-head"><div><h2 id="pf-danger-title">Zona de risco</h2><p>Ações permanentes sobre a sua conta.</p></div></header>
            <div className="pf-danger">
              <div>
                <strong>Apagar conta</strong>
                <small>Remove o seu usuário do sistema. Essa ação não pode ser desfeita.</small>
              </div>
              <button type="button" className="mm-btn danger" onClick={() => { setShowDelete(true); setDeletePw(""); setDeleteErr(""); }}><IconTrash /> Apagar conta</button>
            </div>
          </section>
        </div>
      ) : (
        <div className="pf-prefs">
          <div className="pf-columns pf-columns-even">
            <section className="adm-panel" aria-labelledby="pf-look-title">
              <header className="adm-panel-head"><div><h2 id="pf-look-title">Exibição</h2><p>Como o sistema aparece para você, em qualquer aparelho.</p></div></header>
              <ul className="adm-settings-list pf-pref-list">
                <li>
                  <div><strong>Tema</strong><small>O automático acompanha o tema claro ou escuro do seu aparelho.</small></div>
                  <Segmented label="Tema" value={preferences.theme} onChange={(theme) => savePreference({ theme }, `Tema: ${{ light: "Claro", dark: "Escuro", auto: "Automático" }[theme]}.`)}
                    options={[{ value: "light", label: "Claro" }, { value: "dark", label: "Escuro" }, { value: "auto", label: "Automático" }]} />
                </li>
                <li>
                  <div><strong>Tamanho da letra</strong><small>Amplia textos, botões e tabelas das páginas.</small></div>
                  <Segmented label="Tamanho da letra" value={preferences.fontSize} onChange={(fontSize) => savePreference({ fontSize }, `Tamanho da letra: ${{ normal: "normal", large: "grande", xlarge: "extra grande" }[fontSize]}.`)}
                    options={[{ value: "normal", label: <span className="pf-aa n">Aa</span> }, { value: "large", label: <span className="pf-aa l">Aa</span> }, { value: "xlarge", label: <span className="pf-aa x">Aa</span> }]} />
                </li>
                <li>
                  <div><strong>Formato de data</strong><small>Como as datas aparecem nas listas, cartões e históricos.</small></div>
                  <Segmented label="Formato de data" value={preferences.dateFormat} onChange={(dateFormat) => savePreference({ dateFormat }, `Datas no formato ${dateExample[dateFormat]}.`)}
                    options={[{ value: "short", label: dateExample.short }, { value: "long", label: dateExample.long }]} />
                </li>
              </ul>
            </section>
            <section className="adm-panel" aria-labelledby="pf-work-title">
              <header className="adm-panel-head"><div><h2 id="pf-work-title">Processos e contratos</h2><p>Ajustes do dia a dia com processos e contratos.</p></div></header>
              <ul className="adm-settings-list pf-pref-list">
                <li>
                  <div><strong>Esconder documentos concluídos</strong><small>Nos cartões dos processos, mostra só o que ainda falta fazer.</small></div>
                  <button type="button" role="switch" aria-checked={preferences.hideDoneDocs} aria-label="Esconder documentos concluídos" className={`adm-switch ${preferences.hideDoneDocs ? "on" : ""}`} onClick={() => savePreference({ hideDoneDocs: !preferences.hideDoneDocs }, preferences.hideDoneDocs ? "Documentos concluídos voltam a aparecer." : "Documentos concluídos ficam ocultos nos processos.")}><span /></button>
                </li>
                <li>
                  <div><strong>Formato de exportação</strong><small>Usado no botão Exportar de Contratos e Relatórios.</small></div>
                  <Segmented label="Formato de exportação" value={preferences.exportFormat} onChange={(exportFormat) => savePreference({ exportFormat }, `Exportação em ${exportFormat.toUpperCase()}.`)}
                    options={[{ value: "csv", label: "CSV (Excel)" }, { value: "pdf", label: "PDF" }]} />
                </li>
              </ul>
            </section>
          </div>
          <section className="adm-panel pf-start" aria-labelledby="pf-start-title">
            <header className="adm-panel-head">
              <div>
                <h2 id="pf-start-title">Página inicial</h2>
                <p>Escolha qual página abrir assim que você entrar no sistema.</p>
              </div>
            </header>
            <div className="pf-start-options" role="radiogroup" aria-labelledby="pf-start-title">
              {START_PAGES.filter((page) => !page.adminOnly || role === "admin").map((page) => (
                <label key={page.value} className={`pf-start-option ${startPage === page.value ? "active" : ""}`} style={{ "--pf-page": page.color }}>
                  <input type="radio" name="pf-start-page" value={page.value} checked={startPage === page.value} onChange={() => chooseStartPage(page.value)} />
                  <span className="pf-start-icon" aria-hidden="true"><page.icon /></span>
                  <span className="pf-start-text">
                    <strong>{page.label}</strong>
                    <small>{page.hint}</small>
                  </span>
                  <span className="pf-start-check" aria-hidden="true"><IconCheck /></span>
                </label>
              ))}
            </div>
            <p className="pf-start-foot">A escolha é salva na hora e vale a partir do próximo login.</p>
          </section>
        </div>
      )}

      <Toast toast={toast} onClose={closeToast} />

      {showPassword && <PasswordDrawer onClose={() => setShowPassword(false)} onChanged={onPasswordChanged} />}

      {showRevoke && (
        <div className="contract-modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && !revoking && setShowRevoke(false)}>
          <div className="contract-delete-modal ct-close-modal pf-revoke-modal" role="alertdialog" aria-modal="true" aria-labelledby="pf-revoke-title">
            <div className="contract-delete-icon"><IconLogout /></div>
            <h2 id="pf-revoke-title">Sair dos outros aparelhos?</h2>
            <p>O login será encerrado em todos os outros computadores e celulares. <strong>Este aparelho continua conectado.</strong></p>
            <div className="contract-delete-actions">
              <button type="button" className="btn-cancel-lg" onClick={() => setShowRevoke(false)} disabled={revoking}>Cancelar</button>
              <button type="button" className="btn-primary" onClick={revokeOthers} disabled={revoking}>{revoking ? "Encerrando..." : "Encerrar outras sessões"}</button>
            </div>
          </div>
        </div>
      )}

      {showDelete && (
        <div className="contract-modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && !deleting && setShowDelete(false)}>
          <form className="contract-delete-modal ct-close-modal" role="alertdialog" aria-modal="true" aria-labelledby="pf-del-title" onSubmit={deleteAccount}>
            <div className="contract-delete-icon"><IconTrash /></div>
            <h2 id="pf-del-title">Apagar a sua conta?</h2>
            <p>O usuário <strong>{username}</strong> será removido permanentemente. Digite sua senha para confirmar.</p>
            {deleteErr && <div className="contract-form-error">{deleteErr}</div>}
            <div className="ct-close-fields">
              <label className="contract-field">
                <span>Sua senha *</span>
                <input className="pf-input" type="password" value={deletePw} onChange={(event) => setDeletePw(event.target.value)} required autoFocus autoComplete="current-password" />
              </label>
            </div>
            <div className="contract-delete-actions">
              <button type="button" className="btn-cancel-lg" onClick={() => setShowDelete(false)} disabled={deleting}>Cancelar</button>
              <button type="submit" className="btn-danger pf-delete-confirm" disabled={deleting || !deletePw}>{deleting ? "Apagando..." : "Apagar definitivamente"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
