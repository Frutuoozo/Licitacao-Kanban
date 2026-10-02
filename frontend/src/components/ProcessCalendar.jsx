import { useRef, useState } from "react";
import { normalizeDocs } from "../utils";
import "./ProcessCalendar.css";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const LEGEND = { urgent: "Urgente", soon: "Próximo", planned: "Planejado", completed: "Concluído" };
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const dayNumber = date => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;

export default function ProcessCalendar({ columns }) {
  const today = new Date();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(null);
  const listRef = useRef(null);
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const monthKey = dateKey(month).slice(0, 7);
  const entries = columns.filter(process => /^\d{4}-\d{2}-\d{2}$/.test(process.dueDate || "")).map(process => {
    const date = new Date(`${process.dueDate}T00:00:00`);
    const remaining = dayNumber(date) - dayNumber(today);
    const docs = normalizeDocs(process.docs);
    const completed = docs.length > 0 && docs.every(doc => doc.done);
    const status = completed ? "completed" : remaining <= 30 ? "urgent" : remaining <= 90 ? "soon" : "planned";
    return { ...process, date, remaining, status };
  }).filter(process => Number.isFinite(process.remaining)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const monthEntries = entries.filter(process => process.dueDate.startsWith(monthKey));
  const byDate = new Map();
  entries.forEach(process => byDate.set(process.dueDate, [...(byDate.get(process.dueDate) || []), process]));
  const visible = selected ? byDate.get(selected) || [] : monthEntries;
  const cellCount = Math.ceil((month.getDay() + new Date(year, monthIndex + 1, 0).getDate()) / 7) * 7;
  const cells = Array.from({ length: cellCount }, (_, index) => new Date(year, monthIndex, index - month.getDay() + 1));
  // Em telas menores a lista fica abaixo do calendário: rola até ela ao escolher um dia.
  const selectDay = key => {
    setSelected(key);
    if (key && window.matchMedia("(max-width: 1150px)").matches) {
      requestAnimationFrame(() => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };
  const navigate = offset => { setMonth(new Date(year, monthIndex + offset, 1)); setSelected(null); };

  return <div className="process-calendar">
    <section className="pc-month" aria-label="Calendário mensal">
      <header className="pc-month-header">
        <div><h2 aria-live="polite">{MONTHS[monthIndex]} {year}</h2><p>{monthEntries.length} {monthEntries.length === 1 ? "prazo cadastrado" : "prazos cadastrados"} neste mês</p></div>
        <div className="pc-navigation">
          <button type="button" aria-label="Mês anterior" onClick={() => navigate(-1)}>‹</button>
          <button type="button" onClick={() => { setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelected(null); }}>Hoje</button>
          <button type="button" aria-label="Próximo mês" onClick={() => navigate(1)}>›</button>
        </div>
      </header>
      <div className="pc-weekdays">{DAYS.map(day => <span key={day}>{day}</span>)}</div>
      <div className="pc-grid" style={{ "--pc-weeks": cellCount / 7 }}>
        {cells.map(date => {
          const key = dateKey(date);
          const processes = byDate.get(key) || [];
          return <button type="button" key={key} className={`pc-day ${date.getMonth() !== monthIndex ? "outside" : ""} ${selected === key ? "selected" : ""}`} aria-pressed={selected === key} aria-label={`${date.toLocaleDateString("pt-BR")}, ${processes.length} prazos`} onClick={() => selectDay(selected === key ? null : key)}>
            <time dateTime={key} className={key === dateKey(today) ? "today" : ""}>{date.getDate()}</time>
            <span className="pc-events">{processes.slice(0, 2).map(process => <span key={process.id} className={`pc-event ${process.status}`} title={`${process.processNumber || ""} • ${process.title}`}>
              {process.processNumber ? `${process.processNumber} • ` : ""}{process.title}
            </span>)}{processes.length > 2 && <span className="pc-more">+{processes.length - 2} prazos</span>}</span>
            {processes.length > 0 && <span className="pc-mobile-dots" aria-hidden="true">{processes.slice(0, 4).map(process => <i key={process.id} className={process.status} />)}</span>}
          </button>;
        })}
      </div>
    </section>
    <aside className="pc-deadlines" aria-label="Prazos dos processos" ref={listRef}>
      <header><h2>{selected ? "Prazos do dia" : "Prazos do mês"}</h2>{selected && <button className="pc-reset" onClick={() => setSelected(null)}>Ver mês inteiro</button>}</header>
      <div className="pc-deadline-list" aria-live="polite">
        {visible.length === 0 && <p className="pc-empty">Nenhum prazo cadastrado {selected ? "para este dia" : "neste mês"}.</p>}
        {visible.map(process => <article className="pc-deadline" key={process.id}>
          <time className="pc-date" dateTime={process.dueDate}><strong>{String(process.date.getDate()).padStart(2, "0")}</strong><span>{MONTHS[process.date.getMonth()].slice(0, 3)}</span></time>
          <div className="pc-deadline-content"><h3>{process.processNumber || process.title}</h3>{process.processNumber && <p>{process.title}</p>}{process.setor && <p>{process.setor}</p>}<span className={`pc-tag ${process.status}`}>{process.status === "completed" ? "Concluído" : process.remaining < 0 ? "Vencido" : process.remaining === 0 ? "Vence hoje" : `${process.remaining} dia${process.remaining === 1 ? "" : "s"}`}</span></div>
        </article>)}
      </div>
      <div className="pc-legend"><h3>Legenda de urgência</h3>{Object.entries(LEGEND).map(([status, label]) => <span key={status}><i className={status} />{label}</span>)}</div>
    </aside>
  </div>;
}
