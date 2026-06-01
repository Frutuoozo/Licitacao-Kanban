import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { io } from "socket.io-client";
import {
  IconClose, IconPlus, IconUser, IconShield,
  IconEye, IconEyeOff, IconTrash, IconClipboard, IconFileText, IconUsers,
} from "./icons";
import {
  useStorage, DEFAULT_TEMPLATES, normalizeTemplatesFromApi,
  orderedTemplateTypeNames, tmplItems, normalizeDocs, generateId,
} from "./utils";
import ProcessosPage      from "./pages/ProcessosPage";
import ContratosAtivos    from "./pages/ContratosPage";
import AdminPage          from "./pages/AdminPage";
import ColaboradoresPage  from "./pages/ColaboradoresPage";

// ── Sessão ────────────────────────────────────────────────────────────────────

const LICIT_SESS_USER = "licit_sess_user";
const LICIT_SESS_PASS = "licit_sess_pass";

function clearLicitSessionCredentials() {
  try {
    sessionStorage.removeItem(LICIT_SESS_USER);
    sessionStorage.removeItem(LICIT_SESS_PASS);
  } catch { /* ignore */ }
}

// ── ProfileMenu ───────────────────────────────────────────────────────────────

function ProfileMenu({ token, onLogout }) {
  const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";
  const [open, setOpen]                     = useState(false);
  const [me, setMe]                         = useState(null);
  const [meLoading, setMeLoading]           = useState(false);
  const [showPass, setShowPass]             = useState(false);
  const wrapRef = useRef(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [currentPw, setCurrentPw]           = useState("");
  const [newPw, setNewPw]                   = useState("");
  const [newPw2, setNewPw2]                 = useState("");
  const [resetErr, setResetErr]             = useState("");
  const [resetLoading, setResetLoading]     = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePw, setDeletePw]             = useState("");
  const [deleteErr, setDeleteErr]           = useState("");
  const [deleteLoading, setDeleteLoading]   = useState(false);

  useEffect(() => {
    if (!open) return;
    setMeLoading(true);
    fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (r.status === 401 || r.status === 403) { onLogout(); throw new Error("Unauthorized"); }
        return r.json();
      })
      .then((data) => setMe(data))
      .catch(() => setMe(null))
      .finally(() => setMeLoading(false));
  }, [open, token, API_URL, onLogout]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  let sessionPass = null, sessionUser = null;
  try { sessionPass = sessionStorage.getItem(LICIT_SESS_PASS); sessionUser = sessionStorage.getItem(LICIT_SESS_USER); } catch { /* ignore */ }

  const displayUser = me?.username ?? sessionUser ?? "—";

  const handleResetPassword = async (e) => {
    e.preventDefault(); setResetErr("");
    if (newPw.length < 4) { setResetErr("Nova senha muito curta"); return; }
    if (newPw !== newPw2) { setResetErr("Confirmação não confere"); return; }
    setResetLoading(true);
    try {
      const res  = await fetch(`${API_URL}/api/auth/password`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setResetErr(data.error || "Não foi possível alterar"); return; }
      try { sessionStorage.setItem(LICIT_SESS_PASS, newPw); } catch { /* ignore */ }
      setShowResetModal(false); setCurrentPw(""); setNewPw(""); setNewPw2(""); setOpen(false);
    } catch { setResetErr("Erro de conexão"); } finally { setResetLoading(false); }
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault(); setDeleteErr(""); setDeleteLoading(true);
    try {
      const res  = await fetch(`${API_URL}/api/auth/account`, { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ password: deletePw }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setDeleteErr(data.error || "Falha ao apagar"); return; }
      clearLicitSessionCredentials(); onLogout();
    } catch { setDeleteErr("Erro de conexão"); } finally { setDeleteLoading(false); }
  };

  return (
    <>
      <div className="profile-wrap" ref={wrapRef}>
        <button type="button" className="profile-trigger" aria-expanded={open} aria-haspopup="true" aria-label="Menu de perfil" onClick={() => setOpen((o) => !o)}>
          <IconUser />
        </button>
        {open && (
          <div className="profile-dropdown" role="menu">
            <div className="profile-dropdown-title">Perfil</div>
            {meLoading ? <div className="profile-muted">Carregando...</div> : null}
            <div className="profile-field">
              <span className="profile-label">Usuário</span>
              <span className="profile-value">{displayUser}</span>
            </div>
            <div className="profile-field">
              <span className="profile-label">Senha</span>
              <div className="profile-pass-row">
                <span className="profile-value profile-mono">{sessionPass ? (showPass ? sessionPass : "••••••••") : "—"}</span>
                {sessionPass ? (
                  <button type="button" className="icon-btn" aria-label={showPass ? "Ocultar senha" : "Mostrar senha"} onClick={() => setShowPass((p) => !p)}>
                    {showPass ? <IconEyeOff /> : <IconEye />}
                  </button>
                ) : null}
              </div>
            </div>
            {!sessionPass ? <p className="profile-hint">A senha digitada no login fica visível aqui só nesta sessão do navegador (por segurança, o servidor não guarda a senha em texto).</p> : null}
            <div className="profile-actions-col">
              <button type="button" className="btn-outline profile-action-full" onClick={() => { setOpen(false); setShowResetModal(true); setResetErr(""); setCurrentPw(""); setNewPw(""); setNewPw2(""); }}>Redefinir senha</button>
              <button type="button" className="btn-outline profile-action-full profile-danger-btn" onClick={() => { setOpen(false); setShowDeleteModal(true); setDeleteErr(""); setDeletePw(""); }}>Apagar conta</button>
            </div>
          </div>
        )}
      </div>

      {showResetModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowResetModal(false)}>
          <div className="modal sm-modal">
            <div className="modal-header">
              <h2>Redefinir senha</h2>
              <button type="button" className="icon-btn" onClick={() => setShowResetModal(false)} aria-label="Fechar"><IconClose /></button>
            </div>
            <form className="modal-body col" onSubmit={handleResetPassword}>
              <label className="profile-form-label">Senha atual</label>
              <input className="doc-input" type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required autoComplete="current-password" />
              <label className="profile-form-label">Nova senha</label>
              <input className="doc-input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} required autoComplete="new-password" />
              <label className="profile-form-label">Confirmar nova senha</label>
              <input className="doc-input" type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} required autoComplete="new-password" />
              {resetErr ? <div className="profile-err">{resetErr}</div> : null}
              <div className="modal-footer profile-modal-footer">
                <button type="button" className="btn-cancel" onClick={() => setShowResetModal(false)}>Cancelar</button>
                <button type="submit" className="btn-confirm" disabled={resetLoading}>{resetLoading ? "Salvando..." : "Salvar"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowDeleteModal(false)}>
          <div className="modal sm-modal">
            <div className="modal-header">
              <h2>Apagar conta</h2>
              <button type="button" className="icon-btn" onClick={() => setShowDeleteModal(false)} aria-label="Fechar"><IconClose /></button>
            </div>
            <form className="modal-body col" onSubmit={handleDeleteAccount}>
              <p className="profile-muted profile-delete-lead">Esta ação não pode ser desfeita. Digite sua senha para confirmar.</p>
              <label className="profile-form-label">Senha</label>
              <input className="doc-input" type="password" value={deletePw} onChange={(e) => setDeletePw(e.target.value)} required autoComplete="current-password" />
              {deleteErr ? <div className="profile-err">{deleteErr}</div> : null}
              <div className="modal-footer profile-modal-footer">
                <button type="button" className="btn-cancel" onClick={() => setShowDeleteModal(false)}>Cancelar</button>
                <button type="submit" className="btn-confirm profile-delete-submit" disabled={deleteLoading}>{deleteLoading ? "Removendo..." : "Apagar definitivamente"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// ── Login ─────────────────────────────────────────────────────────────────────

function Login({ onLogin }) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername]           = useState("");
  const [password, setPassword]           = useState("");
  const [showPassword, setShowPassword]   = useState(false);
  const [error, setError]                 = useState("");
  const [successMsg, setSuccessMsg]       = useState("");
  const [loading, setLoading]             = useState(false);

  const switchMode = (reg) => { setIsRegistering(reg); setError(""); setSuccessMsg(""); setShowPassword(false); };

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true); setError(""); setSuccessMsg("");
    try {
      const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";
      const res  = await fetch(`${API_URL}${isRegistering ? "/api/auth/register" : "/api/auth/login"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
      const data = await res.json();
      if (res.ok) {
        if (isRegistering) { setSuccessMsg("Cadastro realizado! Faça o login."); setIsRegistering(false); setPassword(""); }
        else {
          try { sessionStorage.setItem(LICIT_SESS_USER, username); sessionStorage.setItem(LICIT_SESS_PASS, password); } catch { /* ignore */ }
          onLogin(data.accessToken);
        }
      } else {
        setError(data.error || (isRegistering ? "Erro ao cadastrar" : "Login falhou"));
      }
    } catch { setError("Erro ao conectar no servidor"); } finally { setLoading(false); }
  };

  return (
    <div className="ls-shell">
      <div className="ls-orb ls-orb-1" aria-hidden="true" />
      <div className="ls-orb ls-orb-2" aria-hidden="true" />
      <div className="ls-orb ls-orb-3" aria-hidden="true" />
      <div className="ls-orb ls-orb-4" aria-hidden="true" />
      <div className="ls-card">
        <div className="ls-brand">
          <div className="ls-logo">Licit<span>Kanban</span></div>
          <p className="ls-tagline">Gestão inteligente de licitações</p>
        </div>
        <h2 className="ls-title">{isRegistering ? "Criar conta" : "Bem-vindo de volta"}</h2>
        <p className="ls-subtitle">{isRegistering ? "Preencha os dados para se registrar" : "Entre com suas credenciais"}</p>
        <div className="ls-tabs">
          <button type="button" className={`ls-tab${!isRegistering ? " ls-tab-active" : ""}`} onClick={() => switchMode(false)}>Entrar</button>
          <button type="button" className={`ls-tab${ isRegistering ? " ls-tab-active" : ""}`} onClick={() => switchMode(true)}>Cadastrar</button>
        </div>
        {successMsg && (
          <div className="ls-success">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            {successMsg}
          </div>
        )}
        <form onSubmit={handleSubmit} className="ls-form">
          <div className="ls-field-wrap">
            <span className="ls-field-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg></span>
            <input className="ls-input" type="text" placeholder="Usuário" value={username} onChange={e => setUsername(e.target.value)} required autoComplete="username"/>
          </div>
          <div className="ls-field-wrap">
            <span className="ls-field-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>
            <input className="ls-input" style={{ paddingRight: 42 }} type={showPassword ? "text" : "password"} placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)} autoComplete={isRegistering ? "new-password" : "current-password"} required/>
            <button type="button" className="ls-eye-btn" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}>
              {showPassword ? <IconEyeOff /> : <IconEye />}
            </button>
          </div>
          {error && <p className="ls-error">{error}</p>}
          <button type="submit" className="ls-submit" disabled={loading}>
            {loading ? "Aguarde..." : (isRegistering ? "Criar conta" : "Entrar")}
            {!loading && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [token, setToken]         = useStorage("licit_auth_token", null);
  const [columns, setColumns]     = useState([]);
  const [archived, setArchived]   = useState([]);
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
  const [sectors, setSectors]     = useState([]);
  const [showNewProcess, setShowNewProcess] = useState(false);
  const [activeTab, setActiveTab]           = useState("board");
  const [sidebarOpen, setSidebarOpen]       = useState(false);
  const [activeSection, setActiveSection]   = useState("processos");
  const [sessionUser, setSessionUser]       = useState(null);
  const [inactivityWarning, setInactivityWarning]     = useState(false);
  const [inactivityCountdown, setInactivityCountdown] = useState(60);

  const handleLogout = useCallback(() => {
    clearLicitSessionCredentials();
    setToken(null);
  }, [setToken]);

  // Aviso de inatividade
  useEffect(() => {
    if (!token) return;
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
  }, [token, handleLogout]);

  const loadSessionUser = useCallback(() => {
    if (!token) { setSessionUser(null); return; }
    const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";
    fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => { if (r.status === 401 || r.status === 403) { handleLogout(); throw new Error("auth"); } return r.json(); })
      .then(setSessionUser)
      .catch((e) => { if (e.message !== "auth") setSessionUser(null); });
  }, [token, handleLogout]);

  useEffect(() => { loadSessionUser(); }, [loadSessionUser]);

  useEffect(() => {
    if (sessionUser && activeSection === "admin" && sessionUser.role !== "admin") setActiveSection("processos");
  }, [sessionUser, activeSection]);

  const handleSelfDemotedFromAdmin = useCallback(() => {
    loadSessionUser(); setActiveSection("processos");
  }, [loadSessionUser]);

  // Carregar dados iniciais
  useEffect(() => {
    if (!token) return;
    const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";
    fetch(`${API_URL}/api/processes`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => { if (res.status === 401 || res.status === 403) throw new Error('Unauthorized'); return res.json(); })
      .then(data => { setColumns(data.filter(p => p.status === 'active')); setArchived(data.filter(p => p.status === 'archived')); })
      .catch(err => { if (err.message === 'Unauthorized') handleLogout(); });
    fetch(`${API_URL}/api/templates`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => { if (Object.keys(data).length > 0) setTemplates(normalizeTemplatesFromApi(data)); })
      .catch(console.error);
    fetch(`${API_URL}/api/sectors`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setSectors(data); })
      .catch(console.error);
  }, [token, handleLogout]);

  // Socket.IO
  useEffect(() => {
    if (!token) return;
    const socket = io(process.env.REACT_APP_API_URL || "http://localhost:3001", { auth: { token } });
    socket.on('process:added',        (p)           => { if (p.status === 'active') setColumns(prev => prev.find(c => c.id === p.id) ? prev : [...prev, p]); else setArchived(prev => prev.find(c => c.id === p.id) ? prev : [...prev, p]); });
    socket.on('process:updated',      ({ id, title, processNumber, setor }) => { setColumns(p => p.map(c => c.id === id ? { ...c, title, processNumber, setor } : c)); setArchived(p => p.map(c => c.id === id ? { ...c, title, processNumber, setor } : c)); });
    socket.on('process:deleted',      ({ id })       => { setColumns(p => p.filter(c => c.id !== id)); setArchived(p => p.filter(c => c.id !== id)); });
    socket.on('process:items_updated',({ id, docs }) => { setColumns(p => p.map(c => c.id === id ? { ...c, docs } : c)); setArchived(p => p.map(c => c.id === id ? { ...c, docs } : c)); });
    socket.on('process:status_changed',({ id, status }) => {
      if (status === 'archived') setColumns(p => { const col = p.find(c => c.id === id); if (col) setArchived(a => a.find(c => c.id === id) ? a : [...a, { ...col, archivedAt: new Date().toISOString() }]); return p.filter(c => c.id !== id); });
      else                       setArchived(p => { const col = p.find(c => c.id === id); if (col) setColumns(a => a.find(c => c.id === id) ? a : [...a, col]); return p.filter(c => c.id !== id); });
    });
    socket.on('templates:updated', (data) => setTemplates(normalizeTemplatesFromApi(data)));
    return () => socket.disconnect();
  }, [token]);

  // Seções da sidebar
  const SECTIONS = useMemo(() => {
    const base = [
      { id: "processos",     label: "Acompanhar Processos",   icon: IconClipboard },
      { id: "contratos",     label: "Contratos Ativos",       icon: IconFileText  },
      { id: "colaboradores", label: "Colaboradores",          icon: IconUsers     },
    ];
    if (sessionUser?.role === "admin") base.push({ id: "admin", label: "Administração", icon: IconShield });
    return base;
  }, [sessionUser?.role]);

  // API helper
  const apiFetch = useCallback((url, method, body) => {
    if (!token) return;
    const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";
    fetch(`${API_URL}${url}`, { method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined })
      .then(res => { if (res.status === 401 || res.status === 403) setToken(null); })
      .catch(console.error);
  }, [token, setToken]);

  // Operações de processos
  const addColumn    = (col)         => { setColumns(p => [...p, col]); apiFetch('/api/processes', 'POST', col); };
  const deleteColumn = (id)          => { setColumns(p => p.filter(c => c.id !== id)); apiFetch(`/api/processes/${id}`, 'DELETE'); };
  const renameColumn = (id, title)   => {
    setColumns(p => { const next = p.map(c => c.id === id ? { ...c, title } : c); const col = next.find(c => c.id === id); if (col) apiFetch(`/api/processes/${id}`, 'PUT', { title: col.title, processNumber: col.processNumber, setor: col.setor }); return next; });
  };
  const updateDocs = (colId, docs) => {
    setColumns(p => { const next = p.map(c => c.id === colId ? { ...c, docs } : c); apiFetch(`/api/processes/${colId}/items`, 'PUT', { docs }); return next; });
  };
  const archiveColumn   = (id) => { const col = columns.find(c => c.id === id); if (col) { setArchived(p => [...p, { ...col, archivedAt: new Date().toISOString() }]); setColumns(p => p.filter(c => c.id !== id)); apiFetch(`/api/processes/${id}/status`, 'PUT', { status: 'archived' }); } };
  const unarchiveColumn = (id) => { const col = archived.find(c => c.id === id); if (col) { setColumns(p => [...p, col]); setArchived(p => p.filter(c => c.id !== id)); apiFetch(`/api/processes/${id}/status`, 'PUT', { status: 'active' }); } };
  const deleteArchived  = (id) => { setArchived(p => p.filter(c => c.id !== id)); apiFetch(`/api/processes/${id}`, 'DELETE'); };

  const saveTemplates = (newTemplates) => {
    const changedTypes = Object.keys(newTemplates).filter(type => JSON.stringify(tmplItems(templates[type])) !== JSON.stringify(tmplItems(newTemplates[type])));
    setTemplates(newTemplates);
    apiFetch('/api/templates', 'PUT', newTemplates);
    if (changedTypes.length === 0) return;
    setColumns(prevCols => prevCols.map(col => {
      if (!changedTypes.includes(col.type)) return col;
      const newItems  = tmplItems(newTemplates[col.type]);
      const doneByName = {};
      normalizeDocs(col.docs || []).forEach(d => { if (d.done) doneByName[d.name] = true; });
      const updatedDocs = newItems.map(item => ({ id: generateId(), type: item.type || 'doc', name: item.name, bgColor: item.bgColor || null, done: doneByName[item.name] || false }));
      apiFetch(`/api/processes/${col.id}/items`, 'PUT', { docs: updatedDocs });
      return { ...col, docs: updatedDocs };
    }));
  };

  const getRegularDocs = (c) => normalizeDocs(c.docs || []).filter(d => d.type === "doc");
  const totalDocs      = columns.reduce((a, c) => a + getRegularDocs(c).length, 0);
  const totalDone      = columns.reduce((a, c) => a + getRegularDocs(c).filter(d => d.done).length, 0);

  const processTypeOrder = useMemo(() => orderedTemplateTypeNames(templates), [templates]);
  const sortedColumns    = useMemo(() => {
    const rank = (idx) => (idx === -1 ? 999 : idx);
    return [...columns].sort((a, b) => {
      const idxA = processTypeOrder.indexOf(a.type || ""), idxB = processTypeOrder.indexOf(b.type || "");
      if (rank(idxA) !== rank(idxB)) return rank(idxA) - rank(idxB);
      return (a.title || "").localeCompare(b.title || "", "pt-BR");
    });
  }, [columns, processTypeOrder]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=Nunito+Sans:wght@300;400;500;600;700&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #0d1117; --surface: #161b22; --surface2: #1c2330; --border: #30363d;
          --accent: #f0883e; --accent2: #58a6ff; --green: #3fb950; --red: #f85149;
          --text: #e6edf3; --muted: #8b949e; --radius: 10px;
        }
        body { background: var(--bg); color: var(--text); font-family: 'Nunito Sans', sans-serif; min-height: 100vh; }
        .app { display: flex; flex-direction: column; min-height: 100vh; position: relative; overflow: hidden; }
        .app::before { content: ''; position: fixed; inset: -60%; background-image: linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px); background-size: 40px 40px; transform: rotate(15deg); pointer-events: none; z-index: 0; }
        .app-orb { position: fixed; border-radius: 50%; pointer-events: none; filter: blur(90px); z-index: 0; }
        .app-orb-1 { width: 700px; height: 700px; top: -20%; left: -10%; background: radial-gradient(circle, rgba(21,101,192,0.16) 0%, transparent 70%); }
        .app-orb-2 { width: 600px; height: 600px; bottom: -15%; right: -10%; background: radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%); }
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
        .header-section-name { font-size: 0.8rem; color: var(--muted); padding: 3px 10px; background: var(--surface2); border-radius: 99px; border: 1px solid var(--border); }
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

        .admin-panel { flex: 1; padding: 24px 28px; overflow: auto; }
        .admin-panel-inner { max-width: 920px; margin: 0 auto; }
        .admin-title { font-family: 'Outfit', sans-serif; font-size: 1.35rem; font-weight: 800; margin-bottom: 16px; color: var(--text); }
        .admin-tabs { display: flex; gap: 4px; background: var(--surface2); padding: 4px; border-radius: 12px; margin-bottom: 24px; max-width: 320px; }
        .admin-tab { flex: 1; padding: 8px 16px; border: none; background: transparent; border-radius: 9px; font-family: 'Nunito Sans', sans-serif; font-size: 0.85rem; font-weight: 500; color: var(--muted); cursor: pointer; transition: background .15s, color .15s; }
        .admin-tab:hover { color: var(--text); }
        .admin-tab.active { background: var(--surface); color: var(--accent); font-weight: 600; box-shadow: 0 2px 8px rgba(0,0,0,.2); }
        .admin-section { display: flex; flex-direction: column; gap: 0; }
        .admin-section-title { font-family: 'Outfit', sans-serif; font-size: 1rem; font-weight: 700; color: var(--text); margin-bottom: 4px; }
        .admin-lead { font-size: 0.88rem; color: var(--muted); margin-bottom: 20px; line-height: 1.5; }
        .admin-alert { margin-bottom: 14px; }
        .admin-muted { font-size: 0.85rem; color: var(--muted); }

        .admin-table { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
        .admin-table th { text-align: left; padding: 12px 16px; background: var(--surface2); color: var(--muted); font-weight: 600; font-size: 0.72rem; text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid var(--border); }
        .admin-table td { padding: 12px 16px; border-bottom: 1px solid var(--border); vertical-align: middle; }
        .admin-table tr:last-child td { border-bottom: none; }
        .admin-td-user { color: var(--text); font-weight: 500; }
        .admin-you { color: var(--muted); font-weight: 400; }
        .admin-select { max-width: 200px; padding: 8px 10px !important; font-size: 0.82rem !important; cursor: pointer; }
        .admin-add-row { display: flex; gap: 8px; width: 100%; }
        .admin-add-row input { flex: 1; min-width: 0; }
        .admin-add-row button { flex-shrink: 0; }
        .admin-select:disabled { opacity: 0.45; cursor: not-allowed; }
        .admin-td-actions { text-align: right; white-space: nowrap; }
        .admin-table-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; width: 100%; }

        @media (max-width: 600px) {
          .admin-panel { padding: 16px 12px; }
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
        .sidebar-nav { flex: 1; padding: 12px 10px; display: flex; flex-direction: column; gap: 4px; }
        .sidebar-section-label { font-size: 0.68rem; color: var(--muted); text-transform: uppercase; letter-spacing: .6px; padding: 8px 10px 4px; }
        .sidebar-item { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 10px; cursor: pointer; font-size: 0.88rem; color: var(--muted); transition: background .15s, color .15s; border: none; background: none; width: 100%; text-align: left; font-family: 'Nunito Sans', sans-serif; }
        .sidebar-item:hover { background: var(--surface2); color: var(--text); }
        .sidebar-item.active { background: rgba(240,136,62,.12); color: var(--accent); font-weight: 500; }
        .sidebar-footer { padding: 14px; border-top: 1px solid var(--border); font-size: 0.72rem; color: var(--muted); text-align: center; }

        .tabs { display: flex; background: var(--surface); border-bottom: 1px solid var(--border); padding: 0 28px; }
        .tab-btn { background: none; border: none; color: var(--muted); padding: 12px 16px; font-family: 'Nunito Sans', sans-serif; font-size: 0.85rem; cursor: pointer; border-bottom: 2px solid transparent; transition: color .15s, border-color .15s; }
        .tab-btn:hover { color: var(--text); }
        .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 500; }

        .btn-primary { display: flex; align-items: center; gap: 6px; background: var(--accent); color: #000; border: none; padding: 8px 16px; border-radius: var(--radius); font-family: 'Nunito Sans', sans-serif; font-size: 0.85rem; font-weight: 500; cursor: pointer; transition: opacity .15s, transform .2s cubic-bezier(.34,1.56,.64,1), box-shadow .2s; }
        .btn-primary:hover { opacity: .92; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(240,136,62,.35); }
        .btn-primary:active { transform: translateY(0); }
        .btn-outline { display: flex; align-items: center; gap: 6px; background: transparent; color: var(--text); border: 1px solid var(--border); padding: 8px 14px; border-radius: var(--radius); font-family: 'Nunito Sans', sans-serif; font-size: 0.85rem; cursor: pointer; transition: background .2s, border-color .2s, transform .15s; }
        .btn-outline:hover { background: var(--surface2); border-color: var(--muted); transform: translateY(-1px); }
        .btn-outline:active { transform: translateY(0); }

        /* === Login === */
        .ls-shell { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0d1117; position: relative; overflow: hidden; padding: 24px; }
        .ls-shell::before { content: ''; position: absolute; inset: -60%; background-image: linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px); background-size: 40px 40px; transform: rotate(15deg); pointer-events: none; z-index: 0; }
        .ls-orb { position: absolute; border-radius: 50%; pointer-events: none; filter: blur(90px); }
        .ls-orb-1 { width: 600px; height: 600px; top: -20%; left: -10%; background: radial-gradient(circle, rgba(21,101,192,0.18) 0%, transparent 70%); }
        .ls-orb-2 { width: 500px; height: 500px; bottom: -15%; right: -10%; background: radial-gradient(circle, rgba(99,102,241,0.14) 0%, transparent 70%); }
        .ls-orb-3, .ls-orb-4 { display: none; }
        .ls-card { position: relative; z-index: 1; background: #161b27; border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 48px 40px; width: 100%; max-width: 420px; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
        @media (max-width: 480px) { .ls-card { padding: 36px 24px; } }
        .ls-brand { text-align: center; margin-bottom: 32px; }
        .ls-logo { font-family: 'Outfit', sans-serif; font-size: 2.4rem; font-weight: 800; color: #fff; letter-spacing: -1.2px; line-height: 1; }
        .ls-logo span { color: #fb923c; }
        .ls-tagline { margin-top: 8px; font-size: 0.85rem; color: rgba(255,255,255,0.58); font-family: 'Nunito Sans', sans-serif; }
        .ls-title { font-family: 'Outfit', sans-serif; font-size: 1.45rem; font-weight: 700; color: #fff; letter-spacing: -0.3px; margin-bottom: 4px; }
        .ls-subtitle { font-size: 0.84rem; color: rgba(255,255,255,0.55); margin-bottom: 24px; font-family: 'Nunito Sans', sans-serif; }
        .ls-tabs { display: flex; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.14); border-radius: 12px; padding: 4px; gap: 4px; margin-bottom: 26px; }
        .ls-tab { flex: 1; padding: 9px; border: none; background: transparent; border-radius: 9px; font-family: 'Nunito Sans', sans-serif; font-size: 0.875rem; font-weight: 500; color: rgba(255,255,255,0.55); cursor: pointer; transition: color .2s, background .2s, transform .15s, box-shadow .2s; }
        .ls-tab:hover:not(.ls-tab-active) { color: rgba(255,255,255,0.85); background: rgba(255,255,255,0.06); transform: translateY(-1px); }
        .ls-tab-active { background: rgba(255,255,255,0.18); color: #fff; font-weight: 600; box-shadow: 0 1px 6px rgba(0,0,0,0.25); transform: translateY(-1px); }
        .ls-form { display: flex; flex-direction: column; gap: 14px; }
        .ls-field-wrap { position: relative; display: flex; align-items: center; }
        .ls-field-icon { position: absolute; left: 13px; color: rgba(255,255,255,0.45); display: flex; align-items: center; pointer-events: none; z-index: 1; }
        .ls-input { width: 100%; padding: 12px 14px 12px 42px; border: 1.5px solid rgba(255,255,255,0.18); border-radius: 10px; font-family: 'Nunito Sans', sans-serif; font-size: 0.9rem; color: #fff; background: rgba(255,255,255,0.09); outline: none; transition: border-color .2s, box-shadow .2s, background .2s; box-sizing: border-box; }
        .ls-input:focus { border-color: rgba(255,255,255,0.5); background: rgba(255,255,255,0.14); box-shadow: 0 0 0 3px rgba(255,255,255,0.08); }
        .ls-input::placeholder { color: rgba(255,255,255,0.35); }
        .ls-input:-webkit-autofill, .ls-input:-webkit-autofill:hover, .ls-input:-webkit-autofill:focus { -webkit-text-fill-color: #fff; -webkit-box-shadow: 0 0 0px 1000px rgba(10,25,50,0.97) inset; box-shadow: 0 0 0px 1000px rgba(10,25,50,0.97) inset; border-color: rgba(255,255,255,0.18); caret-color: #fff; }
        .ls-eye-btn { position: absolute; right: 10px; background: none; border: none; cursor: pointer; color: rgba(255,255,255,0.45); display: flex; align-items: center; padding: 4px; border-radius: 6px; transition: color .15s; }
        .ls-eye-btn:hover { color: rgba(255,255,255,0.9); }
        .ls-success { display: flex; align-items: center; gap: 8px; background: rgba(16,185,129,0.18); border: 1px solid rgba(16,185,129,0.38); color: #6ee7b7; padding: 10px 13px; border-radius: 9px; font-size: 0.84rem; font-family: 'Nunito Sans', sans-serif; margin-bottom: 4px; }
        .ls-error { color: #fca5a5; font-size: 0.83rem; font-family: 'Nunito Sans', sans-serif; margin: -4px 0 0; }
        .ls-submit { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 13px; background: linear-gradient(90deg, #1565c0 50%, rgba(255,255,255,0.06) 50%); background-size: 200% 100%; background-position: right center; color: #fff; border: 1.5px solid rgba(255,255,255,0.28); border-radius: 10px; font-family: 'Nunito Sans', sans-serif; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: background-position 0.4s ease, box-shadow 0.25s, transform .15s; margin-top: 6px; box-shadow: 0 0 18px rgba(255,255,255,0.08), 0 4px 20px rgba(0,0,0,0.35); }
        .ls-submit:hover:not(:disabled) { background-position: left center; transform: translateY(-1px); box-shadow: 0 0 28px rgba(255,255,255,0.22), 0 8px 28px rgba(21,101,192,0.4); }
        .ls-submit:active:not(:disabled) { transform: translateY(0); }
        .ls-submit:disabled { opacity: 0.45; cursor: not-allowed; }

        /* === Board === */
        .board { flex: 1; overflow-x: auto; padding: 24px 28px; display: flex; gap: 18px; align-items: flex-start; }
        .board::-webkit-scrollbar { height: 4px; }
        .board::-webkit-scrollbar-track { background: transparent; }
        .board::-webkit-scrollbar-thumb { background: #30363d; border-radius: 99px; }
        .board::-webkit-scrollbar-thumb:hover { background: #484f58; }
        @media (max-width: 480px) { .board { scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; padding: 10px; gap: 10px; } .column { scroll-snap-align: center; scroll-snap-stop: always; } }

        .column { min-width: 290px; max-width: 290px; background: var(--surface); border: 2px solid var(--border); border-radius: 14px; display: flex; flex-direction: column; max-height: calc(100vh - 230px); overflow: hidden; transition: border-color .25s, box-shadow .25s, transform .2s; animation: scaleIn .35s cubic-bezier(.4,0,.2,1); position: relative; }
        .column:hover { box-shadow: 0 6px 24px rgba(0,0,0,.35); }
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
        .phase-group { border-radius: 10px; overflow: hidden; border: 1px solid rgba(255,255,255,.08); flex-shrink: 0; animation: slideInUp .3s cubic-bezier(.4,0,.2,1); }
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
        .doc-card.done { opacity: .55; }
        .doc-card:hover { transform: translateX(2px); border-color: rgba(88,166,255,.35); box-shadow: 0 2px 8px rgba(0,0,0,.2); }
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
        .color-picker { position: absolute; right: 0; top: 22px; z-index: 20; background: #1c2330; border: 1px solid #30363d; border-radius: 10px; padding: 8px; display: flex; flex-wrap: wrap; width: 112px; gap: 6px; box-shadow: 0 4px 16px rgba(0,0,0,.5); animation: scaleIn .18s ease-out; transform-origin: top right; }
        .color-swatch { width: 18px; height: 18px; border-radius: 50%; border: 2px solid #30363d; cursor: pointer; transition: transform .2s cubic-bezier(.34,1.56,.64,1); }
        .color-swatch:hover { transform: scale(1.25); }
        .color-swatch.active { border-color: #58a6ff; }
        .add-bar { display: flex; border-top: 1px solid var(--border); position: sticky; bottom: 0; background: var(--surface); z-index: 2; flex-shrink: 0; }
        .add-doc-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px; background: none; border: none; border-right: 1px solid var(--border); color: var(--muted); padding: 9px 10px; font-size: 0.78rem; cursor: pointer; transition: color .2s, background .2s, gap .2s; font-family: 'Nunito Sans', sans-serif; }
        .add-doc-btn:hover { color: var(--accent); background: rgba(240,136,62,.06); gap: 7px; }
        .add-phase-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px; background: none; border: none; color: var(--muted); padding: 9px 10px; font-size: 0.78rem; cursor: pointer; transition: color .2s, background .2s, gap .2s; font-family: 'Nunito Sans', sans-serif; }
        .add-phase-btn:hover { color: var(--accent2); background: rgba(88,166,255,.06); gap: 7px; }
        .add-doc-form { padding: 8px 10px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 6px; }
        .doc-input { background: var(--surface2); border: 1px solid var(--accent2); border-radius: 8px; padding: 8px 10px; color: var(--text); font-family: 'Nunito Sans', sans-serif; font-size: 0.82rem; outline: none; width: 100%; }
        .form-btns { display: flex; gap: 6px; align-items: center; }
        .btn-confirm { background: var(--accent); color: #000; border: none; padding: 6px 14px; border-radius: 6px; font-size: 0.8rem; font-family: 'Nunito Sans', sans-serif; font-weight: 500; cursor: pointer; }
        .btn-cancel { background: none; border: none; color: var(--muted); cursor: pointer; display: flex; align-items: center; }
        .phase-color-row { display: flex; gap: 6px; }
        .phase-color-swatch { width: 20px; height: 20px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; transition: transform .15s; }
        .phase-color-swatch:hover { transform: scale(1.2); }
        .phase-color-swatch.active { border-color: #fff; }
        .icon-btn { background: none; border: none; color: var(--muted); cursor: pointer; padding: 4px; display: flex; align-items: center; border-radius: 6px; transition: color .2s, background .2s, transform .15s cubic-bezier(.34,1.56,.64,1); }
        .icon-btn:hover { color: var(--text); background: rgba(255,255,255,.08); transform: scale(1.12); }
        .icon-btn:active { transform: scale(.95); }
        .icon-btn.danger:hover { color: var(--red); background: rgba(248,81,73,.12); }
        .icon-btn.sm { padding: 3px; }
        .empty-board { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; gap: 12px; color: var(--muted); text-align: center; padding: 60px 20px; }
        .empty-board h2 { font-family: 'Outfit', sans-serif; color: var(--text); font-size: 1.2rem; }
        .empty-board p { font-size: 0.88rem; max-width: 340px; line-height: 1.6; }
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

        .dashboard { padding: 28px; max-width: 780px; width: 100%; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
        .dash-cards-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .dash-count-card { background: var(--surface); border: 1px solid var(--border); border-left: 4px solid; border-radius: 14px; padding: 22px 24px; display: flex; flex-direction: column; gap: 6px; }
        .dash-count-value { font-family: 'Outfit', sans-serif; font-size: 2.8rem; font-weight: 800; line-height: 1; }
        .dash-count-label { font-size: 0.82rem; color: var(--muted); font-weight: 500; }
        .dash-section { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 20px 24px; }
        .dash-title { font-family: 'Outfit', sans-serif; font-size: 0.95rem; font-weight: 700; margin-bottom: 16px; color: var(--text); }
        .dash-pie-wrap { display: flex; gap: 28px; align-items: center; flex-wrap: wrap; }
        .dash-pie-legend { flex: 1; min-width: 160px; display: flex; flex-direction: column; gap: 6px; }
        .dash-pie-legend-item { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 8px; cursor: default; transition: background .15s; }
        .dash-pie-legend-item.hovered { background: var(--surface2); }
        .dash-pie-legend-name { flex: 1; font-size: 0.82rem; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .dash-pie-legend-count { font-family: 'Outfit', sans-serif; font-size: 0.88rem; font-weight: 700; flex-shrink: 0; }
        .dash-process-progress-list { display: flex; flex-direction: column; gap: 14px; }
        .dash-process-progress-item { display: flex; flex-direction: column; gap: 6px; }
        .dash-process-progress-header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
        .dash-process-progress-name { font-size: 0.85rem; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
        .dash-process-num { font-size: 0.75rem; color: var(--muted); font-weight: 400; }
        .dash-process-progress-pct { font-family: 'Outfit', sans-serif; font-size: 0.88rem; font-weight: 700; flex-shrink: 0; }
        .dash-process-progress-bar { height: 7px; background: #21293a; border-radius: 99px; overflow: hidden; }

        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.7); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px; animation: fadeIn .2s ease-out; backdrop-filter: blur(4px); }
        .modal { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; width: 100%; max-width: 720px; display: flex; flex-direction: column; height: 80vh; max-height: 80vh; min-height: 80vh; overflow: hidden; flex-shrink: 0; animation: scaleIn .25s cubic-bezier(.34,1.56,.64,1); box-shadow: 0 20px 60px rgba(0,0,0,.5); }
        .sm-modal { max-width: 420px; height: auto !important; min-height: auto !important; max-height: 90vh !important; }
        .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid var(--border); }
        .modal-header h2 { font-family: 'Outfit', sans-serif; font-size: 1rem; font-weight: 700; }
        .modal-body { display: flex; flex: 1; overflow: hidden; min-height: 0; }
        .modal-body.col { flex-direction: column; padding: 20px; gap: 8px; overflow-y: auto; }
        .modal-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--border); flex-shrink: 0; }
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
        .btn-add-tpl { background: var(--accent); border: none; color: #000; border-radius: 8px; padding: 8px 12px; cursor: pointer; display: flex; align-items: center; flex-shrink: 0; font-weight: 700; font-size: 1rem; transition: opacity .15s; }
        .btn-add-tpl:hover { opacity: .85; }
        .type-toggle { display: flex; align-items: center; gap: 5px; background: transparent; border: 1px solid var(--border); border-radius: 8px; padding: 6px 14px; color: var(--muted); font-size: 0.8rem; font-family: 'Nunito Sans', sans-serif; cursor: pointer; transition: all .15s; }
        .type-toggle:hover { border-color: var(--muted); color: var(--text); }
        .type-toggle.active { border-color: var(--accent); color: var(--accent); background: rgba(240,136,62,.08); }
        .field-label { font-size: 0.82rem; color: var(--muted); font-weight: 500; }
        .field-label.mt { margin-top: 8px; }
        .optional { font-weight: 400; color: var(--muted); }
        .hint { font-size: 0.78rem; color: var(--muted); margin-top: 2px; }
        .select-field { background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; color: var(--text); font-family: 'Nunito Sans', sans-serif; font-size: 0.85rem; outline: none; width: 100%; }
        .select-field:focus { border-color: var(--accent2); }
        .btn-save { background: var(--accent); color: #000; border: none; padding: 8px 20px; border-radius: 8px; font-family: 'Nunito Sans', sans-serif; font-size: 0.85rem; font-weight: 500; cursor: pointer; transition: opacity .15s; }
        .btn-save:hover:not(:disabled) { opacity: .85; }
        .btn-save:disabled { opacity: .4; cursor: default; }
        .btn-cancel-lg { background: transparent; border: 1px solid var(--border); color: var(--text); padding: 8px 18px; border-radius: 8px; font-family: 'Nunito Sans', sans-serif; font-size: 0.85rem; cursor: pointer; transition: background .15s; }
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

        @media (hover: none) { .card-actions { opacity: 1; } }

        /* ── Colaboradores ── */
        .colab-page { flex: 1; padding: 28px; overflow: auto; }
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
          .colab-page { padding: 16px 12px; }
          .colab-header-row { flex-direction: column; gap: 10px; }
          .colab-header-row .btn-primary { align-self: flex-start; }
        }

        /* ── Tablet ── */
        @media (max-width: 768px) {
          .header { padding: 12px 16px; gap: 10px; } .header-section-name { display: none; } .header-stats { display: none; }
          .tabs { padding: 0 16px; overflow-x: auto; } .tabs::-webkit-scrollbar { display: none; } .tab-btn { padding: 12px 12px; font-size: 0.8rem; white-space: nowrap; }
          .board { padding: 16px; gap: 14px; } .column { min-width: 270px; max-width: 270px; max-height: calc(100vh - 200px); }
          .archive-grid { padding: 16px; gap: 12px; } .archived-card { width: 100%; max-width: 320px; }
          .dashboard { padding: 16px; gap: 16px; }
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
          .dashboard { padding: 10px; gap: 12px; }
          .dash-count-value { font-size: 2rem; }
          .dash-count-card { padding: 16px 18px; border-radius: 12px; }
          .dash-section { padding: 14px 16px; border-radius: 12px; }
          .dash-title { font-size: 0.85rem; margin-bottom: 12px; }
          .dash-pie-wrap { flex-direction: column; align-items: center; gap: 20px; }
          .dash-pie-legend { width: 100%; min-width: 0; }
          .setor-col-count, .setor-col-bar { display: none; } .card-actions { opacity: 1; }
          .add-doc-btn, .add-phase-btn { padding: 13px 10px; font-size: 0.82rem; }
          .check-box { width: 20px; height: 20px; } .card-name { font-size: 0.82rem; } .docs-list { max-height: 60vh; }
          .modal-overlay { padding: 0; align-items: flex-end; }
          .modal { border-radius: 16px 16px 0 0; height: 92vh; max-height: 92vh; min-height: 50vh; }
          .sm-modal { border-radius: 16px 16px 0 0; max-height: 92vh !important; height: auto !important; min-height: auto !important; }
          .modal-body { flex-direction: column; }
        }
      `}</style>

      {!token ? (
        <Login onLogin={setToken} />
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
              {SECTIONS.map(s => { const Icon = s.icon; return (
                <button key={s.id} className={`sidebar-item ${activeSection === s.id ? "active" : ""}`}
                  onClick={() => { setActiveSection(s.id); setSidebarOpen(false); }}>
                  <Icon />{s.label}
                </button>
              ); })}
            </nav>
            <div style={{ marginTop: 'auto', padding: '14px', borderTop: '1px solid var(--border)' }}>
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
              <span className="header-section-name">{SECTIONS.find(s => s.id === activeSection)?.label}</span>

              <div className="header-actions">
                {activeSection === "processos" && (
                  <button className="btn-primary" onClick={() => setShowNewProcess(true)}><IconPlus /><span className="btn-label"> Novo Processo</span></button>
                )}
                <ProfileMenu token={token} onLogout={handleLogout} />
              </div>
            </header>

            {activeSection === "contratos" ? (
              <ContratosAtivos />
            ) : activeSection === "colaboradores" ? (
              <ColaboradoresPage token={token} isAdmin={sessionUser?.role === "admin"} onUnauthorized={handleLogout} />
            ) : activeSection === "admin" ? (
              <AdminPage token={token} currentUserId={sessionUser?.id} onUnauthorized={handleLogout} onSelfDemoted={handleSelfDemotedFromAdmin} sectors={sectors} onSectorsChange={setSectors} templates={templates} saveTemplates={saveTemplates} />
            ) : (
              <ProcessosPage
                columns={columns} archived={archived} templates={templates} sortedColumns={sortedColumns}
                activeTab={activeTab} setActiveTab={setActiveTab}
                showNewProcess={showNewProcess} setShowNewProcess={setShowNewProcess}
                addColumn={addColumn} updateDocs={updateDocs}
                deleteColumn={deleteColumn} renameColumn={renameColumn} archiveColumn={archiveColumn}
                unarchiveColumn={unarchiveColumn} deleteArchived={deleteArchived}
                sectors={sectors}
              />
            )}
          </div>

          {inactivityWarning && (
            <div className="inactivity-toast">
              <div className="inactivity-toast-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f0883e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <div className="inactivity-toast-body">
                <span className="inactivity-toast-title">Sessão expirando</span>
                <span className="inactivity-toast-msg">Você será desconectado por inatividade em <strong>{inactivityCountdown}s</strong>.</span>
              </div>
              <button className="inactivity-toast-btn">Continuar</button>
            </div>
          )}
        </>
      )}
    </>
  );
}
