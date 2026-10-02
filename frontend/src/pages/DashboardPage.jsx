import AppSidebar from "../components/AppSidebar";
import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { authFetch } from "../authFetch";
import { normalizeDocs } from "../utils";
import { IconPalette, IconCalendar } from "../icons";
import { ActiveProcessProgress, SetorPieChart } from "./ProcessosPage";
import "./DashboardPage.css";

const API = process.env.REACT_APP_API_URL || "http://localhost:3001";
const dateOf = value => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`) : null;
const docsOf = p => normalizeDocs(p.docs || []).filter(d => d.type === "doc");

export default function DashboardPage({ columns, archived, sortedColumns = [], user, onNavigate, onLogout, loading, error }) {
  const [contracts, setContracts] = useState(null);
  const [contractError, setContractError] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dark, setDark] = useState(false);
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const response = await authFetch(`${API}/api/contracts`);
        if (response.status === 401 || response.status === 403) { onLogout(); return; }
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error();
        if (live) { setContracts(data); setContractError(""); }
      } catch { if (live) setContractError("Não foi possível carregar os contratos."); }
    };
    load();
    const socket = io(API, { withCredentials: true });
    ["contract:added", "contract:updated", "contract:deleted"].forEach(event => socket.on(event, load));
    return () => { live = false; socket.disconnect(); };
  }, [onLogout]);
  useEffect(() => {
    if (!menuOpen) return;
    const desktop = window.matchMedia("(min-width: 1025px)");
    const close = () => setMenuOpen(false);
    const onKey = e => { if (e.key === "Escape") close(); };
    const onResize = e => { if (e.matches) close(); };
    window.addEventListener("keydown", onKey);
    desktop.addEventListener("change", onResize);
    return () => { window.removeEventListener("keydown", onKey); desktop.removeEventListener("change", onResize); };
  }, [menuOpen]);

  const today = new Date(); today.setHours(12, 0, 0, 0);
  const attention = columns.map(process => {
    const dueDate = dateOf(process.dueDate);
    const days = dueDate ? Math.round((dueDate - today) / 86400000) : null;
    return {
      ...process,
      key: `p-${process.id}`,
      label: process.processNumber ? `Processo ${process.processNumber}` : process.title,
      section: "processos",
      days,
    };
  }).filter(process => Number.isFinite(process.days) && process.days <= 30)
    .sort((a, b) => a.days - b.days)
    .map(process => ({
      ...process,
      reason: process.days < 0 ? `Vencido há ${-process.days} dias`
        : process.days === 0 ? "Vence hoje"
        : process.days === 1 ? "Prazo amanhã" : `Vence em ${process.days} dias`,
      color: process.days <= 1 ? "#dc2626" : "#d97706",
    }));
  const activity = (contracts || []).filter(c => c.updatedAt || c.createdAt).map(c => ({ ...c, date: new Date(c.updatedAt || c.createdAt) })).filter(c => Number.isFinite(c.date.getTime())).sort((a, b) => b.date - a.date);
  const go = (section, tab) => { setMenuOpen(false); onNavigate(section, tab); };
  const unavailable = loading || error;
  const inProgressCount = columns.filter(process => docsOf(process).some(doc => doc.done)).length;
  const bySector = new Map();
  columns.forEach(process => {
    const setor = process.setor?.trim() || "Sem colaborador";
    bySector.set(setor, (bySector.get(setor) || 0) + 1);
  });
  const sectorData = Array.from(bySector, ([setor, count]) => ({ setor, count }))
    .sort((a, b) => b.count - a.count || a.setor.localeCompare(b.setor, "pt-BR"));
  return <div className={`lk-dashboard ${dark ? "lk-dark" : ""}`}>
    {menuOpen && <button className="lk-backdrop" aria-label="Fechar navegação" onClick={() => setMenuOpen(false)} />}
    <AppSidebar user={user} activeSection="dashboard" menuOpen={menuOpen} onNavigate={go} onLogout={onLogout} />
    <main className="lk-main">
      <header className="lk-heading"><div><button className="lk-menu" aria-label="Abrir navegação" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>☰</button><h1>Dashboard</h1><p>Visão geral dos processos e contratos</p></div><div className="lk-actions"><button aria-label="Ver alertas de prazos" title="Ver alertas de prazos" onClick={() => document.getElementById("lk-attention").scrollIntoView({ behavior: "smooth" })}><IconCalendar /></button><button aria-label="Alternar tema do dashboard" aria-pressed={dark} onClick={() => setDark(!dark)}><IconPalette /></button></div></header>
      {(error || contractError) && <p className="lk-error" role="alert">{error || contractError} Os indicadores afetados estão indisponíveis.</p>}
      <section className="lk-kpis" aria-label="Resumo">
        {[["PROCESSOS", unavailable ? "—" : columns.length, "blue"], ["EM ANDAMENTO", unavailable ? "—" : inProgressCount, "green"], ["CONCLUÍDOS", unavailable ? "—" : archived.length, "blue"], ["ATENÇÃO", unavailable ? "—" : attention.length, "amber"]].map(([label, value, tone]) => <article className={`lk-kpi ${tone}`} key={label}><h2><i aria-hidden="true" />{label}</h2><strong>{value}</strong></article>)}
      </section>
      <div className="lk-top-grid">
        <section className="lk-panel lk-progress-panel">
          <div className="lk-panel-heading"><h2>Progresso dos Processos Ativos</h2><button onClick={() => go("processos", "board")}>Ver processos</button></div>
          {unavailable ? <p className="lk-empty">{loading ? "Carregando processos…" : "Dados indisponíveis."}</p>
            : <ActiveProcessProgress columns={columns} sortedColumns={sortedColumns} />}
        </section>
        <section className="lk-panel lk-sector-panel">
          <div className="lk-panel-heading"><h2>Processos por Colaborador</h2><button onClick={() => go("processos", "board")}>Ver processos</button></div>
          {unavailable ? <p className="lk-empty">{loading ? "Carregando processos…" : "Dados indisponíveis."}</p>
            : <SetorPieChart data={sectorData} />}
        </section>
      </div>
      <div className="lk-bottom-grid">
        <section className="lk-panel" id="lk-attention"><div className="lk-panel-heading"><h2>Atenção necessária</h2><span className="lk-pending">{unavailable ? "—" : attention.length} pendências</span></div><div className="lk-attention-list">{attention.map(i => <button key={i.key} onClick={() => go(i.section)}><i style={{ background: i.color }} /><span><strong>{i.label}</strong><small>{i.reason}</small></span></button>)}{!attention.length && <p className="lk-empty">{error ? "Não foi possível verificar os prazos dos processos." : loading ? "Carregando prazos…" : "Nenhum processo vencido ou com vencimento nos próximos 30 dias."}</p>}</div></section>
        <section className="lk-panel"><div className="lk-panel-heading"><h2>Atividade recente</h2>{activity.length > 4 && <button onClick={() => setExpanded(!expanded)}>{expanded ? "Ver menos" : "Ver todas"}</button>}</div><div className={`lk-activity ${expanded ? "expanded" : ""}`}>{activity.slice(0, expanded ? undefined : 4).map(c => <button key={c.id} onClick={() => go("contratos")}><span className="lk-activity-icon">•</span><span><strong>{c.processNumber ? `Contrato ${c.processNumber}` : c.processName} {c.updatedAt && c.updatedAt !== c.createdAt ? "atualizado" : "cadastrado"}</strong><small>{c.date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</small></span></button>)}{!activity.length && <p className="lk-empty">{contracts === null && !contractError ? "Carregando atividades…" : "Nenhuma atividade disponível."}</p>}</div></section>
      </div>
    </main>
  </div>;
}
