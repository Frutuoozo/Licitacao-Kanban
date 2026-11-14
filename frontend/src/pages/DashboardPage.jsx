import AppSidebar from "../components/AppSidebar";
import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { authFetch, API_URL as API } from "../authFetch";
import { formatDate, formatDateTime } from "../preferences";
import { IconMoon, IconSun, IconCalendar } from "../icons";
import { ActiveProcessProgress, SetorPieChart } from "./ProcessosPage";
import MonthColumnChart, { monthlyCounts } from "../components/MonthColumnChart";
import "./DashboardPage.css";

const dateOf = value => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`) : null;

// Título da atividade recente: o nome do contrato (ex.: "Contrato Athosmed"); o número só se não houver nome.
function activityTitle(contract) {
  const name = (contract.processName || "").trim() || contract.processNumber || "";
  return /^contrato\b/i.test(name) ? name : `Contrato ${name}`;
}

const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// Linha das listas "Processos pendentes" e "Atividade recente": bloco de data à esquerda (o que se procura
// primeiro), título e detalhe no meio, etiqueta curta à direita. `tone` colore o bloco e a etiqueta:
// "overdue" (vencida), "soon" (vence em até 3 dias), "new" (cadastro) ou neutro.
function FeedRow({ date, tone = "", title, detail, badge, label, onClick }) {
  const now = new Date();
  return (
    <li>
      <button type="button" className={`lk-feed-row ${tone}`} onClick={onClick} title={label}>
        <span className="lk-feed-date" aria-hidden="true">
          {date ? <><b>{String(date.getDate()).padStart(2, "0")}</b><small>{MONTHS_SHORT[date.getMonth()]}{date.getFullYear() !== now.getFullYear() ? `/${String(date.getFullYear()).slice(2)}` : ""}</small></> : <small>sem<br />data</small>}
        </span>
        <span className="lk-feed-text"><strong>{title}</strong><small>{detail}</small></span>
        <span className="lk-feed-badge">{badge}</span>
      </button>
    </li>
  );
}

const urgencyTone = days => (days === null ? "" : days < 0 ? "overdue" : days <= 3 ? "soon" : "");

export default function DashboardPage({ darkMode: dark = false, onToggleDarkMode, columns, archived, pending = [], sortedColumns = [], user, onNavigate, onLogout, loading, error }) {
  const [contracts, setContracts] = useState(null);
  const [contractError, setContractError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
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
  // Demandas ainda não iniciadas, do vencimento mais próximo ao mais distante.
  const pendingList = pending.map(demand => {
    const dueDate = dateOf(demand.dueDate);
    const days = dueDate ? Math.round((dueDate - today) / 86400000) : null;
    return {
      ...demand,
      days,
      reason: days === null ? "Sem vencimento" : days < 0 ? `Vencida há ${-days} ${days === -1 ? "dia" : "dias"}` : days === 0 ? "Vence hoje" : days === 1 ? "Vence amanhã" : `Vence em ${days} dias`,
    };
  }).sort((a, b) => (a.days ?? Infinity) - (b.days ?? Infinity));
  const activity = (contracts || []).filter(c => c.updatedAt || c.createdAt).map(c => ({ ...c, date: new Date(c.updatedAt || c.createdAt) })).filter(c => Number.isFinite(c.date.getTime())).sort((a, b) => b.date - a.date);
  // Atividades (contratos cadastrados ou atualizados) no mês atual, para o contador ao lado do título.
  const activityThisMonth = activity.filter(c => c.date.getFullYear() === today.getFullYear() && c.date.getMonth() === today.getMonth()).length;
  const go = (section, tab) => { setMenuOpen(false); onNavigate(section, tab); };
  const unavailable = loading || error;
  // Só processos iniciados: quem vence hoje ainda não está vencido.
  const overdueCount = columns.filter(process => { const d = dateOf(process.dueDate); return d && d < today; }).length;
  const bySector = new Map();
  columns.forEach(process => {
    const setor = process.setor?.trim() || "Sem gestor principal";
    bySector.set(setor, (bySector.get(setor) || 0) + 1);
  });
  // Contratos não encerrados que vencem nos próximos 3 meses (de hoje até o mesmo dia daqui a 3 meses),
  // do vencimento mais próximo ao mais distante. Sem nenhum, o painel não aparece.
  const dueLimit = new Date(today.getFullYear(), today.getMonth() + 3, today.getDate(), 23, 59);
  const contractName = c => (c.processName || "").trim() || c.processNumber;
  const dueCards = (contracts || [])
    .filter(c => { const d = dateOf(c.dueDate); return !c.closedAt && d && d >= today && d <= dueLimit; })
    .sort((a, b) => dateOf(a.dueDate) - dateOf(b.dueDate));
  const amendmentLabel = n => (n ? `${n}º aditivo de 4` : "Termo de contrato");
  // Processos concluídos (arquivados) por mês, nos últimos 12 meses.
  const doneMonths = monthlyCounts(new Date(today.getFullYear(), today.getMonth() - 11, 1), archived, p => (p.archivedAt ? new Date(p.archivedAt) : null), p => p.title || p.processNumber);
  const doneTotal = doneMonths.reduce((sum, m) => sum + m.count, 0);
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const sectorData = Array.from(bySector, ([setor, count]) => ({ setor, count }))
    .sort((a, b) => b.count - a.count || a.setor.localeCompare(b.setor, "pt-BR"));
  return <div className={`lk-dashboard ${dark ? "lk-dark" : ""}`}>
    {menuOpen && <button className="lk-backdrop" aria-label="Fechar navegação" onClick={() => setMenuOpen(false)} />}
    <AppSidebar user={user} darkMode={dark} onToggleDarkMode={onToggleDarkMode} activeSection="dashboard" menuOpen={menuOpen} onNavigate={go} onLogout={onLogout} />
    <main className="lk-main">
      <header className="lk-heading"><h1 className="lk-sr">Dashboard</h1><div><button className="lk-menu" aria-label="Abrir navegação" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>☰</button></div><div className="lk-actions"><button aria-label="Abrir calendário de processos" title="Abrir calendário de processos" onClick={() => go("processos", "calendar")}><IconCalendar /></button><button aria-label={dark ? "Usar tema claro" : "Usar tema escuro"} title={dark ? "Tema claro" : "Tema escuro"} aria-pressed={dark} onClick={onToggleDarkMode}>{dark ? <IconSun /> : <IconMoon />}</button></div></header>
      {(error || contractError) && <p className="lk-error" role="alert">{error || contractError} Os indicadores afetados estão indisponíveis.</p>}
      <section className="lk-kpis" aria-label="Resumo">
        {[["INICIADOS", columns.length, "blue"], ["PENDENTES", pending.length, "amber"], ["VENCIDOS", overdueCount, "red"], ["CONCLUÍDOS", doneMonths[doneMonths.length - 1].count, "green"]].map(([label, value, tone]) => [label, unavailable ? "—" : value, tone]).map(([label, value, tone]) => <article className={`lk-kpi ${tone}`} key={label}><h2><i aria-hidden="true" />{label}</h2><strong>{value}</strong></article>)}
      </section>
      <div className="lk-top-grid">
        <section className="lk-panel lk-progress-panel">
          <div className="lk-panel-heading"><h2>Progresso dos Processos Ativos</h2><button onClick={() => go("processos", "board")}>Ver processos</button></div>
          {unavailable ? <p className="lk-empty">{loading ? "Carregando processos…" : "Dados indisponíveis."}</p>
            : <ActiveProcessProgress columns={columns} sortedColumns={sortedColumns} />}
        </section>
        <section className="lk-panel lk-sector-panel">
          <div className="lk-panel-heading"><h2>Processos por Gestor Principal</h2><button onClick={() => go("processos", "board")}>Ver processos</button></div>
          {unavailable ? <p className="lk-empty">{loading ? "Carregando processos…" : "Dados indisponíveis."}</p>
            : <SetorPieChart data={sectorData} />}
        </section>
      </div>
      <div className="lk-bottom-grid is-three">
        <section className="lk-panel" id="lk-pending"><div className="lk-panel-heading"><h2>Processos pendentes</h2><span className="lk-pending">{unavailable ? "—" : pending.length} {pending.length === 1 ? "pendência" : "pendências"}</span></div>{pendingList.length > 0 ? <ul className="lk-feed">{pendingList.map(d => (
          <FeedRow key={d.id} date={dateOf(d.dueDate)} tone={urgencyTone(d.days)} title={d.title} badge={d.reason} onClick={() => go("demandas")}
            label={`${d.title}: ${d.reason.toLowerCase()}. Abrir demandas`}
            detail={<>{d.processNumber ? `Nº ${d.processNumber}` : "Sem número"}{d.type && <span className="lk-feed-type"><i style={{ background: d.typeColor || "var(--lk-muted)" }} />{d.type}</span>}</>} />
        ))}</ul> : <p className="lk-empty">{error ? "Não foi possível carregar as demandas." : loading ? "Carregando demandas…" : "Nenhuma demanda pendente."}</p>}</section>
        <section className="lk-panel lk-done-panel">
          <div className="lk-panel-heading"><h2>Processos concluídos</h2><button onClick={() => go("processos", "reports")}>Ver relatórios</button></div>
          {unavailable ? <p className="lk-empty">{loading ? "Carregando processos…" : "Dados indisponíveis."}</p> : <>
            <p className="lk-done-summary"><strong>{doneTotal}</strong><span>nos últimos 12 meses</span><span className="lk-count">{doneMonths[doneMonths.length - 1].count} neste mês</span></p>
            <MonthColumnChart title="Processos concluídos por mês, nos últimos 12 meses" months={doneMonths} describe={n => (n ? plural(n, "processo concluído", "processos concluídos") : "Nenhum processo concluído")} onSelect={() => go("processos", "reports")} />
          </>}
        </section>
        <section className="lk-panel"><div className="lk-panel-heading"><h2>Atividade recente</h2><span className="lk-count">{contracts === null ? "—" : `${activityThisMonth} neste mês`}</span></div>{activity.length > 0 ? <ul className="lk-feed">{activity.map(c => {
          const updated = c.updatedAt && c.updatedAt !== c.createdAt;
          return (
            <FeedRow key={c.id} date={c.date} tone={updated ? "" : "new"} title={activityTitle(c)} badge={updated ? "Atualizado" : "Cadastrado"} onClick={() => go("contratos")}
              label={`${activityTitle(c)} ${updated ? "atualizado" : "cadastrado"} em ${formatDateTime(c.date.toISOString())}. Abrir contratos`}
              detail={`às ${c.date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`} />
          );
        })}</ul> : <p className="lk-empty">{contracts === null && !contractError ? "Carregando atividades…" : "Nenhuma atividade disponível."}</p>}</section>
      </div>
      {dueCards.length > 0 && <div className="lk-bottom-grid lk-chart-grid">
        <section className="lk-panel">
          <div className="lk-panel-heading"><h2>Vencimentos de contratos</h2><button onClick={() => go("contratos")}>Ver contratos</button></div>
          <h3 className="lk-due-heading">{plural(dueCards.length, "contrato vence", "contratos vencem")} nos próximos 3 meses</h3>
          <div className="lk-due-cards">{dueCards.map(c => (
            <button type="button" key={c.id} className="lk-due-card" onClick={() => go("contratos")} title={contractName(c)}>
              <span className="lk-due-top"><strong>{formatDate(c.dueDate)}</strong><small>{amendmentLabel(c.amendmentCount)}</small></span>
              <span className="lk-due-name">{contractName(c)}</span>
              <span className="lk-due-people"><span><small>Fiscal</small><b title={c.fiscalEffective}>{c.fiscalEffective || "—"}</b></span><span><small>Substituto</small><b title={c.fiscalSubstitute || undefined}>{c.fiscalSubstitute || "—"}</b></span></span>
            </button>
          ))}</div>
        </section>
      </div>}
    </main>
  </div>;
}
