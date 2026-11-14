import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import { io } from "socket.io-client";
import {
  DEFAULT_TEMPLATES, normalizeTemplatesFromApi,
  orderedTemplateTypeNames, normalizeDocs,
} from "./utils";
import AppSidebar from "./components/AppSidebar";
import { AppSettingsContext, DEFAULT_SETTINGS } from "./appSettings";
// Estilos de todas as páginas carregam já no início, nesta ordem (a mesma de quando as páginas eram
// importadas aqui): DashboardPage.css define as cores de todas as telas logadas e o darkTheme.css,
// lá embaixo, precisa vir depois de todos. Só o JavaScript das páginas é baixado sob demanda.
import "./components/ProcessCalendar.css";
import "./pages/ProcessReports.css";
import "./pages/DashboardPage.css";
import "./components/Toast.css";
import "./pages/ProcessosPage.css";
import "./components/DatePicker.css";
import "./pages/ContratosPage.css";
import "./pages/AdminPage.css";
import "./pages/ModelsManager.css";
import "./pages/ColaboradoresPage.css";
import "./pages/PerfilPage.css";
import "./pages/DemandasPage.css";
import LoginPage from "./pages/LoginPage";
import { DEFAULT_PREFERENCES, FONT_ZOOM, PreferencesContext, cachePreferences, readCachedPreferences, setDateFormat } from "./preferences";
import { authFetch, API_URL } from "./authFetch";
import { createSessionEnder } from "./sessionEnd";
import { inactivityStatus } from "./inactivity";
// Por último: as correções do tema escuro precisam vir depois dos estilos das páginas.
import "./darkTheme.css";
import "./scrollbar.css";

