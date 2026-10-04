import { useState, useEffect, useCallback, useMemo } from "react";
import { io } from "socket.io-client";
import {
  IconClose, IconPlus, IconUser, IconShield,
  IconEye, IconEyeOff, IconClipboard, IconFileText, IconUsers,
} from "./icons";
import {
  DEFAULT_TEMPLATES, normalizeTemplatesFromApi,
  orderedTemplateTypeNames, normalizeDocs,
} from "./utils";
import ProcessosPage from "./pages/ProcessosPage";
import DashboardPage from "./pages/DashboardPage";
import AppSidebar from "./components/AppSidebar";
import "./pages/ProcessosPage.css";
import ContratosAtivos from "./pages/ContratosPage";
import AdminPage from "./pages/AdminPage";
import ColaboradoresPage from "./pages/ColaboradoresPage";
import { AppSettingsContext, DEFAULT_SETTINGS } from "./appSettings";
import PerfilPage from "./pages/PerfilPage";
import { authFetch } from "./authFetch";

// ── Login ─────────────────────────────────────────────────────────────────────

function Login({ onLogin, notice, noticeOk }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // Estados de primeiro acesso
  const [isFirstAccess, setIsFirstAccess] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true); setError(""); setSuccessMsg("");
    const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";

    try {
      if (isFirstAccess) {
        // Validações locais da senha
        if (newPassword.length < 8) {
          setError("A nova senha deve ter no mínimo 8 caracteres");
          setLoading(false);
          return;
        }
        // Mesma política do backend: maiúscula, número e caractere especial.
        if (!/[A-Z]/.test(newPassword)) {
          setError("A nova senha deve conter pelo menos uma letra maiúscula");
          setLoading(false);
          return;
        }
        if (!/[0-9]/.test(newPassword)) {
          setError("A nova senha deve conter pelo menos um número");
          setLoading(false);
          return;
        }
        const specialCharRegex = /[^a-zA-Z0-9]/;
        if (!specialCharRegex.test(newPassword)) {
          setError("A nova senha deve conter pelo menos um caractere especial");
          setLoading(false);
          return;
        }
        if (newPassword !== confirmPassword) {
          setError("As senhas não coincidem");
          setLoading(false);
          return;
        }

        const res = await authFetch(`${API_URL}/api/auth/first-access`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, currentPassword: temporaryPassword, password: newPassword })
        });
        const data = await res.json();
        if (res.ok) {
          onLogin(data);
        } else {
          setError(data.error || "Erro ao configurar primeiro acesso");
        }
      } else {
        const res = await authFetch(`${API_URL}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (res.ok) {
          if (data.firstAccess) {
            setIsFirstAccess(true);
            setTemporaryPassword(password);
            setPassword("");
            setSuccessMsg(data.passwordExpired
              ? "Sua senha expirou pela política de segurança. Defina uma nova senha para continuar."
              : "Primeiro acesso detectado! Por favor, configure sua nova senha.");
          } else {
            onLogin(data);
          }
        } else {
          setError(data.error || "Login falhou");
        }
      }
    } catch {
      setError("Erro ao conectar no servidor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ls-shell">
      <div className="ls-orb ls-orb-1" aria-hidden="true" />
      <div className="ls-orb ls-orb-2" aria-hidden="true" />
      <div className="ls-orb ls-orb-3" aria-hidden="true" />
      <div className="ls-orb ls-orb-4" aria-hidden="true" />
      <div className="ls-float-node ls-float-node-1" aria-hidden="true">
        <span className="ls-float-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
            <path d="M4 6h5" />
            <path d="M4 12h3" />
          </svg>
        </span>
        <span className="ls-float-text">
          <strong>Fluxo em andamento</strong>
          <small>etapa validada</small>
        </span>
      </div>
      <div className="ls-float-node ls-float-node-2" aria-hidden="true">
        <span className="ls-float-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="5" width="16" height="14" rx="2" />
            <path d="M8 9h8" />
            <path d="M8 13h5" />
          </svg>
        </span>
        <span className="ls-float-text">
          <strong>Fila organizada</strong>
          <small>etapas sincronizadas</small>
        </span>
      </div>
      <div className="ls-float-node ls-float-node-3" aria-hidden="true">
        <span className="ls-float-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v18" />
            <path d="M5 8h14" />
            <path d="M7 16h10" />
          </svg>
        </span>
        <span className="ls-float-text">
          <strong>Controle ativo</strong>
          <small>status em tempo real</small>
        </span>
      </div>
      <div className="ls-float-node ls-float-node-4" aria-hidden="true">
        <span className="ls-float-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </span>
        <span className="ls-float-text">
          <strong>Etapa validada</strong>
          <small>checklist concluído</small>
        </span>
      </div>
      <div className="ls-float-node ls-float-node-5" aria-hidden="true">
        <span className="ls-float-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="4" width="16" height="16" rx="3" />
            <path d="M4 10h16" />
            <path d="M10 20V10" />
          </svg>
        </span>
        <span className="ls-float-text">
          <strong>Painel sincronizado</strong>
          <small>visão centralizada</small>
        </span>
      </div>
      <div className="ls-float-node ls-float-node-6" aria-hidden="true">
        <span className="ls-float-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-3-6.7" />
            <path d="M21 3v6h-6" />
          </svg>
        </span>
        <span className="ls-float-text">
          <strong>Fluxo monitorado</strong>
          <small>movimento contínuo</small>
        </span>
      </div>
      <div className="ls-card">
        <div className="ls-brand">
          <div className="ls-logo">Licit<span>Kanban</span></div>
          <p className="ls-tagline">Gestão inteligente de licitações</p>
        </div>
        <h2 className="ls-title">{isFirstAccess ? "Primeiro Acesso" : "Bem-vindo de volta"}</h2>
        <p className="ls-subtitle">{isFirstAccess ? "Defina sua nova senha para continuar" : "Entre com suas credenciais"}</p>

        {notice && !successMsg && (noticeOk
          ? <div className="ls-success">{notice}</div>
          : <p className="ls-error">{notice}</p>)}
        {successMsg && (
          <div className="ls-success">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="ls-form">
          {isFirstAccess ? (
            <>
              <div className="ls-field-wrap">
                <span className="ls-field-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg></span>
                <input className="ls-input" style={{ paddingRight: 42 }} type={showPassword ? "text" : "password"} placeholder="Nova Senha" value={newPassword} onChange={e => setNewPassword(e.target.value)} autoComplete="new-password" autoCapitalize="off" autoCorrect="off" spellCheck={false} required />
                <button type="button" className="ls-eye-btn" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>
                  {showPassword ? <IconEyeOff /> : <IconEye />}
                </button>
              </div>
              <div className="ls-field-wrap">
                <span className="ls-field-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg></span>
                <input className="ls-input" style={{ paddingRight: 42 }} type={showPassword ? "text" : "password"} placeholder="Confirmar Nova Senha" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" autoCapitalize="off" autoCorrect="off" spellCheck={false} required />
              </div>
              <p style={{ fontSize: "0.75rem", color: "var(--muted)", margin: "0 0 6px", lineHeight: "1.4" }}>
                Requisitos da senha:<br />
                • Mínimo de 8 caracteres<br />
                • Pelo menos uma letra maiúscula e um número<br />
                • Pelo menos um caractere especial (ex: !, @, #, $, etc)
              </p>
              <p className="ls-requirements">
                Use uma senha que combine letras, números e símbolo para ficar fácil de lembrar e mais difícil de adivinhar.
              </p>
            </>
          ) : (
            <>
              <div className="ls-field-wrap">
                <span className="ls-field-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg></span>
                <input className="ls-input" type="text" placeholder="Usuário" value={username} onChange={e => setUsername(e.target.value)} required autoComplete="username" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
              </div>
              <div className="ls-field-wrap">
                <span className="ls-field-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg></span>
                <input className="ls-input" style={{ paddingRight: 42 }} type={showPassword ? "text" : "password"} placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
                <button type="button" className="ls-eye-btn" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>
                  {showPassword ? <IconEyeOff /> : <IconEye />}
                </button>
              </div>
              <p className="ls-requirements">
                Se for seu primeiro acesso, use a senha temporária recebida e siga para a definição da nova senha.
              </p>
            </>
          )}
          {error && <p className="ls-error">{error}</p>}
          <button type="submit" className="ls-submit" disabled={loading}>
            {loading ? "Aguarde..." : (isFirstAccess ? "Definir Senha e Entrar" : "Entrar")}
            {!loading && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [columns, setColumns] = useState([]);
  const [processLoading, setProcessLoading] = useState(true);
  const [processError, setProcessError] = useState("");
  const [archived, setArchived] = useState([]);
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
  const [sectors, setSectors] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [showNewProcess, setShowNewProcess] = useState(false);
  const [activeTab, setActiveTab] = useState("board");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("dashboard");
  // Abre a página inicial escolhida pelo usuário em Configurações ("seção" ou "seção:aba").
  const openStartPage = useCallback((user) => {
    const [section, tab] = String(user?.startPage || "dashboard").split(":");
    const allowed = section === "admin" ? user?.role === "admin" : ["dashboard", "processos", "contratos", "colaboradores"].includes(section);
    setActiveSection(allowed ? section : "dashboard");
    if (allowed && section === "processos") setActiveTab(tab || "board");
  }, []);
  const [sessionUser, setSessionUser] = useState(undefined);
  const [inactivityWarning, setInactivityWarning] = useState(false);
  const [inactivityCountdown, setInactivityCountdown] = useState(60);

  const [appSettings, setAppSettings] = useState(DEFAULT_SETTINGS);
  const [logoutNotice, setLogoutNotice] = useState("");
  const [logoutNoticeOk, setLogoutNoticeOk] = useState(false);
  const handleLogout = useCallback(() => {
    authFetch(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/auth/logout`, { method: "POST" })
      .catch(() => { })
      .finally(() => setSessionUser(null));
  }, []);

  // Configurações administrativas (sessão automática, confirmação ao excluir...).
  useEffect(() => {
    if (!sessionUser) return;
    authFetch(`${process.env.REACT_APP_API_URL || "http://localhost:3001"}/api/settings`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (data) setAppSettings({ ...DEFAULT_SETTINGS, ...data }); })
      .catch(() => { });
  }, [sessionUser]);

  // Sessão automática: encerra a sessão após o tempo configurado sem atividade.
  // A última atividade fica no localStorage para valer entre abas abertas.
  useEffect(() => {
    if (!sessionUser || !appSettings.sessionTimeoutEnabled) return undefined;
    const limitMs = appSettings.sessionTimeoutMinutes * 60 * 1000;
    const KEY = "lk-last-activity";
    const touch = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch { /* sem storage: vale só esta aba */ } lastLocal = Date.now(); };
    let lastLocal = Date.now();
    touch();
    let throttle = 0;
    const onActivity = () => { const now = Date.now(); if (now - throttle > 15000) { throttle = now; touch(); } };
    const events = ["mousedown", "keydown", "scroll", "touchstart", "mousemove"];
    events.forEach(event => window.addEventListener(event, onActivity, { passive: true }));
    const timer = setInterval(() => {
      let last = lastLocal;
      try { last = Math.max(last, Number(localStorage.getItem(KEY)) || 0); } catch { /* usa a desta aba */ }
      if (Date.now() - last >= limitMs) {
        setLogoutNoticeOk(false);
        setLogoutNotice(`Sua sessão foi encerrada após ${appSettings.sessionTimeoutMinutes} minutos sem atividade.`);
        handleLogout();
      }
    }, 30000);
    return () => { clearInterval(timer); events.forEach(event => window.removeEventListener(event, onActivity)); };
  }, [sessionUser, appSettings.sessionTimeoutEnabled, appSettings.sessionTimeoutMinutes, handleLogout]);

  // Aviso de inatividade
  useEffect(() => {
    if (!sessionUser) return;
    const WARN_AT = 14 * 60 * 1000, LOGOUT_AT = 15 * 60 * 1000;
    let warnTimer, logoutTimer, countdownInterval, warningActive = false;
    const reset = () => {
      clearTimeout(warnTimer); clearTimeout(logoutTimer); clearInterval(countdownInterval);
      if (warningActive) { warningActive = false; setInactivityWarning(false); setInactivityCountdown(60); }
      warnTimer = setTimeout(() => { warningActive = true; setInactivityWarning(true); setInactivityCountdown(60); countdownInterval = setInterval(() => { setInactivityCountdown(s => s - 1); }, 1000); }, WARN_AT);
      logoutTimer = setTimeout(handleLogout, LOGOUT_AT);
    };
    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    events.forEach(e => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => { clearTimeout(warnTimer); clearTimeout(logoutTimer); clearInterval(countdownInterval); events.forEach(e => window.removeEventListener(e, reset)); setInactivityWarning(false); };
  }, [sessionUser, handleLogout]);

  const loadSessionUser = useCallback(() => {
    const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";
    authFetch(`${API_URL}/api/auth/me`)
      .then((r) => { if (r.status === 401 || r.status === 403) { setSessionUser(null); throw new Error("auth"); } return r.json(); })
      .then((user) => { setSessionUser(user); openStartPage(user); })
      .catch((e) => { if (e.message !== "auth") setSessionUser(null); });
  }, [openStartPage]);

  useEffect(() => { loadSessionUser(); }, [loadSessionUser]);

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem("licit_theme") || "dark";
      document.documentElement.setAttribute("data-theme", savedTheme);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (sessionUser && activeSection === "admin" && sessionUser.role !== "admin") setActiveSection("processos");
  }, [sessionUser, activeSection]);

  const handleSelfDemotedFromAdmin = useCallback(() => {
    loadSessionUser(); setActiveSection("processos");
  }, [loadSessionUser]);

  // Carregar dados iniciais
  useEffect(() => {
    if (!sessionUser) return;
    const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";
    setProcessLoading(true);
    setProcessError("");
    authFetch(`${API_URL}/api/processes`)
      .then(res => { if (!res.ok && res.status !== 401 && res.status !== 403) throw new Error("load"); if (res.status === 401 || res.status === 403) throw new Error('Unauthorized'); return res.json(); })
      .then(data => { setColumns(data.filter(p => p.status === 'active')); setArchived(data.filter(p => p.status === 'archived')); })
      .catch(err => { if (err.message === 'Unauthorized') handleLogout(); else setProcessError("Não foi possível carregar os processos."); })
      .finally(() => setProcessLoading(false));
    authFetch(`${API_URL}/api/templates`)
      .then(res => res.json())
      .then(data => { if (Object.keys(data).length > 0) setTemplates(normalizeTemplatesFromApi(data)); })
      .catch(console.error);
    authFetch(`${API_URL}/api/sectors`)
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setSectors(data); })
      .catch(console.error);
  }, [sessionUser, handleLogout]);

  // Colaboradores: recarrega ao abrir Processos para refletir cadastros recentes.
  useEffect(() => {
    if (!sessionUser || activeSection !== "processos") return;
    const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";
    authFetch(`${API_URL}/api/collaborators`)
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setCollaborators(data.filter(c => c.ativo !== false)); })
      .catch(console.error);
  }, [sessionUser, activeSection]);

  // Socket.IO
  useEffect(() => {
    if (!sessionUser) return;
    const socket = io(process.env.REACT_APP_API_URL || "http://localhost:3001", { withCredentials: true });
    socket.on('process:added', (p) => { if (p.status === 'active') setColumns(prev => prev.find(c => c.id === p.id) ? prev : [...prev, p]); else setArchived(prev => prev.find(c => c.id === p.id) ? prev : [...prev, p]); });
    socket.on('process:updated', ({ id, title, processNumber, setor, dueDate, type, typeColor, docs }) => {
      const next = { title, processNumber, setor, dueDate, type: type ?? null, typeColor: typeColor ?? null, docs: docs || [] };
      setColumns(p => p.map(c => c.id === id ? { ...c, ...next } : c));
      setArchived(p => p.map(c => c.id === id ? { ...c, ...next } : c));
    });
    socket.on('process:deleted', ({ id }) => { setColumns(p => p.filter(c => c.id !== id)); setArchived(p => p.filter(c => c.id !== id)); });
    socket.on('process:items_updated', ({ id, docs }) => { setColumns(p => p.map(c => c.id === id ? { ...c, docs } : c)); setArchived(p => p.map(c => c.id === id ? { ...c, docs } : c)); });
    socket.on('process:status_changed', ({ id, status }) => {
      if (status === 'archived') setColumns(p => { const col = p.find(c => c.id === id); if (col) setArchived(a => a.find(c => c.id === id) ? a : [...a, { ...col, archivedAt: new Date().toISOString() }]); return p.filter(c => c.id !== id); });
      else setArchived(p => { const col = p.find(c => c.id === id); if (col) setColumns(a => a.find(c => c.id === id) ? a : [...a, col]); return p.filter(c => c.id !== id); });
    });
    socket.on('templates:updated', (data) => {
      setTemplates(normalizeTemplatesFromApi(data));
      const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";
      authFetch(`${API_URL}/api/processes`)
        .then(res => { if (res.status === 401 || res.status === 403) throw new Error('Unauthorized'); return res.json(); })
        .then(data => { setColumns(data.filter(p => p.status === 'active')); setArchived(data.filter(p => p.status === 'archived')); })
        .catch(err => { if (err.message === 'Unauthorized') handleLogout(); });
    });
    return () => socket.disconnect();
  }, [sessionUser, handleLogout]);

  // Seções da sidebar
  const SECTIONS = useMemo(() => {
    const base = [
      { id: "dashboard", label: "Dashboard", icon: IconClipboard },
      { id: "processos", label: "Acompanhar Processos", icon: IconClipboard },
      { id: "contratos", label: "Contratos Ativos", icon: IconFileText },
      { id: "colaboradores", label: "Colaboradores", icon: IconUsers },
      { id: "perfil", label: "Meu Perfil", icon: IconUser },
    ];
    if (sessionUser?.role === "admin") base.push({ id: "admin", label: "Administração", icon: IconShield });
    return base;
  }, [sessionUser?.role]);

  // API helper
  const apiFetch = useCallback((url, method, body) => {
    const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";
    authFetch(`${API_URL}${url}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      .then(res => { if (res.status === 401 || res.status === 403) setSessionUser(null); })
      .catch(console.error);
  }, []);

  // Operações de processos
  const addColumn = (col) => { setColumns(p => [...p, col]); apiFetch('/api/processes', 'POST', col); };
  const deleteColumn = (id) => { setColumns(p => p.filter(c => c.id !== id)); apiFetch(`/api/processes/${id}`, 'DELETE'); };
  const renameColumn = (id, dataOrTitle) => {
    const payload = typeof dataOrTitle === 'string' ? { title: dataOrTitle } : (dataOrTitle || {});
    const current = columns.find(c => c.id === id) || archived.find(c => c.id === id) || {};
    const hasType = Object.prototype.hasOwnProperty.call(payload, 'type');
    const hasTypeColor = Object.prototype.hasOwnProperty.call(payload, 'typeColor');
    const hasDocs = Object.prototype.hasOwnProperty.call(payload, 'docs');
    const normalizedPayload = {
      title: payload.title ?? current.title,
      processNumber: payload.processNumber ?? current.processNumber ?? "",
      setor: payload.setor ?? current.setor ?? "",
      dueDate: payload.dueDate ?? current.dueDate ?? null,
      type: hasType ? (payload.type ?? null) : (current.type ?? null),
      typeColor: hasTypeColor ? (payload.typeColor ?? null) : (current.typeColor ?? null),
      docs: hasDocs ? (payload.docs ?? []) : (current.docs ?? []),
    };

    setColumns(prev => prev.map(c => c.id === id ? { ...c, ...normalizedPayload, docs: normalizedPayload.docs } : c));
    setArchived(prev => prev.map(c => c.id === id ? { ...c, ...normalizedPayload, docs: normalizedPayload.docs } : c));
    apiFetch(`/api/processes/${id}`, 'PUT', normalizedPayload);
  };
  const updateDocs = (colId, docs) => {
    setColumns(p => { const next = p.map(c => c.id === colId ? { ...c, docs } : c); apiFetch(`/api/processes/${colId}/items`, 'PUT', { docs }); return next; });
  };
  const archiveColumn = (id) => { const col = columns.find(c => c.id === id); if (col) { setArchived(p => [...p, { ...col, archivedAt: new Date().toISOString() }]); setColumns(p => p.filter(c => c.id !== id)); apiFetch(`/api/processes/${id}/status`, 'PUT', { status: 'archived' }); } };
  const unarchiveColumn = (id) => {
    const col = archived.find(c => c.id === id);
    if (col) {
      const docs = normalizeDocs(col.docs || []);
      const lastDocIndex = docs.findLastIndex(doc => doc.type === 'doc');
      const restoredDocs = lastDocIndex === -1
        ? docs
        : docs.map((doc, index) => index === lastDocIndex ? { ...doc, done: false } : doc);
      const restoredColumn = { ...col, docs: restoredDocs };
      setColumns(p => [...p, restoredColumn]);
      setArchived(p => p.filter(c => c.id !== id));
      apiFetch(`/api/processes/${id}/items`, 'PUT', { docs: restoredDocs });
      apiFetch(`/api/processes/${id}/status`, 'PUT', { status: 'active' });
    }
  };
  const deleteArchived = (id) => { setArchived(p => p.filter(c => c.id !== id)); apiFetch(`/api/processes/${id}`, 'DELETE'); };

  // Retorna uma promessa: a tela de modelos mostra sucesso ou o erro do servidor.
  const saveTemplates = async (newTemplates) => {
    const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";
    const res = await authFetch(`${API_URL}/api/templates`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newTemplates) });
    if (res.status === 401) { setSessionUser(null); throw new Error('Sessão expirada.'); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Não foi possível salvar os modelos.');
    setTemplates(newTemplates);
  };

  const processTypeOrder = useMemo(() => orderedTemplateTypeNames(templates), [templates]);
  const sortedColumns = useMemo(() => {
    const rank = (idx) => (idx === -1 ? 999 : idx);
    return [...columns].sort((a, b) => {
      const idxA = processTypeOrder.indexOf(a.type || ""), idxB = processTypeOrder.indexOf(b.type || "");
      if (rank(idxA) !== rank(idxB)) return rank(idxA) - rank(idxB);
      return (a.title || "").localeCompare(b.title || "", "pt-BR");
    });
  }, [columns, processTypeOrder]);

  const processPage = (<ProcessosPage
                onDashboard={() => setActiveSection("dashboard")}
                onOpenMenu={() => setSidebarOpen(true)}
                loading={processLoading} error={processError}
                columns={columns} archived={archived} templates={templates} sortedColumns={sortedColumns}
                activeTab={activeTab} setActiveTab={setActiveTab}
                showNewProcess={showNewProcess} setShowNewProcess={setShowNewProcess}
                addColumn={addColumn} updateDocs={updateDocs}
                deleteColumn={deleteColumn} renameColumn={renameColumn} archiveColumn={archiveColumn}
                unarchiveColumn={unarchiveColumn} deleteArchived={deleteArchived}
                collaborators={collaborators}
                isViewer={sessionUser?.role === "viewer"}
              />);

  return (
    <AppSettingsContext.Provider value={{ settings: appSettings, setSettings: setAppSettings }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=Nunito+Sans:wght@300;400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root, [data-theme="dark"] {
          --bg: #0d1117; --surface: #161b22; --surface2: #1c2330; --border: #30363d;
          --accent: #f0883e; --accent2: #58a6ff; --green: #3fb950; --red: #f85149;
          --text: #e6edf3; --muted: #8b949e; --radius: 10px; --btn-text: #000000;
        }

        [data-theme="white"] {
          --bg: #f4f6f8; --surface: #ffffff; --surface2: #f0f3f8; --border: #d0d7de;
          --accent: #2563eb; --accent2: #0284c7; --green: #16a34a; --red: #dc2626;
          --text: #1e293b; --muted: #64748b; --radius: 10px; --btn-text: #ffffff;
        }

        [data-theme="creme"] {
          --bg: #f5efe6; --surface: #fcf9f2; --surface2: #ebe3d5; --border: #d8cebe;
          --accent: #c2410c; --accent2: #4338ca; --green: #15803d; --red: #b91c1c;
          --text: #292524; --muted: #78716c; --radius: 10px; --btn-text: #ffffff;
        }

        [data-theme="royal"] {
          --bg: #0b132b; --surface: #1c2541; --surface2: #273459; --border: #3a4a7c;
          --accent: #38bdf8; --accent2: #818cf8; --green: #34d399; --red: #f87171;
          --text: #f8fafc; --muted: #94a3b8; --radius: 10px; --btn-text: #0b132b;
        }

        body { background: var(--bg); color: var(--text); font-family: 'Nunito Sans', sans-serif; min-height: 100vh; transition: background-color 0.25s, color 0.25s; }
        .app {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          position: relative;
          overflow: hidden;
          --space-xs: 6px;
          --space-sm: 10px;
          --space-md: 16px;
          --space-lg: 24px;
          --space-xl: 32px;
        }
        .app::before { content: ''; position: fixed; inset: -60%; background-image: linear-gradient(rgba(128,128,128,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(128,128,128,0.04) 1px, transparent 1px); background-size: 40px 40px; transform: rotate(15deg); pointer-events: none; z-index: 0; }
        .app-orb { position: fixed; border-radius: 50%; pointer-events: none; filter: blur(120px); z-index: 0; opacity: 0.45; }
        .app-orb-1 { width: 700px; height: 700px; top: -20%; left: -10%; background: radial-gradient(circle, rgba(21,101,192,0.08) 0%, transparent 70%); }
        .app-orb-2 { width: 600px; height: 600px; bottom: -15%; right: -10%; background: radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%); }
        .header, .tabs, .board, .dashboard, .archive-grid, .empty-board { position: relative; z-index: 1; }

        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(.92) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes slideInRight { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes slideInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes checkPop { 0% { transform: scale(.6); } 50% { transform: scale(1.25); } 100% { transform: scale(1); } }
        @keyframes checkDraw { from { stroke-dashoffset: 24; } to { stroke-dashoffset: 0; } }
        @keyframes pulseRing { 0% { box-shadow: 0 0 0 0 rgba(63,185,80,.5); } 70% { box-shadow: 0 0 0 8px rgba(63,185,80,0); } 100% { box-shadow: 0 0 0 0 rgba(63,185,80,0); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes bounceIn { 0% { transform: scale(.3); opacity: 0; } 50% { transform: scale(1.05); } 70% { transform: scale(.95); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes archiveFlash { 0% { box-shadow: 0 0 0 0 rgba(63,185,80,0); } 50% { box-shadow: 0 0 0 4px rgba(63,185,80,.4), 0 0 30px rgba(63,185,80,.5); } 100% { box-shadow: 0 0 0 0 rgba(63,185,80,0); } }
        @keyframes archiveOut { 0% { transform: scale(1) translateY(0) rotate(0); opacity: 1; filter: brightness(1); } 25% { transform: scale(1.04) translateY(-6px) rotate(-1deg); filter: brightness(1.25); } 60% { transform: scale(.85) translateY(20px) rotate(2deg); opacity: .6; filter: brightness(1); } 100% { transform: scale(.4) translateY(80px) rotate(4deg); opacity: 0; filter: brightness(.6); } }
        @keyframes confettiPop { 0% { transform: scale(0); opacity: 1; } 80% { transform: scale(1.2); opacity: .9; } 100% { transform: scale(.6); opacity: 0; } }

        .header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 14px 28px; display: flex; align-items: center; gap: 16px; position: sticky; top: 0; z-index: 10; }
        .logo { font-family: 'Outfit', sans-serif; font-size: 1.3rem; font-weight: 800; color: var(--accent); letter-spacing: -0.5px; }
        .logo span { color: var(--text); }
        .header-stats { font-size: 0.8rem; color: var(--muted); }
        .header-actions { margin-left: auto; display: flex; gap: 10px; }

        .hamburger { background: none; border: none; cursor: pointer; padding: 6px 4px; display: flex; flex-direction: column; gap: 5px; border-radius: 8px; transition: background .15s; flex-shrink: 0; }
        .hamburger:hover { background: var(--surface2); }
        .hamburger span { display: block; width: 20px; height: 2px; background: var(--text); border-radius: 2px; }

        .profile-wrap { position: relative; flex-shrink: 0; }
        .profile-trigger { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; padding: 0; border: 1px solid var(--border); border-radius: 10px; background: var(--surface2); color: var(--text); cursor: pointer; transition: background .15s, border-color .15s; }
        .profile-trigger:hover { background: var(--surface); border-color: var(--muted); }
        .profile-dropdown { position: absolute; top: calc(100% + 8px); right: 0; z-index: 60; min-width: 288px; max-width: min(320px, calc(100vw - 40px)); padding: 14px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.45); animation: scaleIn .2s cubic-bezier(.34,1.56,.64,1); }
        .profile-dropdown-title { font-family: 'Outfit', sans-serif; font-size: 0.95rem; font-weight: 700; margin-bottom: 12px; color: var(--text); }
        .profile-field { margin-bottom: 12px; }
        .profile-label { display: block; font-size: 0.68rem; color: var(--muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: .05em; }
        .profile-value { font-size: 0.88rem; color: var(--text); word-break: break-word; }
        .profile-mono { font-family: ui-monospace, 'Nunito Sans', monospace; font-size: 0.84rem; }
        .profile-pass-row { display: flex; align-items: center; gap: 8px; justify-content: space-between; }
        .profile-pass-row .profile-value { flex: 1; min-width: 0; }
        .profile-muted { font-size: 0.8rem; color: var(--muted); }
        .profile-hint { font-size: 0.72rem; color: var(--muted); margin: 0 0 4px; line-height: 1.45; }
        .profile-actions-col { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; padding-top: 12px; border-top: 1px solid var(--border); }
        .profile-action-full { width: 100%; justify-content: center; }
        .profile-danger-btn { color: var(--red) !important; border-color: rgba(248,81,73,.35) !important; }
        .profile-danger-btn:hover { background: rgba(248,81,73,.08) !important; }
        .profile-form-label { font-size: 0.78rem; color: var(--muted); margin-bottom: 4px; display: block; }
        .profile-err { color: var(--red); font-size: 0.85rem; margin-top: 4px; }
        .profile-modal-footer { border: none !important; padding: 16px 0 0 !important; margin-top: 4px; justify-content: flex-end !important; }
        .profile-delete-lead { margin-bottom: 10px; line-height: 1.45; }
        .profile-delete-submit { background: var(--red) !important; color: #fff !important; }

        /* ── Meu Perfil Page ── */
        .perfil-page { flex: 1; padding: 28px; overflow-y: auto; max-width: 960px; margin: 0 auto; width: 100%; box-sizing: border-box; }
        .perfil-container { display: flex; flex-direction: column; gap: 24px; }
        .perfil-header-card { position: relative; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 28px; display: flex; align-items: center; gap: 20px; box-shadow: 0 8px 32px rgba(0,0,0,0.1); overflow: hidden; backdrop-filter: blur(8px); }
        .perfil-header-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, var(--accent), var(--accent2)); }
        .perfil-avatar { width: 72px; height: 72px; border-radius: 20px; background: linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%); color: #ffffff; display: flex; align-items: center; justify-content: center; font-family: 'Outfit', sans-serif; font-size: 2rem; font-weight: 800; box-shadow: 0 6px 20px rgba(0,0,0,0.15); flex-shrink: 0; }
        .perfil-header-info { display: flex; flex-direction: column; gap: 6px; }
        .perfil-title { font-family: 'Outfit', sans-serif; font-size: 1.6rem; font-weight: 800; color: var(--text); margin: 0; }
        .perfil-role-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 99px; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.3px; width: fit-content; text-transform: capitalize; }
        .perfil-role-badge[data-role="admin"] { background: rgba(240,136,62,0.15); color: var(--accent); border: 1px solid var(--accent); }
        .perfil-role-badge[data-role="editor"] { background: rgba(88,166,255,0.15); color: var(--accent2); border: 1px solid var(--accent2); }
        .perfil-role-badge[data-role="viewer"] { background: rgba(63,185,80,0.15); color: var(--green); border: 1px solid var(--green); }

        .perfil-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 20px; }
        .perfil-section { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 24px; display: flex; flex-direction: column; gap: 16px; transition: border-color 0.2s, box-shadow 0.2s; }
        .perfil-section:hover { border-color: var(--muted); box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        .perfil-section-title-wrap { display: flex; align-items: center; gap: 10px; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
        .perfil-section-icon { color: var(--accent); display: flex; align-items: center; }
        .perfil-section-title { font-family: 'Outfit', sans-serif; font-size: 1.05rem; font-weight: 700; color: var(--text); margin: 0; }
        .perfil-fields { display: flex; flex-direction: column; gap: 14px; }
        .perfil-field { display: flex; flex-direction: column; gap: 6px; }
        .perfil-label { font-size: 0.75rem; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
        .perfil-value-display { background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; font-size: 0.9rem; color: var(--text); font-weight: 500; display: flex; align-items: center; justify-content: space-between; }
        .perfil-pass-row { display: flex; align-items: center; gap: 10px; background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 8px 12px 8px 14px; }
        .perfil-pass-row .perfil-value-display { background: transparent; border: none; padding: 0; flex: 1; }
        .perfil-actions { display: flex; flex-direction: column; gap: 10px; }
        .perfil-action-btn { width: 100%; justify-content: center; padding: 10px 16px; font-weight: 600; border-radius: 10px; }

        .perfil-themes-container { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-top: 6px; }
        .perfil-theme-box { background: var(--surface2); border: 2px solid var(--border); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 12px; cursor: pointer; transition: all 0.25s cubic-bezier(0.34,1.56,0.64,1); overflow: hidden; position: relative; }
        .perfil-theme-box:hover { border-color: var(--muted); transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.15); }
        .perfil-theme-box.active { border-color: var(--accent); background: var(--surface); box-shadow: 0 6px 24px rgba(0,0,0,0.15); }
        .perfil-theme-preview { height: 72px; border-radius: 10px; padding: 6px; display: flex; flex-direction: column; gap: 6px; border: 1px solid rgba(128,128,128,0.2); overflow: hidden; }
        .perfil-theme-preview-header { height: 16px; border-radius: 6px; display: flex; align-items: center; gap: 6px; padding: 0 8px; }
        .perfil-theme-preview-dot { width: 6px; height: 6px; border-radius: 50%; }
        .perfil-theme-preview-bar { width: 30px; height: 4px; border-radius: 99px; opacity: 0.8; }
        .perfil-theme-preview-body { flex: 1; display: flex; align-items: center; justify-content: center; }
        .perfil-theme-preview-card { width: 100%; height: 32px; border-radius: 6px; padding: 6px; display: flex; flex-direction: column; gap: 4px; border: 1px solid rgba(128,128,128,0.15); }
        .perfil-theme-preview-line { width: 50%; height: 4px; border-radius: 99px; }
        .perfil-theme-preview-subline { width: 80%; height: 3px; border-radius: 99px; background: rgba(128,128,128,0.3); }
        .perfil-theme-details { display: flex; flex-direction: column; gap: 4px; }
        .perfil-theme-header-row { display: flex; align-items: center; gap: 8px; }
        .perfil-theme-emoji { font-size: 1.1rem; }
        .perfil-theme-name { font-family: 'Outfit', sans-serif; font-size: 0.92rem; font-weight: 700; color: var(--text); }
        .perfil-theme-badge { margin-left: auto; font-size: 0.72rem; font-weight: 700; color: var(--accent); background: rgba(128,128,128,0.1); border: 1px solid var(--accent); padding: 2px 8px; border-radius: 99px; display: flex; align-items: center; gap: 4px; }
        .perfil-theme-desc { font-size: 0.76rem; color: var(--muted); margin: 0; line-height: 1.35; }
        .perfil-success { background: rgba(63,185,80,0.15); border: 1px solid rgba(63,185,80,0.4); color: var(--green); padding: 12px 16px; border-radius: 12px; font-size: 0.88rem; font-weight: 600; display: flex; align-items: center; gap: 10px; animation: slideInUp 0.3s cubic-bezier(0.34,1.56,0.64,1); }
        .perfil-loading { text-align: center; padding: 60px; color: var(--muted); font-size: 0.95rem; }

        @media (max-width: 600px) {
          .perfil-page { padding: 16px 12px; }
          .perfil-header-card { padding: 20px; flex-direction: column; text-align: center; align-items: center; }
          .perfil-grid { grid-template-columns: 1fr; }
          .perfil-themes-container { grid-template-columns: 1fr; }
        }

        .admin-panel { flex: 1; padding: var(--space-lg) 28px; overflow: auto; }
        .admin-panel-inner { max-width: 920px; margin: 0 auto; }
        .admin-title { font-family: 'Outfit', sans-serif; font-size: 1.35rem; font-weight: 800; margin-bottom: var(--space-md); color: var(--text); }
        .admin-tabs { display: flex; gap: 4px; background: var(--surface2); padding: 4px; border-radius: 12px; margin-bottom: var(--space-xl); max-width: 320px; }
        .admin-tab { flex: 1; padding: 8px 16px; border: none; background: transparent; border-radius: 99px; font-family: 'Nunito Sans', sans-serif; font-size: 0.85rem; font-weight: 500; color: var(--muted); cursor: pointer; transition: background .15s, color .15s, box-shadow .15s; }
        .admin-tab:hover { color: var(--text); }
        .admin-tab.active { background: var(--surface); color: var(--accent); font-weight: 700; box-shadow: 0 6px 18px rgba(0,0,0,.16); }
        .admin-section { display: flex; flex-direction: column; gap: 0; margin-bottom: var(--space-xl); }
        .admin-section-title { font-family: 'Outfit', sans-serif; font-size: 1rem; font-weight: 700; color: var(--text); margin-bottom: 4px; }
        .admin-lead { font-size: 0.88rem; color: var(--muted); margin-bottom: var(--space-lg); line-height: 1.5; }
        .admin-alert { margin-bottom: var(--space-md); }
        .admin-muted { font-size: 0.85rem; color: var(--muted); }

        .admin-table { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
        .admin-table th { text-align: left; padding: 13px 18px; background: var(--surface2); color: var(--muted); font-weight: 700; font-size: 0.72rem; text-transform: uppercase; letter-spacing: .05em; border-bottom: 1px solid var(--border); }
        .admin-table td { padding: 14px 18px; border-bottom: 1px solid var(--border); vertical-align: middle; }
        .admin-table tr:last-child td { border-bottom: none; }
        .admin-td-user { color: var(--text); font-weight: 500; }
        .admin-you { color: var(--muted); font-weight: 400; }
        .admin-select { max-width: 200px; padding: 8px 10px !important; font-size: 0.82rem !important; cursor: pointer; }
        .admin-add-row { display: flex; gap: 8px; width: 100%; }
        .admin-add-row input { flex: 1; min-width: 0; }
        .admin-add-row button { flex-shrink: 0; }
        .admin-select:disabled { opacity: 0.45; cursor: not-allowed; }
        .admin-td-actions { text-align: right; white-space: nowrap; }
        .admin-table-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; width: 100%; box-shadow: 0 10px 24px rgba(0,0,0,.04); }

        @media (max-width: 600px) {
          .admin-panel { padding: 16px; }
          .admin-title { font-size: 1.1rem; margin-bottom: 12px; }
          .admin-tabs { max-width: 100% !important; width: 100% !important; margin-bottom: 16px; }
          .admin-tab { font-size: 0.75rem; padding: 7px 8px; }
          .admin-lead { font-size: 0.82rem; margin-bottom: 14px; }

          /* Tabela de Usuários — oculta coluna Cadastro, papel vira full-width */
          .admin-table th:nth-child(3),
          .admin-table td:nth-child(3) { display: none; }
          .admin-table th, .admin-table td { padding: 10px 12px; }
          .admin-select { max-width: 100%; width: 100%; }

          .admin-table-wrap { border-radius: 10px; }
          .collab-col-email { display: none; }
        }

        @media (max-width: 400px) {
          .admin-table th, .admin-table td { padding: 8px 10px; font-size: 0.78rem; }
          .admin-td-user { font-size: 0.82rem; }
        }

        .sidebar-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 50; }
        .sidebar { position: fixed; top: 0; left: 0; height: 100vh; width: 260px; background: var(--surface); border-right: 1px solid var(--border); z-index: 51; display: flex; flex-direction: column; transform: translateX(-100%); transition: transform .25s cubic-bezier(.4,0,.2,1); }
        .sidebar.open { transform: translateX(0); }
        .sidebar-header { padding: 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
        .sidebar-logo { font-family: 'Outfit', sans-serif; font-size: 1.2rem; font-weight: 800; color: var(--accent); }
        .sidebar-logo span { color: var(--text); }
        .sidebar-nav { padding: 12px 10px; display: flex; flex-direction: column; gap: 4px; }
        .sidebar-section-label { font-size: 0.68rem; color: var(--muted); text-transform: uppercase; letter-spacing: .6px; padding: 8px 10px 4px; }
        .sidebar-item { display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-radius: 12px; cursor: pointer; font-size: 0.88rem; color: var(--muted); transition: background .15s, color .15s, transform .15s, box-shadow .15s; border: none; background: none; width: 100%; text-align: left; font-family: 'Nunito Sans', sans-serif; }
        .sidebar-item:hover { background: var(--surface2); color: var(--text); transform: translateX(1px); }
        .sidebar-item.active { background: rgba(148,163,184,.18); color: var(--accent); font-weight: 700; box-shadow: inset 3px 0 0 rgba(148,163,184,.9); }
        .sidebar-item.danger { color: var(--red); }
        .sidebar-item.danger:hover { background: rgba(248,81,73,.10); color: var(--red); }
        .sidebar-logout-wrap { padding: 14px; border-top: 1px solid var(--border); }
        .sidebar-footer { padding: 14px; border-top: 1px solid var(--border); font-size: 0.72rem; color: var(--muted); text-align: center; }

.sidebar-bear-wrapper { display: none; }

@media (max-width: 768px) {
  .sidebar {
    height: 100dvh;
    max-height: 100dvh;
  }

  .sidebar-header,
  .sidebar-logout-wrap,
  .sidebar-footer {
    flex-shrink: 0;
  }

  .sidebar-nav {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
  }

  .sidebar-logout-wrap {
    margin-top: auto;
  }

  .sidebar-footer {
    padding-bottom: max(14px, env(safe-area-inset-bottom));
  }
}

@media (min-width: 769px) {
          .sidebar-bear-wrapper {
            display: flex;
            justify-content: center;
            align-items: flex-end;
            margin-top: auto;
            margin-bottom: 5px;
            padding: 0 5px;
            width: 100%;
            pointer-events: none;
            box-sizing: border-box;
          }
          .sidebar-bear-img {
            display: none;
            width: 100%;
            height: auto;
            object-fit: contain;
            transition: opacity 0.25s ease;
          }
          :root[data-theme="dark"] .sidebar-bear-img.bear-escuro,
          :root:not([data-theme]) .sidebar-bear-img.bear-escuro {
            display: block;
          }
          :root[data-theme="white"] .sidebar-bear-img.bear-claro,
          :root[data-theme="creme"] .sidebar-bear-img.bear-claro {
            display: block;
          }
          :root[data-theme="royal"] .sidebar-bear-img.bear-azul {
            display: block;
          }
        }

        .tabs { display: flex; background: var(--surface); border-bottom: 1px solid var(--border); padding: 0 28px; }
        .tab-btn { background: none; border: none; color: var(--muted); padding: 12px 16px; font-family: 'Nunito Sans', sans-serif; font-size: 0.85rem; cursor: pointer; border-bottom: 2px solid transparent; transition: color .15s, border-color .15s; }
        .tab-btn:hover { color: var(--text); }
        .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 500; }

        .btn-primary,
        .btn-outline,
        .btn-save,
        .btn-cancel-lg,
        .btn-confirm,
        .btn-add-tpl,
        .type-toggle,
        .ls-eye-btn,
        .btn-chip,
        .sidebar-item {
          min-height: 40px;
          border-radius: 12px;
          font-family: 'Nunito Sans', sans-serif;
          font-size: 0.85rem;
          font-weight: 600;
          line-height: 1;
          box-sizing: border-box;
          transition: background .18s ease, border-color .18s ease, color .18s ease, transform .18s ease, box-shadow .18s ease, opacity .18s ease;
        }
        .btn-primary,
        .btn-save,
        .btn-confirm,
        .btn-add-tpl {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          background: var(--accent);
          color: var(--btn-text, #000);
          border: none;
          padding: 9px 16px;
          box-shadow: 0 8px 18px rgba(240,136,62,.18);
          cursor: pointer;
        }
        .btn-primary:hover,
        .btn-save:hover:not(:disabled),
        .btn-confirm:hover:not(:disabled),
        .btn-add-tpl:hover {
          opacity: .95;
          transform: translateY(-1px);
          box-shadow: 0 10px 20px rgba(240,136,62,.24);
        }
        .btn-primary:active,
        .btn-save:active,
        .btn-confirm:active,
        .btn-add-tpl:active {
          transform: translateY(0);
        }
        .btn-outline,
        .btn-cancel-lg,
        .type-toggle {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          background: transparent;
          color: var(--text);
          border: 1px solid var(--border);
          padding: 9px 14px;
        }
        .btn-outline,
        .btn-cancel-lg,
        .btn-save,
        .btn-confirm,
        .btn-add-tpl,
        .type-toggle,
        .btn-primary {
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }
        .btn-outline:hover,
        .btn-cancel-lg:hover,
        .type-toggle:hover {
          background: var(--surface2);
          border-color: var(--muted);
          transform: translateY(-1px);
        }
        .btn-outline:active,
        .btn-cancel-lg:active,
        .type-toggle:active {
          transform: translateY(0);
        }
        .btn-primary:focus-visible,
        .btn-outline:focus-visible,
        .btn-save:focus-visible,
        .btn-cancel-lg:focus-visible,
        .btn-confirm:focus-visible,
        .btn-add-tpl:focus-visible,
        .type-toggle:focus-visible,
        .ls-eye-btn:focus-visible,
        .sidebar-item:focus-visible,
        .icon-btn:focus-visible {
          outline: 2px solid rgba(59,130,246,.5);
          outline-offset: 2px;
        }
        .btn-primary:disabled,
        .btn-save:disabled,
        .btn-confirm:disabled,
        .btn-add-tpl:disabled {
          opacity: .45;
          cursor: default;
          transform: none;
          box-shadow: none;
        }
        /* === Login === */
        @keyframes royalDrift {
          0% { transform: translate3d(-3%, -1.5%, 0) scale(1); }
          25% { transform: translate3d(3%, 1.5%, 0) scale(1.03); }
          50% { transform: translate3d(1.5%, 3%, 0) scale(1.015); }
          75% { transform: translate3d(-1.5%, 1.5%, 0) scale(1.035); }
          100% { transform: translate3d(-3%, -1.5%, 0) scale(1); }
        }
        @keyframes royalWave {
          0% { background-position: 0% 0%; }
          25% { background-position: 35% 18%; }
          50% { background-position: 100% 100%; }
          75% { background-position: 62% 78%; }
          100% { background-position: 0% 0%; }
        }
        .ls-shell {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background:
            linear-gradient(180deg, #f8fafc 0%, #f3f7fc 14%, #ecf2f9 24%, #e2eaf5 36%, #d4e1f1 52%, #bfd3ea 64%, #8fb6df 78%, #4f84cf 90%, #1a1a6e 100%);
          background-size: 200% 200%;
          position: relative;
          overflow: hidden;
          padding: 24px;
          animation: royalWave 14s ease-in-out infinite;
        }
        .ls-shell::before {
          content: '';
          position: absolute;
          inset: -18%;
          background:
            radial-gradient(circle at 18% 16%, rgba(255,255,255,0.82) 0%, rgba(255,255,255,0.35) 16%, transparent 42%),
            radial-gradient(circle at 84% 18%, rgba(191,219,254,0.28) 0%, rgba(191,219,254,0.12) 18%, transparent 44%),
            radial-gradient(circle at 52% 80%, rgba(26,26,110,0.18) 0%, rgba(26,26,110,0.08) 16%, transparent 48%);
          pointer-events: none;
          z-index: 0;
          filter: blur(2px);
          opacity: 0.95;
          animation: royalDrift 16s ease-in-out infinite;
        }
        .ls-shell::after {
          content: '';
          position: absolute;
          inset: -10%;
          background:
            linear-gradient(135deg, rgba(248,250,252,0.0) 0%, rgba(248,250,252,0.18) 18%, rgba(248,250,252,0.06) 34%, rgba(255,255,255,0.0) 52%),
            radial-gradient(circle at 14% 12%, rgba(255,255,255,0.4) 0%, transparent 28%),
            radial-gradient(circle at 86% 88%, rgba(255,255,255,0.22) 0%, transparent 30%);
          background-size: 100% 100%, 100% 100%, 100% 100%;
          background-position: 0 0, 0 0, 0 0;
          pointer-events: none;
          z-index: 0;
          opacity: 0.35;
          filter: blur(0.4px);
          animation: royalWave 18s ease-in-out infinite reverse;
        }
        .ls-orb { position: absolute; border-radius: 50%; pointer-events: none; filter: blur(110px); animation: royalDrift 14s ease-in-out infinite; }
        .ls-orb-1 { width: 520px; height: 520px; top: -12%; left: -14%; background: radial-gradient(circle, rgba(168,197,232,0.38) 0%, rgba(168,197,232,0.16) 32%, transparent 72%); }
        .ls-orb-2 { width: 520px; height: 520px; bottom: -14%; right: -12%; background: radial-gradient(circle, rgba(26,26,110,0.30) 0%, rgba(37,99,235,0.12) 30%, transparent 72%); animation-duration: 18s; animation-direction: reverse; }
        .ls-orb-3, .ls-orb-4 { display: block; }
        .ls-orb-3 { width: 280px; height: 280px; top: 20%; right: 12%; background: radial-gradient(circle, rgba(255,255,255,0.75) 0%, rgba(168,197,232,0.16) 34%, transparent 70%); animation-duration: 16s; }
        .ls-orb-4 { width: 220px; height: 220px; bottom: 20%; left: 14%; background: radial-gradient(circle, rgba(37,99,235,0.18) 0%, transparent 72%); animation-duration: 17s; }
        .ls-float-node { position: absolute; z-index: 1; display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 18px; background: rgba(255,255,255,0.48); border: 1px solid rgba(37,99,235,0.18); box-shadow: 0 14px 40px rgba(37,99,235,0.08); backdrop-filter: blur(10px); color: #1a1a6e; animation: royalDrift 12s ease-in-out infinite; }
        .ls-float-node-1 { left: 12%; top: 28%; transform: scale(0.94); }
        .ls-float-node::before { content: ''; position: absolute; inset: -8px -12px -8px -12px; border-radius: 22px; background: radial-gradient(circle, rgba(255,255,255,0.72) 0%, transparent 68%); z-index: -1; filter: blur(12px); opacity: 0.85; }
        .ls-float-icon { width: 28px; height: 28px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; background: linear-gradient(135deg, rgba(37,99,235,0.22), rgba(168,197,232,0.24)); color: #1e3a8a; flex-shrink: 0; }
        .ls-float-text { display: flex; flex-direction: column; line-height: 1.1; }
        .ls-float-text strong { font-family: 'Nunito Sans', sans-serif; font-size: 0.78rem; font-weight: 700; color: #1a1a6e; }
        .ls-float-text small { font-family: 'Nunito Sans', sans-serif; font-size: 0.66rem; color: rgba(26,26,110,0.58); margin-top: 3px; }
        .ls-float-node-2 { left: 80%; top: 28%; transform: scale(0.94); animation-duration: 14s; }
        .ls-float-node-3 { left: 84%; top: 44%; transform: scale(0.82); animation-duration: 15s; animation-direction: reverse; }
        .ls-float-node-4 { left: 8%; top: 44%; transform: scale(0.82); animation-duration: 13s; animation-direction: reverse; }
        .ls-float-node-5 { left: 80%; top: 60%; transform: scale(0.86); animation-duration: 16s; }
        .ls-float-node-6 { left: 12%; top: 60%; transform: scale(0.86); animation-duration: 14s; animation-direction: reverse; }
        .ls-card { position: relative; z-index: 1; width: 100%; max-width: 460px; padding: 40px 38px 36px; border-radius: 24px; border: 1px solid rgba(37,99,235,0.16); background: linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(248,250,252,0.92) 100%); box-shadow: 0 24px 80px rgba(37,99,235,0.12), 0 1px 0 rgba(255,255,255,0.95) inset; backdrop-filter: blur(16px); }
        @media (max-width: 768px) {
          .ls-shell { padding: 16px; }
          .ls-card {
            width: min(100%, 420px);
            max-width: none;
            padding: 30px 20px 24px;
            border-radius: 20px;
          }
          .ls-logo { font-size: 2.15rem; }
          .ls-title { font-size: 1.35rem; }
          .ls-subtitle { font-size: 0.86rem; }
          .ls-tab { padding: 9px 6px; font-size: 0.84rem; }
          .ls-input { font-size: 0.9rem; padding: 12px 12px 12px 40px; }
          .ls-btn { padding: 12px 14px; }
        }
        @media (max-width: 600px) {
          .ls-orb-3, .ls-orb-4,
          .ls-float-node-1, .ls-float-node-2, .ls-float-node-3, .ls-float-node-4, .ls-float-node-5, .ls-float-node-6 {
            display: none;
          }
          .ls-shell {
            padding: 14px;
            align-items: stretch;
          }
          .ls-card {
            width: 100%;
            margin: auto 0;
            padding: 26px 18px 22px;
            border-radius: 18px;
          }
          .ls-brand { margin-bottom: 22px; }
          .ls-logo { font-size: 1.95rem; letter-spacing: -1px; }
          .ls-tagline { font-size: 0.82rem; }
          .ls-title { font-size: 1.22rem; }
          .ls-subtitle { font-size: 0.82rem; margin-bottom: 16px; }
          .ls-tabs { margin-bottom: 18px; }
          .ls-form { gap: 10px; }
          .ls-btn { margin-top: 2px; }
        }
        @media (max-width: 400px) {
          .ls-shell { padding: 10px; }
          .ls-card { padding: 22px 14px 18px; border-radius: 16px; }
          .ls-logo { font-size: 1.72rem; }
          .ls-title { font-size: 1.12rem; }
          .ls-input { font-size: 0.86rem; }
          .ls-tab { font-size: 0.8rem; }
        }
        /* Tablet, celular e telas de toque: versão leve do fundo do login.
           Só a animação de onda do fundo; sem blur pesado (orbs de 110px) e sem vidro fosco,
           que deixavam a tela lenta nesses aparelhos. O visual (degradês azuis) continua. */
        @media (max-width: 1024px), (hover: none) {
          /* Mantém só a "onda" (deslizar do degradê de fundo, barata); o resto fica parado. */
          .ls-shell::before, .ls-orb, .ls-float-node, .ls-submit { animation: none !important; }
          .ls-shell::before, .ls-shell::after { filter: none !important; }
          .ls-float-node, .ls-orb-3, .ls-orb-4 { display: none !important; }
          .ls-orb { filter: none !important; opacity: .7; will-change: auto; }
          .ls-orb-1 { width: 360px; height: 360px; }
          .ls-orb-2 { width: 360px; height: 360px; }
          .ls-card { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; background: rgba(255,255,255,0.97) !important; box-shadow: 0 12px 32px rgba(26,26,110,0.10) !important; }
          .ls-input, .ls-tabs { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .ls-shell, .ls-shell::before, .ls-shell::after, .ls-orb, .ls-float-node, .ls-submit { animation: none !important; }
        }
        .ls-brand { text-align: center; margin-bottom: 26px; }
        .ls-logo { font-family: 'Outfit', sans-serif; font-size: 2.55rem; font-weight: 800; color: #1a1a6e; letter-spacing: -1.4px; line-height: 1; }
        .ls-logo span { color: #2563eb; }
        .ls-tagline { margin-top: 10px; font-size: 0.86rem; color: rgba(26,26,110,0.64); font-family: 'Nunito Sans', sans-serif; line-height: 1.45; }
        .ls-title { font-family: 'Outfit', sans-serif; font-size: 1.55rem; font-weight: 700; color: #1a1a6e; letter-spacing: -0.35px; margin-bottom: 6px; }
        .ls-subtitle { font-size: 0.9rem; color: rgba(26,26,110,0.64); margin-bottom: 18px; font-family: 'Nunito Sans', sans-serif; line-height: 1.45; }
        .ls-tabs { display: flex; background: rgba(37,99,235,0.08); border: 1px solid rgba(37,99,235,0.14); border-radius: 14px; padding: 4px; gap: 4px; margin: 6px 0 22px; }
        .ls-tab { flex: 1; padding: 10px 8px; border: none; background: transparent; border-radius: 10px; font-family: 'Nunito Sans', sans-serif; font-size: 0.875rem; font-weight: 600; color: rgba(26,26,110,0.62); cursor: pointer; transition: color .2s, background .2s, transform .15s, box-shadow .2s; }
        .ls-tab:hover:not(.ls-tab-active) { color: rgba(26,26,110,0.9); background: rgba(37,99,235,0.06); transform: translateY(-1px); }
        .ls-tab-active { background: rgba(255,255,255,0.9); color: #2563eb; font-weight: 700; box-shadow: 0 1px 6px rgba(37,99,235,0.12); transform: translateY(-1px); }
        .ls-form { display: flex; flex-direction: column; gap: 12px; }
        .ls-field-wrap { position: relative; display: flex; align-items: center; }
        .ls-field-icon { position: absolute; left: 13px; color: rgba(37,99,235,0.62); display: flex; align-items: center; pointer-events: none; z-index: 1; }
        .ls-input { width: 100%; padding: 13px 14px 13px 42px; border: 1.5px solid rgba(37,99,235,0.16); border-radius: 12px; font-family: 'Nunito Sans', sans-serif; font-size: 0.92rem; color: #1a1a6e; background: rgba(255,255,255,0.88); outline: none; transition: border-color .2s, box-shadow .2s, background .2s, transform .15s, color .2s; box-sizing: border-box; letter-spacing: 0.01em; }
        .ls-input:hover { background: rgba(255,255,255,0.98); }
        .ls-input:focus { border-color: rgba(37,99,235,0.5); background: rgba(255,255,255,0.98); box-shadow: 0 0 0 3px rgba(37,99,235,0.12); transform: translateY(-1px); color: #1a1a6e; }
        .ls-input::placeholder { color: rgba(26,26,110,0.42); }
        .ls-input:-webkit-autofill,
        .ls-input:-webkit-autofill:hover,
        .ls-input:-webkit-autofill:focus,
        .ls-input:-webkit-autofill:active {
          -webkit-text-fill-color: #1a1a6e;
          -webkit-box-shadow: 0 0 0px 1000px rgba(255,255,255,0.98) inset;
          box-shadow: 0 0 0px 1000px rgba(255,255,255,0.98) inset;
          border-color: rgba(37,99,235,0.18);
          caret-color: #1a1a6e;
          transition: background-color 9999s ease-in-out 0s;
        }
        .ls-eye-btn { position: absolute; right: 10px; background: none; border: none; cursor: pointer; color: rgba(37,99,235,0.48); display: flex; align-items: center; padding: 4px; border-radius: 8px; transition: color .15s, background .15s; }
        .ls-eye-btn:hover { color: rgba(37,99,235,0.9); background: rgba(37,99,235,0.08); }
        .ls-requirements { font-size: 0.74rem; color: rgba(26,26,110,0.64); line-height: 1.45; margin: 2px 0 0; padding-left: 2px; }
        .ls-success { display: flex; align-items: center; gap: 8px; background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.28); color: #0f766e; padding: 10px 13px; border-radius: 14px; font-size: 0.84rem; font-family: 'Nunito Sans', sans-serif; margin-bottom: 4px; }
        .ls-error { color: #b91c1c; font-size: 0.84rem; font-family: 'Nunito Sans', sans-serif; margin: -2px 0 0; line-height: 1.35; }
        .ls-submit { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 13px; background: linear-gradient(90deg, #1e3a8a 0%, #2563eb 55%, #7c3aed 100%); background-size: 200% 100%; background-position: right center; color: #fff; border: 1.5px solid rgba(37,99,235,0.18); border-radius: 12px; font-family: 'Nunito Sans', sans-serif; font-size: 0.92rem; font-weight: 700; cursor: pointer; transition: background-position 0.4s ease, box-shadow 0.25s, transform .15s, border-color .2s; margin-top: 8px; box-shadow: 0 10px 24px rgba(37,99,235,0.18); }
        .ls-submit:hover:not(:disabled) { background-position: left center; transform: translateY(-1px); box-shadow: 0 12px 30px rgba(37,99,235,0.24); border-color: rgba(37,99,235,0.28); }
        .ls-submit:active:not(:disabled) { transform: translateY(0); }
        .ls-submit:disabled { opacity: 0.45; cursor: not-allowed; }

        /* === Board === */
        .board { flex: 1; overflow-x: auto; padding: 24px 28px; display: flex; gap: 18px; align-items: flex-start; }
        .board::-webkit-scrollbar { height: 4px; }
        .board::-webkit-scrollbar-track { background: transparent; }
        .board::-webkit-scrollbar-thumb { background: var(--border); border-radius: 99px; }
        .board::-webkit-scrollbar-thumb:hover { background: var(--muted); }
        @media (max-width: 480px) { .board { scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; padding: 10px; gap: 10px; } .column { scroll-snap-align: center; scroll-snap-stop: always; } }

        .column { min-width: 290px; max-width: 290px; background: var(--surface); border: 2px solid var(--border); border-radius: 14px; display: flex; flex-direction: column; max-height: calc(100vh - 230px); overflow: hidden; transition: border-color .25s, box-shadow .25s, transform .2s; animation: scaleIn .35s cubic-bezier(.4,0,.2,1); position: relative; }
        .column:hover { box-shadow: 0 6px 24px rgba(0,0,0,.15); }
        .column.complete { border-color: var(--green) !important; animation: scaleIn .35s cubic-bezier(.4,0,.2,1), archiveFlash 1.4s ease-in-out infinite; }
        .column.archiving { animation: archiveOut .7s cubic-bezier(.55,.05,.68,.05) forwards !important; pointer-events: none; }
        .complete-overlay { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(circle at 50% 30%, rgba(63,185,80,.18), transparent 60%); animation: fadeIn .4s ease-out; z-index: 1; }
        .complete-overlay::before, .complete-overlay::after { content: '✓'; position: absolute; color: #3fb950; font-size: 1.4rem; font-weight: 800; opacity: 0; }
        .complete-overlay::before { top: 12%; left: 18%; animation: confettiPop 1.4s ease-out infinite; animation-delay: .2s; }
        .complete-overlay::after { top: 8%; right: 16%; animation: confettiPop 1.4s ease-out infinite; animation-delay: .7s; }
        .col-type-stripe { height: 3px; width: 100%; border-radius: 2px; }
        .process-number { font-size: 0.7rem; color: var(--muted); font-weight: 500; letter-spacing: .4px; margin-top: 10px; text-transform: uppercase; }
        .process-setor { font-size: 0.72rem; color: var(--accent2); margin-top: 2px; }
        .column-header { padding: 0 14px 10px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
        .column-title-row { display: flex; align-items: center; gap: 8px; margin: 6px 0 8px; }
        .column-title { font-family: 'Nunito Sans', sans-serif; font-size: 1.18rem; font-weight: 700; flex: 1; cursor: text; line-height: 1.3; letter-spacing: -0.2px; }
        .title-input { flex: 1; background: var(--surface2); border: 1px solid var(--accent2); border-radius: 6px; padding: 4px 8px; color: var(--text); font-family: 'Outfit', sans-serif; font-size: 0.88rem; font-weight: 700; outline: none; }
        .progress-row { display: flex; align-items: center; gap: 8px; }
        .progress-bar { flex: 1; height: 5px; background: var(--border); border-radius: 99px; overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 99px; transition: width .3s; }
        .progress-label { font-size: 0.72rem; color: var(--muted); white-space: nowrap; }
        .complete-badge { margin-top: 6px; font-size: 0.72rem; color: var(--green); font-weight: 700; animation: slideInUp .35s cubic-bezier(.34,1.56,.64,1); }
        .docs-list { padding: 8px; display: flex; flex-direction: column; gap: 5px; overflow-y: auto; overflow-x: hidden; flex: 1; min-height: 0; }
        .docs-list::-webkit-scrollbar { width: 4px; }
        .docs-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 99px; }
        .phase-group { border-radius: 10px; overflow: hidden; border: 1px solid var(--border); flex-shrink: 0; animation: slideInUp .3s cubic-bezier(.4,0,.2,1); }
        .phase-header { display: flex; align-items: center; gap: 7px; padding: 8px 10px; cursor: default; transition: filter .2s; }
        .phase-header:hover { filter: brightness(1.15); }
        .phase-name { flex: 1; font-size: 0.83rem; font-weight: 700; color: #fff; cursor: text; }
        .phase-input { flex: 1; background: transparent; border: none; border-bottom: 1px solid rgba(255,255,255,.4); color: #fff; font-size: 0.83rem; font-weight: 700; outline: none; font-family: 'Nunito Sans', sans-serif; padding: 1px 0; }
        .phase-count { font-size: 0.7rem; color: rgba(255,255,255,.6); white-space: nowrap; }
        .phase-done-badge { font-size: 0.7rem; background: rgba(63,185,80,.3); color: #3fb950; border-radius: 99px; padding: 1px 6px; font-weight: 700; }
        .phase-actions { display: flex; gap: 2px; }
        .phase-docs { padding: 5px; display: flex; flex-direction: column; gap: 4px; background: rgba(0,0,0,.08); }
        .phase-empty { font-size: 0.75rem; color: var(--muted); text-align: center; padding: 8px; }
        .doc-card { display: flex; align-items: center; gap: 8px; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; transition: opacity .25s ease, transform .2s cubic-bezier(.4,0,.2,1), border-color .15s, box-shadow .2s; animation: slideInUp .28s cubic-bezier(.4,0,.2,1); }
        [data-theme="creme"] .doc-card:not(.done),
        [data-theme="white"] .doc-card:not(.done) { background: #ffffff; }
        .doc-card.done { opacity: .55; }
        [data-theme="creme"] .doc-card.done { background: rgb(191, 191, 191); opacity: 0.85; }
        .doc-card:hover { transform: translateX(2px); border-color: var(--accent2); box-shadow: 0 2px 8px rgba(0,0,0,.15); }
        .doc-card:hover .card-actions { opacity: 1; }
        .check-btn { background: none; border: none; cursor: pointer; padding: 0; flex-shrink: 0; }
        .check-box { width: 17px; height: 17px; border-radius: 5px; border: 2px solid var(--border); display: flex; align-items: center; justify-content: center; transition: background .25s cubic-bezier(.4,0,.2,1), border-color .25s, transform .15s; color: #fff; }
        .check-btn:hover .check-box { border-color: var(--green); transform: scale(1.08); }
        .doc-card.done .check-box { background: var(--green); border-color: var(--green); animation: checkPop .35s cubic-bezier(.34,1.56,.64,1), pulseRing .6s ease-out; }
        .doc-card.done .check-box svg { animation: checkPop .35s cubic-bezier(.34,1.56,.64,1) .05s both; }
        .card-name { flex: 1; font-size: 0.79rem; line-height: 1.35; transition: color .2s; }
        .doc-card.done .card-name { text-decoration: line-through; text-decoration-thickness: 1.5px; }
        .card-input { flex: 1; background: transparent; border: none; border-bottom: 1px solid var(--accent2); color: var(--text); font-family: 'Nunito Sans', sans-serif; font-size: 0.79rem; outline: none; padding: 2px 0; }
        .card-actions { display: flex; gap: 2px; opacity: 0; transition: opacity .2s ease; }
        .color-picker { position: absolute; right: 0; top: 22px; z-index: 20; background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 8px; display: flex; flex-wrap: wrap; width: 112px; gap: 6px; box-shadow: 0 4px 16px rgba(0,0,0,.3); animation: scaleIn .18s ease-out; transform-origin: top right; }
        .color-swatch { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--border); cursor: pointer; transition: transform .2s cubic-bezier(.34,1.56,.64,1); }
        .color-swatch:hover { transform: scale(1.25); }
        .color-swatch.active { border-color: var(--accent2); }
        .add-bar { display: flex; border-top: 1px solid var(--border); position: sticky; bottom: 0; background: var(--surface); z-index: 2; flex-shrink: 0; }
        .add-doc-btn,
        .add-phase-btn {
          flex: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          background: transparent;
          border: none;
          color: var(--muted);
          padding: 10px 12px;
          min-height: 42px;
          font-size: 0.8rem;
          cursor: pointer;
          transition: color .2s, background .2s, gap .2s, transform .15s;
          font-family: 'Nunito Sans', sans-serif;
        }
        .add-doc-btn { border-right: 1px solid var(--border); }
        .add-doc-btn:hover { color: var(--accent); background: rgba(240,136,62,.07); gap: 8px; transform: translateY(-1px); }
        .add-phase-btn:hover { color: var(--accent2); background: rgba(88,166,255,.07); gap: 8px; transform: translateY(-1px); }
        .add-doc-form { padding: 8px 10px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 6px; }
        .doc-input { background: var(--surface2); border: 1px solid var(--accent2); border-radius: 8px; padding: 8px 10px; color: var(--text); font-family: 'Nunito Sans', sans-serif; font-size: 0.82rem; outline: none; width: 100%; }
        .process-edit-control { position: relative; width: 100%; }
        .process-edit-control .doc-input { padding-right: 38px; }
        .process-edit-select { appearance: none; -webkit-appearance: none; cursor: pointer; }
        .process-edit-control-icon { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); display: inline-flex; align-items: center; justify-content: center; color: var(--accent2); pointer-events: none; }
        .process-edit-date { cursor: pointer; }
        .process-edit-date::-webkit-calendar-picker-indicator { opacity: 0; cursor: pointer; }
        .form-btns { display: flex; gap: 6px; align-items: center; }
        .btn-confirm { background: var(--accent); color: var(--btn-text, #000); border: none; padding: 9px 16px; border-radius: 12px; font-size: 0.85rem; font-family: 'Nunito Sans', sans-serif; font-weight: 700; cursor: pointer; box-shadow: 0 8px 18px rgba(240,136,62,.16); }
        .btn-cancel { background: none; border: none; color: var(--muted); cursor: pointer; display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 8px 10px; border-radius: 10px; font-family: 'Nunito Sans', sans-serif; transition: background .15s, color .15s, transform .15s; }
        .btn-cancel:hover { background: var(--surface2); color: var(--text); transform: translateY(-1px); }
        .phase-color-row { display: flex; gap: 6px; }
        .phase-color-swatch { width: 20px; height: 20px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; transition: transform .15s; }
        .phase-color-swatch:hover { transform: scale(1.2); }
        .phase-color-swatch.active { border-color: #fff; }
        .icon-btn {
          background: transparent;
          border: 1px solid transparent;
          color: var(--muted);
          cursor: pointer;
          min-width: 38px;
          min-height: 38px;
          padding: 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          transition: color .2s, background .2s, border-color .2s, transform .15s cubic-bezier(.34,1.56,.64,1), box-shadow .2s;
        }
        .icon-btn:hover { color: var(--text); background: var(--surface2); border-color: var(--border); transform: translateY(-1px); box-shadow: 0 4px 10px rgba(0,0,0,.08); }
        .icon-btn:active { transform: translateY(0); box-shadow: none; }
        .icon-btn.danger:hover { color: var(--red); background: rgba(248,81,73,.12); border-color: rgba(248,81,73,.18); }
        .icon-btn.sm { min-width: 32px; min-height: 32px; padding: 6px; border-radius: 10px; }
        .phase-actions .icon-btn { color: #fff; border-color: transparent; }
        .phase-actions .icon-btn:hover {
          color: #172033;
          background: rgba(255,255,255,.94);
          border-color: rgba(255,255,255,.72);
          box-shadow: 0 4px 10px rgba(15,23,42,.18);
        }
        .phase-actions .icon-btn.danger:hover { color: #b42318; background: rgba(255,255,255,.94); border-color: rgba(255,255,255,.72); }
        .empty-board { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; gap: 12px; color: var(--muted); text-align: center; padding: 60px 20px; }
        .empty-board h2 { font-family: 'Outfit', sans-serif; color: var(--text); font-size: 1.2rem; }
        .empty-board p { font-size: 0.88rem; max-width: 340px; line-height: 1.6; }
        .empty-board .empty-action,
        .contratos-empty-state .empty-action,
        .colab-empty .empty-action {
          margin-top: 6px;
        }
        .archive-grid { padding: 24px 28px; display: flex; flex-wrap: wrap; gap: 16px; align-content: flex-start; }

        .inactivity-toast { position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%); background: #1c2330; border: 1px solid #f0883e; border-radius: 14px; padding: 14px 18px; display: flex; align-items: center; gap: 14px; z-index: 9999; min-width: 340px; max-width: 90vw; box-shadow: 0 8px 32px rgba(0,0,0,.5), 0 0 0 4px rgba(240,136,62,0.08); animation: slideInUp .3s cubic-bezier(.34,1.56,.64,1); }
        .inactivity-toast-icon { flex-shrink: 0; display: flex; align-items: center; }
        .inactivity-toast-body { flex: 1; display: flex; flex-direction: column; gap: 2px; }
        .inactivity-toast-title { font-family: 'Outfit', sans-serif; font-size: 0.88rem; font-weight: 700; color: #f0883e; }
        .inactivity-toast-msg { font-size: 0.82rem; color: #8b949e; line-height: 1.4; }
        .inactivity-toast-msg strong { color: #e6edf3; }
        .inactivity-toast-btn { flex-shrink: 0; background: #f0883e; color: #0d1117; border: none; border-radius: 8px; padding: 7px 16px; font-size: 0.82rem; font-weight: 700; cursor: pointer; transition: background .15s; }
        .inactivity-toast-btn:hover { background: #fb923c; }
        @keyframes archiveIn { from { transform: translateY(8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .archived-card { width: 280px; background: var(--surface); border: 2px solid var(--border); border-radius: 14px; overflow: hidden; animation: archiveIn .25s ease-out; transition: transform .2s, box-shadow .2s, border-color .2s; }
        .archived-card:hover { border-color: var(--muted); box-shadow: 0 2px 8px rgba(0,0,0,.2); }

        .dashboard { padding: 24px 28px; max-width: 1280px; width: 100%; min-width: 0; margin: 0 auto; display: flex; flex-direction: column; gap: 24px; box-sizing: border-box; }
        .dash-cards-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; min-width: 0; }
        .dash-count-card { min-width: 0; background: var(--surface); border: 1px solid var(--border); border-left: 4px solid; border-radius: 14px; padding: 24px; display: flex; flex-direction: column; gap: 8px; }
        .dash-count-value { font-family: 'Outfit', sans-serif; font-size: 2.8rem; font-weight: 800; line-height: 1; }
        .dash-count-label { font-size: 0.82rem; color: var(--muted); font-weight: 500; }
        .dash-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr); gap: 24px; align-items: start; min-width: 0; }
        .dash-section { min-width: 0; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 24px; overflow: hidden; }
        .dash-title { font-family: 'Outfit', sans-serif; font-size: 0.95rem; font-weight: 700; margin-bottom: 16px; color: var(--text); }
        .dash-pie-wrap { display: flex; gap: 28px; align-items: center; flex-wrap: wrap; min-width: 0; }
        .dash-pie-chart { width: 180px; height: auto; max-width: 100%; flex: 0 1 180px; align-self: center; }
        .calendar-info-scroll::-webkit-scrollbar { width: 8px; }
        .calendar-info-scroll::-webkit-scrollbar-track { background: transparent; }
        .calendar-info-scroll::-webkit-scrollbar-thumb { background: #30363d; border-radius: 999px; }
        .calendar-info-scroll::-webkit-scrollbar-thumb:hover { background: #3f4b5a; }
        .dash-pie-legend { flex: 1; min-width: 160px; display: flex; flex-direction: column; gap: 8px; }
        .dash-pie-legend-item { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 5px 8px; border-radius: 8px; cursor: default; transition: background .15s; }
        .dash-pie-legend-item.hovered { background: var(--surface2); }
        .dash-pie-legend-name { flex: 1; font-size: 0.82rem; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dash-pie-legend-count { font-family: 'Outfit', sans-serif; font-size: 0.88rem; font-weight: 700; flex-shrink: 0; }
        .dash-process-progress-list { display: flex; flex-direction: column; gap: 16px; }
        .dash-process-progress-item { display: flex; flex-direction: column; gap: 8px; }
        .dash-process-progress-header { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
        .dash-process-progress-name { font-size: 0.85rem; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
        .dash-process-num { font-size: 0.75rem; color: var(--muted); font-weight: 400; }
        .dash-process-progress-meta { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
        .dash-process-progress-pct { font-family: 'Outfit', sans-serif; font-size: 0.88rem; font-weight: 700; flex-shrink: 0; }
        .dash-process-due { font-size: 0.78rem; color: var(--muted); white-space: nowrap; }
        .dash-process-progress-bar { height: 8px; background: var(--surface2); border: 1px solid var(--border); border-radius: 99px; overflow: hidden; }

        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.7); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px; animation: fadeIn .2s ease-out; backdrop-filter: blur(4px); }
        .modal { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; width: 100%; max-width: 720px; display: flex; flex-direction: column; height: 80vh; max-height: 80vh; min-height: 80vh; overflow: hidden; flex-shrink: 0; animation: scaleIn .25s cubic-bezier(.34,1.56,.64,1); box-shadow: 0 20px 60px rgba(0,0,0,.5); }
        .sm-modal { max-width: 420px; height: auto !important; min-height: auto !important; max-height: 90vh !important; }
        .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid var(--border); }
        .modal-header h2 { font-family: 'Outfit', sans-serif; font-size: 1rem; font-weight: 700; }
        .modal-body { display: flex; flex: 1; overflow: hidden; min-height: 0; }
        .modal-body.col { flex-direction: column; padding: 24px; gap: 12px; overflow-y: auto; }
        .modal-footer { display: flex; justify-content: flex-end; gap: 12px; padding: 16px 24px; border-top: 1px solid var(--border); flex-shrink: 0; }
        .tpl-scroll-list::-webkit-scrollbar,
        .tpl-manager-sidebar::-webkit-scrollbar { width: 3px; }
        .tpl-scroll-list::-webkit-scrollbar-track,
        .tpl-manager-sidebar::-webkit-scrollbar-track { background: transparent; }
        .tpl-scroll-list::-webkit-scrollbar-thumb,
        .tpl-manager-sidebar::-webkit-scrollbar-thumb { background: #30363d; border-radius: 99px; }
        .tpl-scroll-list::-webkit-scrollbar-thumb:hover,
        .tpl-manager-sidebar::-webkit-scrollbar-thumb:hover { background: #484f58; }
        .tpl-input { flex: 1; min-width: 0; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; color: var(--text); font-family: 'Nunito Sans', sans-serif; font-size: 0.82rem; outline: none; transition: border-color .15s; }
        .tpl-input:focus { border-color: var(--accent2); }
        .btn-add-tpl { border-radius: 12px; padding: 9px 12px; font-size: 0.95rem; min-width: 40px; min-height: 40px; }
        .type-toggle { display: inline-flex; align-items: center; justify-content: center; gap: 6px; background: transparent; border: 1px solid var(--border); border-radius: 12px; padding: 9px 14px; color: var(--muted); font-size: 0.82rem; font-family: 'Nunito Sans', sans-serif; cursor: pointer; }
        .type-toggle:hover { border-color: var(--muted); color: var(--text); background: var(--surface2); }
        .type-toggle.active { border-color: var(--accent); color: var(--accent); background: rgba(240,136,62,.08); }
        .field-label { font-size: 0.82rem; color: var(--muted); font-weight: 500; }
        .field-label.mt { margin-top: 8px; }
        .optional { font-weight: 400; color: var(--muted); }
        .hint { font-size: 0.78rem; color: var(--muted); margin-top: 2px; }
        .select-field { background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; color: var(--text); font-family: 'Nunito Sans', sans-serif; font-size: 0.85rem; outline: none; width: 100%; }
        .select-field:focus { border-color: var(--accent2); }
        .btn-save { background: var(--accent); color: #000; border: none; padding: 9px 18px; border-radius: 12px; font-family: 'Nunito Sans', sans-serif; font-size: 0.85rem; font-weight: 700; cursor: pointer; transition: opacity .15s; }
        .btn-save:hover:not(:disabled) { opacity: .9; }
        .btn-save:disabled { opacity: .4; cursor: default; }
        .btn-cancel-lg { background: transparent; border: 1px solid var(--border); color: var(--text); padding: 9px 18px; border-radius: 12px; font-family: 'Nunito Sans', sans-serif; font-size: 0.85rem; font-weight: 600; cursor: pointer; }
        .btn-cancel-lg:hover { background: var(--surface2); }

        /* ── Gerenciar Modelos – mobile ── */
        .tpl-mobile-back { display: none; }
        @media (max-width: 600px) {
          .tpl-manager-overlay { padding: 8px !important; align-items: flex-end !important; }
          .tpl-manager-box { height: 93vh !important; border-radius: 14px 14px 10px 10px !important; }
          .tpl-manager-body { overflow: hidden !important; }
          .tpl-manager-body[data-view="types"] .tpl-manager-content { display: none !important; }
          .tpl-manager-body[data-view="docs"] .tpl-manager-sidebar { display: none !important; }
          .tpl-manager-sidebar { width: 100% !important; min-width: 0 !important; border-right: none !important; }
          .tpl-manager-content { width: 100% !important; }
          .tpl-mobile-back { display: flex; align-items: center; gap: 6px; padding: 10px 14px; border-bottom: 1px solid #30363d; background: transparent; border-top: none; border-left: none; border-right: none; color: #f0883e; font-family: 'Nunito Sans', sans-serif; font-size: 0.88rem; font-weight: 500; cursor: pointer; flex-shrink: 0; width: 100%; text-align: left; }
          .tpl-mobile-back:hover { background: #1c2330; }
        }

        /* ── Contratos Ativos ── */
        .contratos-page { padding: 24px 28px; max-width: 1100px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
        .contratos-config { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 18px 20px; }
        .fonte-tabs { display: flex; gap: 8px; background: var(--surface2); padding: 4px; border-radius: 12px; margin-bottom: 14px; }
        .fonte-tab { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; background: transparent; border: none; color: var(--muted); padding: 10px 14px; border-radius: 9px; cursor: pointer; font-family: 'Nunito Sans', sans-serif; font-size: 0.85rem; font-weight: 500; transition: background .2s, color .2s, transform .15s; }
        .fonte-tab:hover { color: var(--text); }
        .fonte-tab.active { background: var(--surface); color: var(--accent); box-shadow: 0 2px 8px rgba(0,0,0,.25); }
        .fonte-tab.active:hover { transform: translateY(-1px); }
        .fonte-badge { font-size: 0.65rem; font-weight: 600; padding: 2px 8px; border-radius: 99px; background: rgba(255,255,255,.08); color: var(--muted); text-transform: uppercase; letter-spacing: .4px; }
        .fonte-tab.active .fonte-badge { background: rgba(240,136,62,.15); color: var(--accent); }
        .fonte-panel { display: flex; flex-direction: column; gap: 4px; animation: slideInUp .25s ease-out; }
        .contratos-config-label { font-size: 0.75rem; color: var(--muted); font-weight: 500; }
        .csv-input { flex: 1; min-width: 200px; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; color: var(--text); font-family: 'Nunito Sans', sans-serif; font-size: 0.82rem; outline: none; transition: border-color .15s; }
        .csv-input:focus { border-color: var(--accent2); }
        .upload-zone { border: 2px dashed var(--border); border-radius: 12px; padding: 28px 20px; cursor: pointer; text-align: center; transition: border-color .2s, background .2s; }
        .upload-zone:hover, .upload-zone.drag-over { border-color: var(--accent2); background: rgba(88,166,255,.05); }
        .contratos-resumo { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; }
        .resumo-card { background: var(--surface); border: 1px solid var(--border); border-left: 4px solid; border-radius: 12px; padding: 14px 16px; transition: background .15s; }
        .resumo-card:hover { background: var(--surface2); }
        .resumo-val { font-family: 'Outfit', sans-serif; font-size: 1.8rem; font-weight: 800; line-height: 1; margin-bottom: 4px; }
        .resumo-label { font-size: 0.75rem; color: var(--muted); }
        .contratos-filters { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
        .contratos-search { flex: 1; min-width: 200px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 9px 14px; color: var(--text); font-family: 'Nunito Sans', sans-serif; font-size: 0.85rem; outline: none; transition: border-color .15s; }
        .contratos-search:focus { border-color: var(--accent2); }
        .filter-btns { display: flex; gap: 6px; flex-wrap: wrap; }
        .filter-btn { background: transparent; border: 1px solid var(--border); color: var(--muted); padding: 6px 14px; border-radius: 99px; font-family: 'Nunito Sans', sans-serif; font-size: 0.78rem; cursor: pointer; transition: all .15s; }
        .filter-btn:hover { border-color: var(--muted); color: var(--text); }
        .filter-btn.active { border-color: var(--accent); color: var(--accent); background: rgba(240,136,62,.1); }
        .contratos-loading { text-align: center; color: var(--muted); padding: 40px; font-size: 0.88rem; }
        .contratos-empty { text-align: center; color: var(--muted); padding: 30px; font-size: 0.85rem; }
        .contratos-empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; gap: 10px; color: var(--muted); text-align: center; padding: 60px 20px; }
        .contratos-empty-state h3 { font-family: 'Outfit', sans-serif; color: var(--text); font-size: 1.1rem; }
        .contratos-empty-state p { font-size: 0.85rem; max-width: 360px; line-height: 1.6; }
        .cc2-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
        /* ── Card de contrato (simplificado) ── */
        .cc2-card { display: flex; background: var(--surface); border: 1px solid var(--border); border-radius: 13px; overflow: hidden; transition: border-color .2s, box-shadow .2s, transform .15s; }
        .cc2-card:hover { border-color: var(--sc, var(--border)); box-shadow: 0 4px 24px rgba(0,0,0,.3); transform: translateY(-2px); }
        .cc2-stripe { width: 5px; flex-shrink: 0; }
        .cc2-body { flex: 1; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
        .cc2-contratada { font-size: 0.88rem; font-weight: 700; color: var(--text); line-height: 1.35; }
        .cc2-badges-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .cc2-lei { font-size: 0.62rem; padding: 2px 8px; border-radius: 99px; font-weight: 600; border: 1px solid; white-space: nowrap; }
        .cc2-modalidade { font-size: 0.62rem; padding: 2px 8px; border-radius: 99px; font-weight: 600; border: 1px solid var(--border); color: var(--muted); white-space: nowrap; }
        .cc2-venc-row { display: flex; align-items: center; gap: 8px; padding-top: 8px; border-top: 1px solid var(--border); flex-wrap: wrap; }
        .cc2-bottom-label { font-size: 0.62rem; text-transform: uppercase; letter-spacing: .5px; color: var(--muted); flex-shrink: 0; }
        .cc2-venc-val { font-family: 'Outfit', sans-serif; font-size: 0.9rem; font-weight: 700; }
        .cc2-venc-badge { font-size: 0.62rem; padding: 2px 8px; border-radius: 99px; font-weight: 600; border: 1px solid; white-space: nowrap; margin-left: auto; }
        /* Modal hero */
        .cc2-estado { font-size: 0.62rem; padding: 2px 8px; border-radius: 99px; font-weight: 700; border: 1px solid; white-space: nowrap; }
        .cdm-hero-contratada { font-family: 'Outfit', sans-serif; font-size: 1rem; font-weight: 700; color: var(--text); line-height: 1.4; padding-right: 32px; margin-bottom: 4px; }
        .cdm-hero-num { font-size: 0.78rem; font-weight: 600; color: var(--muted); letter-spacing: .5px; }
        .cdm-objeto-text { font-size: 0.88rem; color: var(--text); line-height: 1.5; }
        .cdm-field-full { grid-column: 1 / -1; }
        @media (max-width: 768px) { .contratos-page { padding: 16px; } .contratos-resumo { grid-template-columns: repeat(2, 1fr); } .cc2-grid { grid-template-columns: 1fr; } }
        @media (max-width: 480px) { .contratos-page { padding: 10px; } .contratos-resumo { grid-template-columns: repeat(2, 1fr); gap: 8px; } .resumo-val { font-size: 1.4rem; } }

        /* ── Modal Contrato ── */
        .cdm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.75); display: flex; align-items: center; justify-content: center; z-index: 200; padding: 20px; backdrop-filter: blur(4px); }
        .cdm-box { background: var(--surface); border: 1px solid var(--border); border-radius: 18px; width: 100%; max-width: 560px; max-height: 88vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 24px 80px rgba(0,0,0,.6); animation: cdm-in .18s cubic-bezier(.4,0,.2,1); }
        @keyframes cdm-in { from { opacity:0; transform: translateY(16px) scale(.97); } to { opacity:1; transform: none; } }
        .cdm-hero { padding: 22px 24px 18px; position: relative; flex-shrink: 0; }
        .cdm-hero-badges { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
        .cdm-hero-num { font-size: 0.75rem; font-weight: 600; color: var(--muted); letter-spacing: .4px; margin-top: 2px; }
        .cdm-close { position: absolute; top: 18px; right: 18px; background: var(--surface2); border: 1px solid var(--border); color: var(--muted); border-radius: 8px; padding: 5px; cursor: pointer; display: flex; align-items: center; transition: color .15s, background .15s; }
        .cdm-close:hover { color: var(--text); background: var(--border); }
        .cdm-body { flex: 1; overflow-y: auto; padding: 4px 0; }
        .cdm-body::-webkit-scrollbar { width: 4px; }
        .cdm-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 99px; }
        .cdm-section { padding: 16px 24px; border-bottom: 1px solid var(--border); }
        .cdm-section:last-child { border-bottom: none; }
        .cdm-section-title { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; letter-spacing: .7px; color: var(--muted); margin-bottom: 14px; }
        .cdm-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 20px; }
        .cdm-field { display: flex; flex-direction: column; gap: 3px; }
        .cdm-label { font-size: 0.6rem; text-transform: uppercase; letter-spacing: .5px; color: var(--muted); }
        .cdm-value { font-size: 0.85rem; color: var(--text); line-height: 1.4; font-weight: 500; }
        .cdm-footer { padding: 14px 24px; border-top: 1px solid var(--border); display: flex; justify-content: flex-end; flex-shrink: 0; }
        @media (max-width: 480px) { .cdm-overlay { padding: 0; align-items: flex-end; } .cdm-box { border-radius: 18px 18px 0 0; max-height: 92vh; } .cdm-grid { grid-template-columns: 1fr; } }

        /* ── Contratos Ativos — cadastro manual ── */
        .contracts-page { flex: 1; min-width: 0; overflow-y: auto; padding: 28px; }
        .contracts-inner { width: 100%; max-width: 1240px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
        .contracts-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; }
        .contracts-eyebrow, .contract-form-eyebrow { display: block; margin-bottom: 5px; color: var(--accent); font-size: .68rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
        .contracts-header h1 { color: var(--text); font-family: 'Outfit', sans-serif; font-size: clamp(1.55rem, 3vw, 2rem); line-height: 1.1; }
        .contracts-header p { max-width: 620px; margin-top: 7px; color: var(--muted); font-size: .86rem; line-height: 1.55; }
        .contracts-add-button { flex-shrink: 0; min-height: 40px; }
        .contracts-message { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text); font-size: .82rem; }
        .contracts-message-error { border-color: color-mix(in srgb, var(--red) 38%, var(--border)); background: color-mix(in srgb, var(--red) 7%, var(--surface)); }

        .contracts-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
        .contracts-summary button { --summary-color: var(--accent2); position: relative; min-width: 0; padding: 15px 16px 14px; overflow: hidden; text-align: left; font-family: 'Nunito Sans', sans-serif; color: var(--text); background: color-mix(in srgb, var(--surface) 94%, transparent); border: 1px solid var(--border); border-radius: 13px; cursor: pointer; transition: transform .16s, border-color .16s, box-shadow .16s; }
        .contracts-summary button::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 3px; background: var(--summary-color); }
        .contracts-summary button:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--summary-color) 45%, var(--border)); box-shadow: 0 8px 24px rgba(0,0,0,.1); }
        .contracts-summary button.active { border-color: color-mix(in srgb, var(--summary-color) 65%, var(--border)); background: color-mix(in srgb, var(--summary-color) 8%, var(--surface)); box-shadow: 0 0 0 2px color-mix(in srgb, var(--summary-color) 10%, transparent); }
        .contracts-summary .summary-regular { --summary-color: var(--green); }
        .contracts-summary .summary-attention { --summary-color: #eab308; }
        .contracts-summary .summary-expired { --summary-color: var(--red); }
        .contracts-summary button > span { display: block; color: var(--muted); font-size: .7rem; font-weight: 700; letter-spacing: .035em; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .contracts-summary button > strong { display: block; margin: 4px 0 1px; color: var(--text); font-family: 'Outfit', sans-serif; font-size: 1.7rem; line-height: 1; }
        .contracts-summary button > small { color: var(--muted); font-size: .69rem; }

        .contracts-toolbar { display: grid; grid-template-columns: minmax(260px, 1fr) minmax(210px, 280px); gap: 10px; }
        .contracts-search-wrap { position: relative; display: flex; align-items: center; min-width: 0; }
        .contracts-search-wrap svg { position: absolute; left: 13px; color: var(--muted); pointer-events: none; }
        .contracts-search-wrap input, .contracts-toolbar select { width: 100%; min-width: 0; height: 42px; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: 11px; outline: none; font-family: 'Nunito Sans', sans-serif; font-size: .82rem; transition: border-color .15s, box-shadow .15s; }
        .contracts-search-wrap input { padding: 0 14px 0 40px; }
        .contracts-toolbar select { padding: 0 36px 0 13px; }
        .contracts-search-wrap input:focus, .contracts-toolbar select:focus { border-color: var(--accent2); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent2) 12%, transparent); }

        .contracts-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: start; }
        .contract-card { --contract-state: var(--accent2); position: relative; min-width: 0; overflow: hidden; background: color-mix(in srgb, var(--surface) 96%, transparent); border: 1px solid var(--border); border-top: 3px solid var(--contract-state); border-radius: 16px; box-shadow: 0 8px 28px rgba(0,0,0,.08); transition: transform .18s, border-color .18s, box-shadow .18s; }
        .contract-card:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--contract-state) 42%, var(--border)); box-shadow: 0 13px 32px rgba(0,0,0,.13); }
        .contract-card-regular { --contract-state: var(--green); }
        .contract-card-soon { --contract-state: #eab308; }
        .contract-card-urgent, .contract-card-expired { --contract-state: var(--red); }
        .contract-card-no-date { --contract-state: var(--muted); }
        .contract-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 14px 16px 0; }
        .contract-card-badges { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
        .contract-status-badge, .contract-law-badge { display: inline-flex; align-items: center; min-height: 23px; padding: 3px 9px; border: 1px solid; border-radius: 999px; font-size: .65rem; font-weight: 700; line-height: 1; white-space: nowrap; }
        .contract-status-badge { color: var(--contract-state); border-color: color-mix(in srgb, var(--contract-state) 38%, transparent); background: color-mix(in srgb, var(--contract-state) 10%, var(--surface)); }
        .contract-law-badge { color: var(--accent2); border-color: color-mix(in srgb, var(--accent2) 32%, transparent); background: color-mix(in srgb, var(--accent2) 8%, var(--surface)); }
        .contract-law-old { color: #7c6f43; border-color: rgba(183,156,71,.35); background: rgba(183,156,71,.1); }
        [data-theme="dark"] .contract-law-old, [data-theme="royal"] .contract-law-old { color: #f1c75b; }
        .contract-card-actions { display: flex; align-items: center; gap: 3px; flex-shrink: 0; }
        .contract-card-title-wrap { padding: 14px 16px 16px; }
        .contract-card-kicker { margin-bottom: 3px; color: var(--muted); font-size: .62rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
        .contract-card-title { color: var(--text); font-family: 'Outfit', sans-serif; font-size: 1.04rem; line-height: 1.32; overflow-wrap: anywhere; }
        .contract-card-object { display: -webkit-box; margin-top: 8px; overflow: hidden; color: var(--muted); font-size: .79rem; line-height: 1.48; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
        .contract-info-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
        .contract-info-item { min-width: 0; padding: 13px 16px; }
        .contract-info-item:nth-child(odd) { border-right: 1px solid var(--border); }
        .contract-info-item:nth-child(-n+2) { border-bottom: 1px solid var(--border); }
        .contract-info-item span, .contract-inspection-grid span { display: block; margin-bottom: 4px; color: var(--muted); font-size: .61rem; font-weight: 700; letter-spacing: .055em; text-transform: uppercase; }
        .contract-info-item strong { display: block; overflow: hidden; color: var(--text); font-size: .82rem; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
        .contract-value-item strong { color: var(--accent); font-family: 'Outfit', sans-serif; font-size: .92rem; }
        .contract-inspection { padding: 14px 16px 16px; }
        .contract-inspection-title { display: flex; align-items: center; gap: 6px; margin-bottom: 11px; color: var(--muted); font-size: .68rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
        .contract-inspection-title svg { width: 14px; height: 14px; color: var(--accent2); }
        .contract-inspection-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
        .contract-inspection-grid > div { min-width: 0; }
        .contract-inspection-grid strong { display: block; color: var(--text); font-size: .77rem; font-weight: 600; line-height: 1.4; overflow-wrap: anywhere; }

        .contracts-state { display: flex; min-height: 280px; padding: 44px 20px; flex-direction: column; align-items: center; justify-content: center; gap: 9px; text-align: center; color: var(--muted); background: color-mix(in srgb, var(--surface) 88%, transparent); border: 1px dashed var(--border); border-radius: 16px; }
        .contracts-state-icon { display: grid; width: 48px; height: 48px; margin-bottom: 3px; place-items: center; color: var(--accent2); background: color-mix(in srgb, var(--accent2) 10%, var(--surface)); border-radius: 14px; }
        .contracts-state-icon svg { width: 22px; height: 22px; }
        .contracts-state h2 { color: var(--text); font-family: 'Outfit', sans-serif; font-size: 1rem; }
        .contracts-state p { max-width: 420px; margin-bottom: 7px; font-size: .8rem; line-height: 1.5; }
        .contracts-spinner { width: 28px; height: 28px; margin-bottom: 4px; border: 3px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: contracts-spin .75s linear infinite; }
        @keyframes contracts-spin { to { transform: rotate(360deg); } }

        .contract-modal-overlay { position: fixed; inset: 0; z-index: 220; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgba(6,10,18,.72); backdrop-filter: blur(5px); }
        .contract-form-modal { display: flex; width: min(760px, 100%); max-height: min(90vh, 860px); flex-direction: column; overflow: hidden; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: 18px; box-shadow: 0 28px 90px rgba(0,0,0,.4); animation: cdm-in .18s cubic-bezier(.4,0,.2,1); }
        .contract-form-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; padding: 20px 22px; border-bottom: 1px solid var(--border); }
        .contract-form-header h2 { font-family: 'Outfit', sans-serif; font-size: 1.25rem; }
        .contract-form-header p { margin-top: 4px; color: var(--muted); font-size: .78rem; }
        .contract-form { display: flex; min-height: 0; flex: 1; flex-direction: column; }
        .contract-form-body { min-height: 0; padding: 20px 22px 24px; overflow-y: auto; }
        .contract-form-error { margin-bottom: 16px; padding: 10px 12px; color: var(--red); background: color-mix(in srgb, var(--red) 8%, var(--surface)); border: 1px solid color-mix(in srgb, var(--red) 30%, var(--border)); border-radius: 10px; font-size: .78rem; }
        .contract-form-section + .contract-form-section { margin-top: 24px; padding-top: 22px; border-top: 1px solid var(--border); }
        .contract-form-section-title { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 14px; }
        .contract-form-section-title > svg { width: 17px; height: 17px; margin-top: 1px; color: var(--accent2); flex-shrink: 0; }
        .contract-form-section-title strong { display: block; color: var(--text); font-size: .8rem; }
        .contract-form-section-title span { display: block; margin-top: 2px; color: var(--muted); font-size: .68rem; }
        .contract-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
        .contract-field { display: flex; min-width: 0; flex-direction: column; gap: 6px; color: var(--muted); font-size: .7rem; font-weight: 700; }
        .contract-field-wide { grid-column: 1 / -1; }
        .contract-field input, .contract-field textarea, .contract-field select { width: 100%; min-width: 0; padding: 10px 11px; resize: vertical; color: var(--text); background: var(--surface2); border: 1px solid var(--border); border-radius: 9px; outline: none; font: 500 .82rem/1.4 'Nunito Sans', sans-serif; transition: border-color .15s, box-shadow .15s; }
        .contract-field input, .contract-field select { height: 41px; }
        .contract-field input:focus, .contract-field textarea:focus, .contract-field select:focus { border-color: var(--accent2); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent2) 11%, transparent); }
        .contract-money-field { position: relative; }
        .contract-money-field > span { position: absolute; top: 50%; left: 11px; z-index: 1; transform: translateY(-50%); color: var(--muted); font-size: .76rem; }
        .contract-money-field input { padding-left: 35px; }
        .contract-form-footer { display: flex; align-items: center; justify-content: flex-end; gap: 9px; padding: 14px 22px; background: color-mix(in srgb, var(--surface2) 55%, var(--surface)); border-top: 1px solid var(--border); }
        .contract-delete-modal { width: min(430px, 100%); padding: 26px; color: var(--text); text-align: center; background: var(--surface); border: 1px solid var(--border); border-radius: 18px; box-shadow: 0 28px 90px rgba(0,0,0,.45); animation: cdm-in .18s cubic-bezier(.4,0,.2,1); }
        .contract-delete-icon { display: grid; width: 48px; height: 48px; margin: 0 auto 14px; place-items: center; color: var(--red); background: color-mix(in srgb, var(--red) 10%, var(--surface)); border-radius: 14px; }
        .contract-delete-icon svg { width: 20px; height: 20px; }
        .contract-delete-modal h2 { font-family: 'Outfit', sans-serif; font-size: 1.12rem; }
        .contract-delete-modal p { margin-top: 8px; color: var(--muted); font-size: .8rem; line-height: 1.55; }
        .contract-delete-modal p strong { color: var(--text); }
        .contract-delete-actions { display: flex; justify-content: center; gap: 9px; margin-top: 20px; }
        .btn-danger { display: inline-flex; align-items: center; justify-content: center; min-height: 38px; padding: 9px 16px; color: #fff; background: var(--red); border: 1px solid var(--red); border-radius: 10px; font-family: 'Nunito Sans', sans-serif; font-size: .82rem; font-weight: 700; cursor: pointer; transition: filter .15s, transform .15s; }
        .btn-danger:hover { filter: brightness(.92); transform: translateY(-1px); }
        .btn-danger:disabled { opacity: .55; cursor: not-allowed; transform: none; }

        @media (max-width: 900px) {
          .contracts-page { padding: 20px; }
          .contracts-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .contracts-grid { grid-template-columns: minmax(0, 1fr); }
        }
        @media (max-width: 600px) {
          .contracts-page { padding: 14px 12px 24px; }
          .contracts-inner { gap: 14px; }
          .contracts-header { align-items: stretch; flex-direction: column; gap: 12px; }
          .contracts-add-button { width: 100%; justify-content: center; }
          .contracts-summary { gap: 8px; }
          .contracts-summary button { padding: 12px 12px 11px; }
          .contracts-summary button > span { font-size: .62rem; }
          .contracts-summary button > strong { font-size: 1.42rem; }
          .contracts-summary button > small { display: none; }
          .contracts-toolbar { grid-template-columns: minmax(0, 1fr); }
          .contract-card { border-radius: 13px; }
          .contract-card-top, .contract-card-title-wrap, .contract-inspection { padding-left: 13px; padding-right: 13px; }
          .contract-info-item { padding: 12px 13px; }
          .contract-modal-overlay { align-items: flex-end; padding: 0; }
          .contract-form-modal { width: 100%; max-height: 94dvh; border-radius: 18px 18px 0 0; }
          .contract-form-header { padding: 17px 16px; }
          .contract-form-body { padding: 17px 16px 22px; }
          .contract-form-grid { grid-template-columns: minmax(0, 1fr); gap: 12px; }
          .contract-field-wide { grid-column: auto; }
          .contract-form-footer { padding: 12px 16px max(12px, env(safe-area-inset-bottom)); }
          .contract-form-footer > button { flex: 1; }
          .contract-delete-modal { width: 100%; padding: 24px 18px max(24px, env(safe-area-inset-bottom)); border-radius: 18px 18px 0 0; }
        }
        @media (max-width: 390px) {
          .contract-card-top { flex-direction: column; }
          .contract-card-actions { align-self: flex-end; margin-top: -34px; }
          .contract-info-grid, .contract-inspection-grid { grid-template-columns: minmax(0, 1fr); }
          .contract-info-item:nth-child(odd) { border-right: 0; }
          .contract-info-item:nth-child(-n+3) { border-bottom: 1px solid var(--border); }
          .contract-inspection-grid { gap: 12px; }
        }

        @media (hover: none) { .card-actions { opacity: 1; } }

        /* ── Colaboradores ── */
        .colab-page { flex: 1; padding: 24px 28px; overflow: auto; }
        .colab-inner { max-width: 860px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
        .colab-header-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
        .colab-search-wrap { position: relative; display: flex; align-items: center; }
        .colab-search-icon { position: absolute; left: 12px; color: var(--muted); pointer-events: none; }
        .colab-search { width: 100%; padding: 10px 14px 10px 38px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; color: var(--text); font-family: 'Nunito Sans', sans-serif; font-size: 0.85rem; outline: none; transition: border-color .15s; }
        .colab-search:focus { border-color: var(--accent2); }
        .colab-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 60px 20px; color: var(--muted); text-align: center; }
        .colab-empty p { font-size: 0.88rem; }
        .colab-cell { display: flex; align-items: center; gap: 6px; }
        .colab-copy-btn { opacity: 0; transition: opacity .15s, color .15s, transform .15s cubic-bezier(.34,1.56,.64,1) !important; flex-shrink: 0; }
        .colab-copy-done { color: var(--green) !important; opacity: 1 !important; }
        tr:hover .colab-copy-btn { opacity: 1; }
        @media (hover: none) { .colab-copy-btn { opacity: 1; } }
        @media (max-width: 600px) {
          .colab-page { padding: 16px; }
          .colab-header-row { flex-direction: column; gap: 10px; }
          .colab-header-row .btn-primary { align-self: flex-start; }
        }

        /* ── Tablet ── */
        @media (max-width: 768px) {
          .header { padding: 12px 16px; gap: 10px; } .header-stats { display: none; }
          .tabs { padding: 0 16px; overflow-x: auto; } .tabs::-webkit-scrollbar { display: none; } .tab-btn { padding: 12px 12px; font-size: 0.8rem; white-space: nowrap; }
          .board { padding: 16px; gap: 14px; } .column { min-width: 270px; max-width: 270px; max-height: calc(100vh - 200px); }
          .archive-grid { padding: 16px; gap: 12px; } .archived-card { width: 100%; max-width: 320px; }
          .dashboard { padding: 16px; gap: 16px; overflow-x: hidden; }
          .dash-cards-row { gap: 12px; }
          .dash-grid { grid-template-columns: minmax(0, 1fr); gap: 16px; }
          .dash-section { padding: 16px 18px; }
          .modal { height: 90vh; max-height: 90vh; min-height: 90vh; } .sm-modal { max-height: 95vh !important; }
        }

        /* ── Mobile ── */
        @media (max-width: 480px) {
          .header { padding: 10px 12px; gap: 8px; } .logo { font-size: 1.1rem; } .header-actions { gap: 6px; }
          .btn-label { display: none; } .btn-outline { padding: 7px 10px; } .btn-primary { padding: 7px 10px; }
          .tabs { padding: 0 12px; } .tab-btn { padding: 11px 10px; font-size: 0.78rem; }
          .board { padding: 10px; gap: 10px; } .column { min-width: calc(100vw - 20px); max-width: calc(100vw - 20px); max-height: none; }
          .archive-grid { padding: 10px; } .archived-card { width: 100%; max-width: 100%; }
          .dashboard { max-width: 100vw; padding: 10px max(10px, env(safe-area-inset-right)) 20px max(10px, env(safe-area-inset-left)); gap: 12px; overflow-x: hidden; }
          .dash-cards-row { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
          .dash-grid { grid-template-columns: minmax(0, 1fr); gap: 12px; }
          .dash-count-value { font-size: 1.65rem; }
          .dash-count-card { padding: 12px; border-left-width: 3px; border-radius: 12px; gap: 4px; }
          .dash-count-label { font-size: 0.72rem; line-height: 1.25; }
          .dash-section { width: 100%; min-width: 0; padding: 12px; border-radius: 12px; }
          .dash-title { font-size: 0.84rem; line-height: 1.3; margin-bottom: 12px; }
          .dash-pie-wrap { flex-direction: column; align-items: center; gap: 12px; }
          .dash-pie-chart { width: 156px; flex-basis: 156px; }
          .dash-pie-legend { width: 100%; min-width: 0; gap: 4px; }
          .dash-pie-legend-item { padding: 4px 6px; }
          .dash-pie-legend-name { font-size: 0.78rem; }
          .dash-process-progress-list { gap: 10px; }
          .dash-process-progress-item { gap: 5px; }
          .dash-process-progress-header { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 8px; }
          .dash-process-progress-name { font-size: 0.8rem; line-height: 1.3; white-space: normal; overflow: visible; text-overflow: clip; }
          .dash-process-progress-meta { gap: 6px; align-items: baseline; }
          .dash-process-progress-pct { font-size: 0.8rem; }
          .dash-process-due { font-size: 0.7rem; }
          .dash-process-progress-bar { height: 7px; }
          .setor-col-count, .setor-col-bar { display: none; } .card-actions { opacity: 1; }
          .add-doc-btn, .add-phase-btn { padding: 13px 10px; font-size: 0.82rem; }
          .check-box { width: 20px; height: 20px; } .card-name { font-size: 0.82rem; } .docs-list { max-height: 60vh; }
          .modal-overlay { padding: 0; align-items: flex-end; }
          .modal { border-radius: 16px 16px 0 0; height: 92vh; max-height: 92vh; min-height: 50vh; }
          .sm-modal { border-radius: 16px 16px 0 0; max-height: 92vh !important; height: auto !important; min-height: auto !important; }
          .modal-body { flex-direction: column; }
        }
      `}</style>

      {sessionUser === undefined ? (
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--muted)" }}>Carregando sessão...</div>
      ) : !sessionUser ? (
        <Login notice={logoutNotice} noticeOk={logoutNoticeOk} onLogin={(data) => { setLogoutNotice(""); openStartPage(data); setSessionUser(data); }} />
      ) : activeSection === "dashboard" ? (
        <DashboardPage columns={columns} archived={archived} sortedColumns={sortedColumns} user={sessionUser} loading={processLoading} error={processError} onLogout={handleLogout} onNavigate={(section, tab = "board") => { setActiveSection(section); setActiveTab(tab); }} />
      ) : activeSection === "processos" ? (
        <div className="lk-dashboard lk-process-shell">
          {sidebarOpen && <button className="lk-backdrop" aria-label="Fechar navegação" onClick={() => setSidebarOpen(false)} />}
          <AppSidebar user={sessionUser} activeSection="processos" menuOpen={sidebarOpen} onLogout={handleLogout} onNavigate={section => { setActiveSection(section); setSidebarOpen(false); }} />
          <main className="lk-process-main">{processPage}</main>
        </div>
      ) : activeSection === "admin" && sessionUser?.role === "admin" ? (
        <div className="lk-dashboard lk-process-shell">
          {sidebarOpen && <button className="lk-backdrop" aria-label="Fechar navegação" onClick={() => setSidebarOpen(false)} />}
          <AppSidebar user={sessionUser} activeSection="admin" menuOpen={sidebarOpen} onLogout={handleLogout} onNavigate={section => { setActiveSection(section); setSidebarOpen(false); }} />
          <main className="lk-process-main">
            <AdminPage currentUserId={sessionUser?.id} onUnauthorized={handleLogout} onSelfDemoted={handleSelfDemotedFromAdmin} sectors={sectors} onSectorsChange={setSectors} templates={templates} saveTemplates={saveTemplates} onOpenMenu={() => setSidebarOpen(true)} />
          </main>
        </div>
      ) : activeSection === "perfil" ? (
        <div className="lk-dashboard lk-process-shell">
          {sidebarOpen && <button className="lk-backdrop" aria-label="Fechar navegação" onClick={() => setSidebarOpen(false)} />}
          <AppSidebar user={sessionUser} activeSection="perfil" menuOpen={sidebarOpen} onLogout={handleLogout} onNavigate={section => { setActiveSection(section); setSidebarOpen(false); }} />
          <main className="lk-process-main">
            <PerfilPage onLogout={handleLogout} sessionUser={sessionUser} onOpenMenu={() => setSidebarOpen(true)}
              onStartPageChange={(startPage) => setSessionUser((user) => (user ? { ...user, startPage } : user))}
              onPasswordChanged={() => { setLogoutNoticeOk(true); setLogoutNotice("Senha alterada com sucesso. Entre novamente com a nova senha."); handleLogout(); }} />
          </main>
        </div>
      ) : activeSection === "colaboradores" ? (
        <div className="lk-dashboard lk-process-shell">
          {sidebarOpen && <button className="lk-backdrop" aria-label="Fechar navegação" onClick={() => setSidebarOpen(false)} />}
          <AppSidebar user={sessionUser} activeSection="colaboradores" menuOpen={sidebarOpen} onLogout={handleLogout} onNavigate={section => { setActiveSection(section); setSidebarOpen(false); }} />
          <main className="lk-process-main">
            <ColaboradoresPage isAdmin={sessionUser?.role === "admin"} onUnauthorized={handleLogout} onOpenMenu={() => setSidebarOpen(true)} />
          </main>
        </div>
      ) : activeSection === "contratos" ? (
        <div className="lk-dashboard lk-process-shell">
          {sidebarOpen && <button className="lk-backdrop" aria-label="Fechar navegação" onClick={() => setSidebarOpen(false)} />}
          <AppSidebar user={sessionUser} activeSection="contratos" menuOpen={sidebarOpen} onLogout={handleLogout} onNavigate={section => { setActiveSection(section); setSidebarOpen(false); }} />
          <main className="lk-process-main">
            <ContratosAtivos isViewer={sessionUser?.role === "viewer"} onUnauthorized={handleLogout} onOpenMenu={() => setSidebarOpen(true)} />
          </main>
        </div>
      ) : (
        <>
          {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
          <div className={`sidebar ${sidebarOpen ? "open" : ""}`}>
            <div className="sidebar-header">
              <div className="sidebar-logo">Licit<span>Kanban</span></div>
              <button className="icon-btn" onClick={() => setSidebarOpen(false)}><IconClose /></button>
            </div>
            <nav className="sidebar-nav">
              <p className="sidebar-section-label">Menu</p>
              {SECTIONS.map(s => {
                const Icon = s.icon; return (
                  <button key={s.id} className={`sidebar-item ${activeSection === s.id ? "active" : ""}`}
                    onClick={() => { setActiveSection(s.id); setSidebarOpen(false); }}>
                    <Icon />{s.label}
                  </button>
                );
              })}
            </nav>

            <div className="sidebar-bear-wrapper">
              <img className="sidebar-bear-img bear-escuro" src="/image/fundo-escuro.png" alt="Mascote" />
              <img className="sidebar-bear-img bear-claro" src="/image/fundo-claro.png" alt="Mascote" />
              <img className="sidebar-bear-img bear-azul" src="/image/fundo-azul.png" alt="Mascote" />
            </div>

            <div className="sidebar-logout-wrap">
              <button className="sidebar-item" style={{ color: 'var(--red)', justifyContent: 'center' }} onClick={handleLogout}>Sair</button>
            </div>
            <div className="sidebar-footer">LicitKanban v1.5</div>
          </div>

          <div className="app">
            <div className="app-orb app-orb-1" aria-hidden="true" />
            <div className="app-orb app-orb-2" aria-hidden="true" />
            <header className="header">
              <button className="hamburger" onClick={() => setSidebarOpen(true)}><span /><span /><span /></button>
              <div className="logo">Licit<span>Kanban</span></div>
              <div className="header-actions">
                {activeSection === "processos" && sessionUser?.role !== "viewer" && (
                  <button className="btn-primary" onClick={() => setShowNewProcess(true)}><IconPlus /><span className="btn-label"> Novo Processo</span></button>
                )}
              </div>
            </header>

            {(
              processPage
            )}
          </div>


        </>
      )}
          {inactivityWarning && (
            <div className="inactivity-toast">
              <div className="inactivity-toast-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f0883e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <div className="inactivity-toast-body">
                <span className="inactivity-toast-title">Sessão expirando</span>
                <span className="inactivity-toast-msg">Você será desconectado por inatividade em <strong>{inactivityCountdown}s</strong>.</span>
              </div>
              <button className="inactivity-toast-btn">Continuar</button>
            </div>
          )}
    </AppSettingsContext.Provider>
  );
}