// Páginas baixadas sob demanda: a tela de login não carrega o app inteiro (leitor de .docx, gráficos...).
const PAGE_LOADERS = {
  processos: () => import("./pages/ProcessosPage"),
  dashboard: () => import("./pages/DashboardPage"),
  demandas: () => import("./pages/DemandasPage"),
  contratos: () => import("./pages/ContratosPage"),
  admin: () => import("./pages/AdminPage"),
  colaboradores: () => import("./pages/ColaboradoresPage"),
  perfil: () => import("./pages/PerfilPage"),
};
const ProcessosPage = lazy(PAGE_LOADERS.processos);
const DashboardPage = lazy(PAGE_LOADERS.dashboard);
const DemandasPage = lazy(PAGE_LOADERS.demandas);
const ContratosAtivos = lazy(PAGE_LOADERS.contratos);
const AdminPage = lazy(PAGE_LOADERS.admin);
const ColaboradoresPage = lazy(PAGE_LOADERS.colaboradores);
const PerfilPage = lazy(PAGE_LOADERS.perfil);
const pageLoading = <div className="lk-page-loading" role="status">Carregando…</div>;

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [columns, setColumns] = useState([]);
  const [processLoading, setProcessLoading] = useState(true);
  const [processError, setProcessError] = useState("");
  const [archived, setArchived] = useState([]);
  // Demandas ainda não iniciadas: fora do quadro, do calendário, dos relatórios e dos indicadores.
  const [pendingDemands, setPendingDemands] = useState([]);
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
  const [sectors, setSectors] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
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
  // Menu lateral: a aba só vem dos subitens de Processos (no celular); sem ela, a aba atual continua.
  const navigateFromSidebar = useCallback((section, tab) => {
    setActiveSection(section);
    if (tab) setActiveTab(tab);
    setSidebarOpen(false);
  }, []);
  const [sessionUser, setSessionUser] = useState(undefined);
  // Segundos que faltam para a sessão automática encerrar (aviso do último minuto) ou null.
  const [inactivitySeconds, setInactivitySeconds] = useState(null);
  const keepSessionRef = useRef(null);

  const [appSettings, setAppSettings] = useState(DEFAULT_SETTINGS);
  // Preferências pessoais (tema, letra, alertas, exportação, datas): servidor + cópia no navegador.
  const [preferences, setPreferences] = useState(readCachedPreferences);
  const preferencesRef = useRef(preferences);
  const sessionExpiredRef = useRef(null);
  preferencesRef.current = preferences;
  setDateFormat(preferences.dateFormat);
  const applyPreferences = useCallback((next) => { preferencesRef.current = next; setPreferences(next); cachePreferences(next); }, []);
  // Salva na hora (otimista); se o servidor recusar, volta ao valor anterior e repassa o erro.
  const updatePreferences = useCallback(async (changes) => {
    const previous = preferencesRef.current;
    applyPreferences({ ...previous, ...changes });
    try {
      const res = await authFetch(`${API_URL}/api/auth/preferences`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: changes }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        // Sessão expirada (ou backend reiniciado sem JWT_SECRET fixo): volta ao login com aviso.
        sessionExpiredRef.current?.();
        throw new Error("Sua sessão expirou. Entre novamente.");
      }
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar.");
    } catch (error) {
      applyPreferences(previous);
      throw error;
    }
  }, [applyPreferences]);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches || false);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return undefined;
    const onChange = (event) => setSystemDark(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  const darkMode = preferences.theme === "auto" ? systemDark : preferences.theme === "dark";
  const toggleDarkMode = useCallback(() => { updatePreferences({ theme: darkMode ? "light" : "dark" }).catch(() => {}); }, [darkMode, updatePreferences]);
  useEffect(() => { document.documentElement.classList.toggle("lk-theme-dark", darkMode); }, [darkMode]);
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--lk-zoom", String(FONT_ZOOM[preferences.fontSize] || 1));
    if (preferences.fontSize === "normal") root.removeAttribute("data-lk-font"); else root.setAttribute("data-lk-font", preferences.fontSize);
  }, [preferences.fontSize]);
  // Ao entrar, as preferências salvas do usuário substituem as do navegador (tema e letra ficam se ele nunca escolheu).
  const sessionPreferences = sessionUser?.preferences;
  useEffect(() => {
    if (!sessionPreferences) return;
    const current = preferencesRef.current;
    applyPreferences({ ...DEFAULT_PREFERENCES, theme: current.theme, fontSize: current.fontSize, ...sessionPreferences });
  }, [sessionPreferences, applyPreferences]);
  // Aviso mostrado como notificação na tela de login depois de sair: { type, title, text } ou null.
  const [logoutNotice, setLogoutNotice] = useState(null);
  // Uma saída só, mesmo com vários 401 ao mesmo tempo (ver sessionEnd.js). O aviso vale só se vier.
  const sessionEnderRef = useRef(null);
  if (!sessionEnderRef.current) {
    sessionEnderRef.current = createSessionEnder({
      sendLogout: () => authFetch(`${API_URL}/api/auth/logout`, { method: "POST" }),
      onEnd: (notice) => { if (notice) setLogoutNotice(notice); setSessionUser(null); },
    });
  }
  // Botão Sair (e saídas que já definiram o próprio aviso): sem aviso de sessão expirada.
  const handleLogout = useCallback(() => sessionEnderRef.current.end(null), []);
  // A API recusou a sessão (401): volta ao login explicando o motivo.
  const handleSessionExpired = useCallback(() => sessionEnderRef.current.end({ type: "warning", title: "Sessão expirada", text: "Entre novamente para continuar." }), []);
  sessionExpiredRef.current = handleSessionExpired;
  // Novo login: a próxima expiração volta a encerrar a sessão.
  useEffect(() => { if (sessionUser) sessionEnderRef.current.reset(); }, [sessionUser]);

  // Configurações administrativas (sessão automática, confirmação ao excluir...).
  useEffect(() => {
    if (!sessionUser) return;
    authFetch(`${API_URL}/api/settings`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (data) setAppSettings({ ...DEFAULT_SETTINGS, ...data }); })
      .catch(() => { });
  }, [sessionUser]);

  // Sessão automática (Administração → Segurança): encerra após o tempo configurado sem atividade, com
  // contagem regressiva no último minuto. Desligada, ninguém é desconectado por inatividade (antes havia
  // também um limite fixo de 15 min que valia sempre e saía sem aviso).
  // A última atividade fica no localStorage para valer entre abas abertas.
  useEffect(() => {
    if (!sessionUser || !appSettings.sessionTimeoutEnabled) return undefined;
    const limitMs = appSettings.sessionTimeoutMinutes * 60 * 1000;
    const KEY = "lk-last-activity";
    let lastLocal = Date.now();
    const touch = () => { lastLocal = Date.now(); try { localStorage.setItem(KEY, String(lastLocal)); } catch { /* sem storage: vale só esta aba */ } };
    touch();
    keepSessionRef.current = () => { touch(); setInactivitySeconds(null); };
    let throttle = 0;
    const onActivity = () => { const now = Date.now(); if (now - throttle > 15000) { throttle = now; touch(); } };
    const events = ["mousedown", "keydown", "scroll", "touchstart", "mousemove"];
    events.forEach(event => window.addEventListener(event, onActivity, { passive: true }));
    const timer = setInterval(() => {
      let last = lastLocal;
      try { last = Math.max(last, Number(localStorage.getItem(KEY)) || 0); } catch { /* usa a desta aba */ }
      const status = inactivityStatus({ enabled: true, limitMs, lastActivity: last, now: Date.now() });
      setInactivitySeconds(status.warningSeconds);
      if (status.expired) {
        sessionEnderRef.current.end({ type: "warning", title: "Sessão encerrada por inatividade", text: `Você ficou ${appSettings.sessionTimeoutMinutes} minutos sem usar o sistema. Entre novamente para continuar.` });
      }
    }, 1000);
    return () => {
      clearInterval(timer);
      events.forEach(event => window.removeEventListener(event, onActivity));
      keepSessionRef.current = null;
      setInactivitySeconds(null);
    };
  }, [sessionUser, appSettings.sessionTimeoutEnabled, appSettings.sessionTimeoutMinutes]);

  const loadSessionUser = useCallback(() => {
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

  // Depois de entrar, baixa as demais páginas em segundo plano: trocar de seção não espera download.
  useEffect(() => {
    if (!sessionUser) return undefined;
    const timer = setTimeout(() => Object.values(PAGE_LOADERS).forEach((load) => load().catch(() => {})), 1500);
    return () => clearTimeout(timer);
  }, [sessionUser]);

  // Separa a lista do servidor pelas três situações.
  const applyProcessList = useCallback((data) => {
    setColumns(data.filter(p => p.status === 'active'));
    setArchived(data.filter(p => p.status === 'archived'));
    setPendingDemands(data.filter(p => p.status === 'pending'));
  }, []);
  const addProcessLocally = useCallback((process) => {
    const add = (list) => (list.find(c => c.id === process.id) ? list : [...list, process]);
    if (process.status === 'pending') setPendingDemands(add); else setColumns(add);
  }, []);
  // Demanda iniciada: sai das pendentes e entra em Processos.
  const moveToStarted = useCallback((id, setor, startedAt, processNumber) => {
    setPendingDemands((pending) => {
      const demand = pending.find(c => c.id === id);
      if (demand) setColumns(list => (list.find(c => c.id === id) ? list : [...list, { ...demand, status: 'active', setor, startedAt, processNumber: processNumber ?? demand.processNumber }]));
      return pending.filter(c => c.id !== id);
    });
  }, []);

  // Carregar dados iniciais
  useEffect(() => {
    if (!sessionUser) return;
    setProcessLoading(true);
    setProcessError("");
    authFetch(`${API_URL}/api/processes`)
      .then(res => { if (!res.ok && res.status !== 401 && res.status !== 403) throw new Error("load"); if (res.status === 401 || res.status === 403) throw new Error('Unauthorized'); return res.json(); })
      .then(applyProcessList)
      .catch(err => { if (err.message === 'Unauthorized') handleSessionExpired(); else setProcessError("Não foi possível carregar os processos."); })
      .finally(() => setProcessLoading(false));
    authFetch(`${API_URL}/api/templates`)
      .then(res => res.json())
      .then(data => { if (Object.keys(data).length > 0) setTemplates(normalizeTemplatesFromApi(data)); })
      .catch(console.error);
    authFetch(`${API_URL}/api/sectors`)
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setSectors(data); })
      .catch(console.error);
  }, [sessionUser, handleSessionExpired, applyProcessList]);

  // Colaboradores: recarrega ao abrir Processos ou Demandas para refletir cadastros recentes.
  useEffect(() => {
    if (!sessionUser || (activeSection !== "processos" && activeSection !== "demandas")) return;
    authFetch(`${API_URL}/api/collaborators`)
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setCollaborators(data.filter(c => c.ativo !== false)); })
      .catch(console.error);
  }, [sessionUser, activeSection]);

  // Socket.IO
  useEffect(() => {
    if (!sessionUser) return;
    const socket = io(API_URL, { withCredentials: true });
    socket.on('process:added', addProcessLocally);
    socket.on('process:updated', ({ id, title, processNumber, setor, dueDate, type, typeColor, docs, notes, priority }) => {
      const next = { title, processNumber, setor, dueDate, type: type ?? null, typeColor: typeColor ?? null, docs: docs || [], notes: notes ?? null, priority };
      setColumns(p => p.map(c => c.id === id ? { ...c, ...next } : c));
      setArchived(p => p.map(c => c.id === id ? { ...c, ...next } : c));
      setPendingDemands(p => p.map(c => c.id === id ? { ...c, ...next } : c));
    });
    socket.on('process:started', ({ id, setor, startedAt, processNumber }) => moveToStarted(id, setor, startedAt, processNumber));
    socket.on('process:deleted', ({ id }) => { setColumns(p => p.filter(c => c.id !== id)); setArchived(p => p.filter(c => c.id !== id)); setPendingDemands(p => p.filter(c => c.id !== id)); });
    socket.on('process:items_updated', ({ id, docs }) => { setColumns(p => p.map(c => c.id === id ? { ...c, docs } : c)); setArchived(p => p.map(c => c.id === id ? { ...c, docs } : c)); setPendingDemands(p => p.map(c => c.id === id ? { ...c, docs } : c)); });
    socket.on('process:status_changed', ({ id, status }) => {
      if (status === 'archived') setColumns(p => { const col = p.find(c => c.id === id); if (col) setArchived(a => a.find(c => c.id === id) ? a : [...a, { ...col, archivedAt: new Date().toISOString() }]); return p.filter(c => c.id !== id); });
      else setArchived(p => { const col = p.find(c => c.id === id); if (col) setColumns(a => a.find(c => c.id === id) ? a : [...a, col]); return p.filter(c => c.id !== id); });
    });
    socket.on('templates:updated', (data) => {
      setTemplates(normalizeTemplatesFromApi(data));
      authFetch(`${API_URL}/api/processes`)
        .then(res => { if (res.status === 401 || res.status === 403) throw new Error('Unauthorized'); return res.json(); })
        .then(applyProcessList)
        .catch(err => { if (err.message === 'Unauthorized') handleSessionExpired(); });
    });
    return () => socket.disconnect();
  }, [sessionUser, handleSessionExpired, applyProcessList, addProcessLocally, moveToStarted]);

  // API helper
  const apiFetch = useCallback((url, method, body) => {
    authFetch(`${API_URL}${url}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
      .then(res => { if (res.status === 401 || res.status === 403) handleSessionExpired(); })
      .catch(console.error);
  }, [handleSessionExpired]);

  // Operações de demandas: esperam o servidor, para a tela mostrar o erro e manter o formulário aberto.
  const demandRequest = async (url, method, body) => {
    const res = await authFetch(`${API_URL}${url}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { handleSessionExpired(); throw new Error('Sessão expirada. Entre novamente.'); }
    if (!res.ok) throw new Error(data.error || 'Tente de novo em instantes.');
    return data;
  };
  const createDemand = async (demand) => {
    const { createdAt, startedAt } = await demandRequest('/api/processes', 'POST', demand);
    addProcessLocally({ ...demand, setor: demand.setor || null, notes: demand.notes || null, createdAt, startedAt });
  };
  const updateDemand = async (id, data) => {
    await demandRequest(`/api/processes/${id}`, 'PUT', data);
    const next = { ...data, setor: data.setor || null, notes: data.notes || null };
    setColumns(p => p.map(c => c.id === id ? { ...c, ...next } : c));
    setPendingDemands(p => p.map(c => c.id === id ? { ...c, ...next } : c));
  };
  const startDemand = async (id, missingFields = {}) => {
    const started = await demandRequest(`/api/processes/${id}/start`, 'PUT', missingFields);
    moveToStarted(id, started.setor, started.startedAt, started.processNumber);
  };
  const deleteDemand = async (id) => {
    await demandRequest(`/api/processes/${id}`, 'DELETE');
    setColumns(p => p.filter(c => c.id !== id));
    setPendingDemands(p => p.filter(c => c.id !== id));
  };

  // Operações de processos
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
    const res = await authFetch(`${API_URL}/api/templates`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newTemplates) });
    if (res.status === 401) { handleSessionExpired(); throw new Error('Sessão expirada.'); }
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
                onOpenDemands={() => setActiveSection("demandas")}
                updateDocs={updateDocs}
                deleteColumn={deleteColumn} renameColumn={renameColumn} archiveColumn={archiveColumn}
                unarchiveColumn={unarchiveColumn} deleteArchived={deleteArchived}
                collaborators={collaborators}
                isViewer={sessionUser?.role === "viewer"}
              />);

  return (
    <AppSettingsContext.Provider value={{ settings: appSettings, setSettings: setAppSettings }}>
    <PreferencesContext.Provider value={{ preferences, updatePreferences }}>
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
        .btn-chip {
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
        .lk-page-loading { min-height: 60vh; display: grid; place-items: center; font: 500 0.9rem 'Inter', sans-serif; color: var(--lk-muted, #6b7280); }

        /* === Board === */
        .board { flex: 1; overflow-x: auto; padding: 24px 28px; display: flex; gap: 18px; align-items: flex-start; }
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

      <Suspense fallback={pageLoading}>
      {sessionUser === undefined ? (
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--muted)" }}>Carregando sessão...</div>
      ) : !sessionUser ? (
        <LoginPage notice={logoutNotice} onLogin={(data) => { setLogoutNotice(null); openStartPage(data); setSessionUser(data); }} />
      ) : activeSection === "dashboard" ? (
        <DashboardPage darkMode={darkMode} onToggleDarkMode={toggleDarkMode} columns={columns} archived={archived} pending={pendingDemands} sortedColumns={sortedColumns} user={sessionUser} loading={processLoading} error={processError} onLogout={handleLogout} onNavigate={(section, tab = "board") => { setActiveSection(section); setActiveTab(tab); }} />
      ) : activeSection === "demandas" ? (
        <div className={`lk-dashboard lk-process-shell ${darkMode ? "lk-dark" : ""}`}>
          {sidebarOpen && <button className="lk-backdrop" aria-label="Fechar navegação" onClick={() => setSidebarOpen(false)} />}
          <AppSidebar user={sessionUser} darkMode={darkMode} onToggleDarkMode={toggleDarkMode} activeSection="demandas" menuOpen={sidebarOpen} onLogout={handleLogout} processTab={activeTab} onNavigate={navigateFromSidebar} />
          <main className="lk-process-main"><Suspense fallback={pageLoading}>
            <DemandasPage demands={[...pendingDemands, ...columns]} templates={templates} collaborators={collaborators} loading={processLoading} error={processError}
              isViewer={sessionUser?.role === "viewer"} onCreate={createDemand} onUpdate={updateDemand} onStart={startDemand} onDelete={deleteDemand} onOpenMenu={() => setSidebarOpen(true)} />
          </Suspense></main>
        </div>
      ) : activeSection === "admin" && sessionUser?.role === "admin" ? (
        <div className={`lk-dashboard lk-process-shell ${darkMode ? "lk-dark" : ""}`}>
          {sidebarOpen && <button className="lk-backdrop" aria-label="Fechar navegação" onClick={() => setSidebarOpen(false)} />}
          <AppSidebar user={sessionUser} darkMode={darkMode} onToggleDarkMode={toggleDarkMode} activeSection="admin" menuOpen={sidebarOpen} onLogout={handleLogout} processTab={activeTab} onNavigate={navigateFromSidebar} />
          <main className="lk-process-main"><Suspense fallback={pageLoading}>
            <AdminPage currentUserId={sessionUser?.id} onUnauthorized={handleSessionExpired} onSelfDemoted={handleSelfDemotedFromAdmin} sectors={sectors} onSectorsChange={setSectors} templates={templates} saveTemplates={saveTemplates} onOpenMenu={() => setSidebarOpen(true)} />
          </Suspense></main>
        </div>
      ) : activeSection === "perfil" ? (
        <div className={`lk-dashboard lk-process-shell ${darkMode ? "lk-dark" : ""}`}>
          {sidebarOpen && <button className="lk-backdrop" aria-label="Fechar navegação" onClick={() => setSidebarOpen(false)} />}
          <AppSidebar user={sessionUser} darkMode={darkMode} onToggleDarkMode={toggleDarkMode} activeSection="perfil" menuOpen={sidebarOpen} onLogout={handleLogout} processTab={activeTab} onNavigate={navigateFromSidebar} />
          <main className="lk-process-main"><Suspense fallback={pageLoading}>
            <PerfilPage onLogout={handleLogout} onSessionExpired={handleSessionExpired} sessionUser={sessionUser} onOpenMenu={() => setSidebarOpen(true)}
              onStartPageChange={(startPage) => setSessionUser((user) => (user ? { ...user, startPage } : user))}
              onPasswordChanged={() => { setLogoutNotice({ type: "ok", title: "Senha alterada", text: "Entre novamente com a nova senha." }); handleLogout(); }} />
          </Suspense></main>
        </div>
      ) : activeSection === "colaboradores" ? (
        <div className={`lk-dashboard lk-process-shell ${darkMode ? "lk-dark" : ""}`}>
          {sidebarOpen && <button className="lk-backdrop" aria-label="Fechar navegação" onClick={() => setSidebarOpen(false)} />}
          <AppSidebar user={sessionUser} darkMode={darkMode} onToggleDarkMode={toggleDarkMode} activeSection="colaboradores" menuOpen={sidebarOpen} onLogout={handleLogout} processTab={activeTab} onNavigate={navigateFromSidebar} />
          <main className="lk-process-main"><Suspense fallback={pageLoading}>
            <ColaboradoresPage isAdmin={sessionUser?.role === "admin"} onUnauthorized={handleSessionExpired} onOpenMenu={() => setSidebarOpen(true)} />
          </Suspense></main>
        </div>
      ) : activeSection === "contratos" ? (
        <div className={`lk-dashboard lk-process-shell ${darkMode ? "lk-dark" : ""}`}>
          {sidebarOpen && <button className="lk-backdrop" aria-label="Fechar navegação" onClick={() => setSidebarOpen(false)} />}
          <AppSidebar user={sessionUser} darkMode={darkMode} onToggleDarkMode={toggleDarkMode} activeSection="contratos" menuOpen={sidebarOpen} onLogout={handleLogout} processTab={activeTab} onNavigate={navigateFromSidebar} />
          <main className="lk-process-main"><Suspense fallback={pageLoading}>
            <ContratosAtivos isViewer={sessionUser?.role === "viewer"} onUnauthorized={handleSessionExpired} onOpenMenu={() => setSidebarOpen(true)} />
          </Suspense></main>
        </div>
      ) : (
        // Processos, e também qualquer seção desconhecida (ex.: "admin" salvo para quem não é admin, que o
        // efeito acima manda para Processos). Antes caía numa barra lateral antiga, sem uso.
        <div className={`lk-dashboard lk-process-shell ${darkMode ? "lk-dark" : ""}`}>
          {sidebarOpen && <button className="lk-backdrop" aria-label="Fechar navegação" onClick={() => setSidebarOpen(false)} />}
          <AppSidebar user={sessionUser} darkMode={darkMode} onToggleDarkMode={toggleDarkMode} activeSection="processos" menuOpen={sidebarOpen} onLogout={handleLogout} processTab={activeTab} onNavigate={navigateFromSidebar} />
          <main className="lk-process-main"><Suspense fallback={pageLoading}>{processPage}</Suspense></main>
        </div>
      )}
      </Suspense>
          {inactivitySeconds !== null && (
            <div className="inactivity-toast">
              <div className="inactivity-toast-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f0883e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <div className="inactivity-toast-body">
                <span className="inactivity-toast-title">Sessão expirando</span>
                <span className="inactivity-toast-msg">Você será desconectado por inatividade em <strong>{inactivitySeconds}s</strong>.</span>
              </div>
              <button type="button" className="inactivity-toast-btn" onClick={() => keepSessionRef.current?.()}>Continuar</button>
            </div>
          )}
    </PreferencesContext.Provider>
    </AppSettingsContext.Provider>
  );
}
