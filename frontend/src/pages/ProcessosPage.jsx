import { useState, useEffect, useRef, useMemo } from "react";
import {
  IconPlus, IconTrash, IconEdit, IconClose, IconCheck,
  IconUnarchive, IconChevron, IconFlag,
} from "../icons";
import {
  TYPE_COLORS, CARD_COLORS, PHASE_COLORS,
  normalizeTemplatesFromApi, orderedTemplateTypeNames,
  tmplItems, tmplColor, generateId,
  normalizeDocs, groupByPhase,
} from "../utils";

// ── DocCard ───────────────────────────────────────────────────────────────────

function DocCard({ doc, onToggle, onDelete, isViewer }) {
  return (
    <div className={`doc-card ${doc.done ? "done" : ""}`} style={doc.bgColor ? { background: doc.bgColor } : {}}>
      <button className="check-btn" onClick={() => !isViewer && onToggle(doc.id)} disabled={isViewer}>
        <div className="check-box">{doc.done && <IconCheck />}</div>
      </button>
      <span className="card-name">{doc.name}</span>
      {!isViewer && (
        <div className="card-actions">
          <button className="icon-btn danger" onClick={() => onDelete(doc.id)} title="Remover"><IconTrash /></button>
        </div>
      )}
    </div>
  );
}

// ── PhaseCard ─────────────────────────────────────────────────────────────────

function PhaseCard({ phase, docs, onToggleDoc, onDeleteDoc, onDeletePhase, onRenamePhase, isViewer }) {
  const allDone   = docs.length > 0 && docs.every(d => d.done);
  const doneCnt   = docs.filter(d => d.done).length;
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing]     = useState(false);
  const [val, setVal]             = useState(phase.name);
  const inputRef = useRef();

  useEffect(() => { if (allDone && docs.length > 0) setCollapsed(true); },  [allDone, docs.length]);
  useEffect(() => { if (!allDone) setCollapsed(false); },                   [allDone]);
  useEffect(() => { if (editing) inputRef.current?.focus(); },              [editing]);

  const save = () => { if (val.trim()) onRenamePhase(phase.id, val.trim()); setEditing(false); };
  const bgColor = phase.bgColor || "#1a2a3a";

  return (
    <div className="phase-group">
      <div className="phase-header" style={{ background: bgColor }}>
        <IconFlag />
        {editing && !isViewer ? (
          <input ref={inputRef} className="phase-input" value={val} onChange={e => setVal(e.target.value)}
            onBlur={save} onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") { setVal(phase.name); setEditing(false); } }} />
        ) : (
          <span className="phase-name" onClick={() => !isViewer && setEditing(true)} style={isViewer ? { cursor: "default" } : {}}>{phase.name}</span>
        )}
        <span className="phase-count">{doneCnt}/{docs.length}</span>
        {allDone && <span className="phase-done-badge">✓</span>}
        <div className="phase-actions">
          {!isViewer && (
            <>
              <button className="icon-btn sm" style={{ color: "#fff" }} onClick={() => setEditing(true)} title="Renomear fase"><IconEdit /></button>
              <button className="icon-btn sm" style={{ color: "#fff" }} onClick={() => onDeletePhase(phase.id)} title="Excluir fase"><IconTrash /></button>
            </>
          )}
          <button className="icon-btn sm" style={{ color: "#fff" }} onClick={() => setCollapsed(p => !p)} title={collapsed ? "Expandir" : "Recolher"}>
            <IconChevron down={!collapsed} />
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="phase-docs">
          {docs.map(doc => (
            <DocCard key={doc.id} doc={doc} onToggle={onToggleDoc} onDelete={onDeleteDoc} isViewer={isViewer} />
          ))}
          {docs.length === 0 && <p className="phase-empty">Nenhum documento nesta fase.</p>}
        </div>
      )}
    </div>
  );
}

// ── ProcessColumn ─────────────────────────────────────────────────────────────

function ProcessColumn({ column, onUpdateDocs, onDeleteColumn, onRenameColumn, onArchive, isViewer }) {
  const [addingItem, setAddingItem]     = useState(null);
  const [newName, setNewName]           = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal]         = useState(column.title);
  const [phaseColorIdx, setPhaseColorIdx] = useState(0);
  const [archiving, setArchiving]       = useState(false);
  const inputRef = useRef();

  useEffect(() => { if (addingItem) inputRef.current?.focus(); }, [addingItem]);

  const docs          = normalizeDocs(column.docs || []);
  const allRegularDocs = docs.filter(d => d.type === "doc");
  const done          = allRegularDocs.filter(d => d.done).length;
  const total         = allRegularDocs.length;
  const pct           = total === 0 ? 0 : Math.round((done / total) * 100);
  const isComplete    = total > 0 && done === total;
  const typeColor     = column.typeColor || "#30363d";
  const borderColor   = isComplete ? "#3fb950" : typeColor;

  useEffect(() => {
    // Apenas finaliza se o usuário não for viewer
    if (isComplete && !archiving && !isViewer) {
      const t = setTimeout(() => {
        setArchiving(true);
        setTimeout(() => onArchive(column.id), 750);
      }, 900);
      return () => clearTimeout(t);
    }
  }, [isComplete, archiving, column.id, isViewer]);

  const saveTitle  = () => { if (titleVal.trim()) onRenameColumn(column.id, titleVal.trim()); setEditingTitle(false); };
  const submitItem = () => {
    if (!newName.trim()) { setAddingItem(null); return; }
    const newDoc = addingItem === "phase"
      ? { id: generateId(), type: "phase", name: newName.trim(), bgColor: PHASE_COLORS[phaseColorIdx] }
      : { id: generateId(), type: "doc",   name: newName.trim(), done: false, bgColor: null };
    onUpdateDocs(column.id, [...docs, newDoc]);
    setNewName(""); setAddingItem(null);
  };

  const toggleDoc     = (docId)           => onUpdateDocs(column.id, docs.map(d => d.id === docId ? { ...d, done: !d.done } : d));
  const deleteDoc     = (docId)           => onUpdateDocs(column.id, docs.filter(d => d.id !== docId));
  const renameDoc     = (docId, name)     => onUpdateDocs(column.id, docs.map(d => d.id === docId ? { ...d, name } : d));
  const renamePhase   = (phaseId, name)   => onUpdateDocs(column.id, docs.map(d => d.id === phaseId ? { ...d, name } : d));
  const deletePhase   = (phaseId) => {
    const idx = docs.findIndex(d => d.id === phaseId);
    const filtered = [];
    let skip = false;
    docs.forEach((d, i) => {
      if (i === idx) { skip = true; return; }
      if (skip && d.type === "phase") skip = false;
      if (!skip) filtered.push(d);
    });
    onUpdateDocs(column.id, filtered);
  };

  const groups = groupByPhase(docs);

  return (
    <div className={`column ${isComplete ? "complete" : ""} ${archiving ? "archiving" : ""}`} style={{ borderColor }}>
      {isComplete && !archiving && <div className="complete-overlay" />}
      <div className="column-header" style={{ borderBottom: `1px solid ${borderColor}33` }}>
        <div className="col-type-stripe" style={{ background: borderColor }} />
        <div className="column-title-row">
          {editingTitle && !isViewer ? (
            <input className="title-input" value={titleVal} onChange={e => setTitleVal(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") { setTitleVal(column.title); setEditingTitle(false); } }}
              autoFocus />
          ) : (
            <h3 className="column-title" onClick={() => !isViewer && setEditingTitle(true)} style={isViewer ? { cursor: "default" } : {}}>{column.title}</h3>
          )}
          {!isViewer && (
            <div style={{ display: "flex", gap: 2 }}>
              <button className="icon-btn danger sm" onClick={() => onDeleteColumn(column.id)} title="Excluir"><IconTrash /></button>
            </div>
          )}
        </div>
        {column.setor && <div className="process-setor">{column.setor}</div>}
        {column.processNumber && <div className="process-number">Nº {column.processNumber}</div>}
        <div className="progress-row">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${pct}%`, background: borderColor }} />
          </div>
          <span className="progress-label">{pct}%</span>
        </div>
        {isComplete && <div className="complete-badge">✓ Concluído {isViewer ? "" : "— finalizando…"}</div>}
      </div>

      <div className="docs-list">
        {groups.map((group, gi) => (
          group.phase ? (
            <PhaseCard key={group.phase.id} phase={group.phase} docs={group.docs}
              onToggleDoc={toggleDoc} onDeleteDoc={deleteDoc}
              onRenameDoc={renameDoc} onChangeDocColor={() => {}}
              onDeletePhase={deletePhase} onRenamePhase={renamePhase} isViewer={isViewer} />
          ) : (
            group.docs.map(doc => (
              <DocCard key={doc.id} doc={doc} onToggle={toggleDoc} onDelete={deleteDoc} isViewer={isViewer} />
            ))
          )
        ))}
      </div>

      {!isViewer && (
        addingItem ? (
          <div className="add-doc-form">
            {addingItem === "phase" && (
              <div className="phase-color-row">
                {PHASE_COLORS.map((c, i) => (
                  <button key={i} className={`phase-color-swatch ${phaseColorIdx === i ? "active" : ""}`}
                    style={{ background: c }} onClick={() => setPhaseColorIdx(i)} />
                ))}
              </div>
            )}
            <input ref={inputRef} className="doc-input"
              placeholder={addingItem === "phase" ? "Nome da fase..." : "Nome do documento..."}
              value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submitItem(); if (e.key === "Escape") { setAddingItem(null); setNewName(""); } }} />
            <div className="form-btns">
              <button className="btn-confirm" onClick={submitItem}>Adicionar</button>
              <button className="btn-cancel"  onClick={() => { setAddingItem(null); setNewName(""); }}><IconClose /></button>
            </div>
          </div>
        ) : (
          <div className="add-bar">
            <button className="add-doc-btn"   onClick={() => setAddingItem("doc")}><IconPlus /> Documento</button>
            <button className="add-phase-btn" onClick={() => setAddingItem("phase")}><IconFlag /> Fase</button>
          </div>
        )
      )}
    </div>
  );
}

// ── ArchivedCard ──────────────────────────────────────────────────────────────

function ArchivedCard({ column, onUnarchive, onDelete, isViewer }) {
  const docs      = normalizeDocs(column.docs || []).filter(d => d.type === "doc");
  const done      = docs.filter(d => d.done).length;
  const total     = docs.length;
  const typeColor = column.typeColor || "#30363d";
  const pct       = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="archived-card" style={{ borderColor: typeColor }}>
      <div className="col-type-stripe" style={{ background: typeColor }} />
      <div style={{ padding: "10px 14px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "6px 0 4px" }}>
          <h3 className="column-title" style={{ cursor: "default" }}>{column.title}</h3>
          {!isViewer && (
            <div style={{ display: "flex", gap: 4 }}>
              <button className="icon-btn" onClick={() => onUnarchive(column.id)} title="Restaurar"><IconUnarchive /></button>
              <button className="icon-btn danger sm" onClick={() => onDelete(column.id)} title="Excluir"><IconTrash /></button>
            </div>
          )}
        </div>
        {column.setor && <div className="process-setor">{column.setor}</div>}
        {column.processNumber && <div className="process-number">Nº {column.processNumber}</div>}
        <div className="progress-row" style={{ marginTop: 8 }}>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${pct}%`, background: typeColor }} />
          </div>
          <span className="progress-label">{pct}%</span>
        </div>
        <div className="complete-badge" style={{ marginTop: 6 }}>✓ Finalizado</div>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

const SETOR_COLORS = ["#58a6ff","#f0883e","#3fb950","#bc8cff","#ff7b72","#e3b341","#00acc1","#f48fb1","#80cbc4","#ffb74d"];

// ── ProcessCalendar ───────────────────────────────────────────────────────────

const CAL_DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const CAL_MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

function getDueDateStatus(dateStr) {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const due   = new Date(dateStr + "T00:00:00");
  const diff  = Math.floor((due - today) / 86400000);
  if (diff < 0)  return "overdue";   // vencido
  if (diff === 0) return "today";    // vence hoje
  if (diff <= 7)  return "soon";     // próximos 7 dias
  return "future";                   // futuro (> 7 dias)
}

function formatDateForPrint(dateStr) {
  if (!dateStr) return "—";
  const [year, month, day] = String(dateStr).split("-");
  return year && month && day ? `${day}-${month}-${year}` : dateStr;
}

const STATUS_COLORS = {
  overdue: { bg: "rgba(248,81,73,0.18)",  dot: "#f85149", text: "#f85149",  label: "Vencido"     },
  today:   { bg: "rgba(240,136,62,0.18)", dot: "#f0883e", text: "#f0883e",  label: "Vence hoje"  },
  soon:    { bg: "rgba(227,179,65,0.18)", dot: "#e3b341", text: "#e3b341",  label: "Em breve"    },
  future:  { bg: "rgba(63,185,80,0.15)",  dot: "#3fb950", text: "#3fb950",  label: "Futuro"      },
};

function ProcessCalendar({ columns }) {
  const today = new Date(); today.setHours(0,0,0,0);
  const [viewYear,  setViewYear]  = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selected,  setSelected]  = useState(null); // "YYYY-MM-DD"

  const processesWithDue = columns.filter(c => c.dueDate);

  // Map date -> list of processes
  const byDate = {};
  processesWithDue.forEach(c => {
    if (!byDate[c.dueDate]) byDate[c.dueDate] = [];
    byDate[c.dueDate].push(c);
  });

  // Build calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const fmt = (d) => `${viewYear}-${String(viewMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y-1); } else setViewMonth(m => m-1); setSelected(null); };
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y+1); } else setViewMonth(m => m+1); setSelected(null); };

  const selectedProcesses = selected ? (byDate[selected] || []) : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Legenda */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 2 }}>
        {Object.entries(STATUS_COLORS).map(([key, val]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.75rem", color: val.text }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: val.dot, display: "inline-block", flexShrink: 0 }} />
            {val.label}
          </div>
        ))}
      </div>

      {/* Navegação */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <button onClick={prevMonth} style={{ background: "none", border: "1px solid #30363d", color: "#e6edf3", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontSize: "1rem", lineHeight: 1 }}>‹</button>
        <span style={{ fontFamily: "'Outfit', sans-serif", fontWeight: 700, fontSize: "1rem", color: "#e6edf3" }}>
          {CAL_MONTHS[viewMonth]} {viewYear}
        </span>
        <button onClick={nextMonth} style={{ background: "none", border: "1px solid #30363d", color: "#e6edf3", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontSize: "1rem", lineHeight: 1 }}>›</button>
      </div>

      {/* Grade */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
        {CAL_DAYS.map(d => (
          <div key={d} style={{ textAlign: "center", fontSize: "0.68rem", fontWeight: 700, color: "#8b949e", textTransform: "uppercase", padding: "4px 0", letterSpacing: ".4px" }}>{d}</div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} />;
          const dateStr  = fmt(day);
          const procs    = byDate[dateStr] || [];
          const isToday  = dateStr === today.toISOString().slice(0,10);
          const isSel    = dateStr === selected;
          const statuses = [...new Set(procs.map(p => getDueDateStatus(p.dueDate)))];
          // pick worst status for background
          const priority = ["overdue","today","soon","future"];
          const worstSt  = priority.find(s => statuses.includes(s));
          const sc       = worstSt ? STATUS_COLORS[worstSt] : null;

          return (
            <div key={day}
              onClick={() => procs.length > 0 && setSelected(isSel ? null : dateStr)}
              style={{
                minHeight: 44, borderRadius: 8, padding: "4px 2px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", gap: 3, cursor: procs.length > 0 ? "pointer" : "default",
                background: isSel ? (sc?.bg || "rgba(88,166,255,0.15)") : (isToday ? "rgba(88,166,255,0.10)" : "transparent"),
                border: isToday ? "1px solid rgba(88,166,255,0.35)" : (isSel ? `1px solid ${sc?.dot || "#58a6ff"}55` : "1px solid transparent"),
                transition: "background .15s, border-color .15s",
              }}
            >
              <span style={{ fontSize: "0.8rem", fontWeight: isToday ? 700 : 400, color: isToday ? "#58a6ff" : "#e6edf3", lineHeight: 1.6 }}>{day}</span>
              {procs.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 2, justifyContent: "center" }}>
                  {statuses.map((st, si) => (
                    <span key={si} style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_COLORS[st]?.dot || "#8b949e", flexShrink: 0 }} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Popover do dia selecionado */}
      {selected && selectedProcesses.length > 0 && (
        <div style={{ background: "#1c2330", border: "1px solid #30363d", borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8, animation: "slideInUp .2s ease-out" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#8b949e", textTransform: "uppercase", letterSpacing: ".5px" }}>
              Vencimentos em {selected.split("-").reverse().join("/")}
            </span>
            <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: "#8b949e", cursor: "pointer", padding: 2, display: "flex", alignItems: "center" }}>✕</button>
          </div>
          {selectedProcesses.map(p => {
            const st = getDueDateStatus(p.dueDate);
            const sc = STATUS_COLORS[st] || {};
            return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: sc.bg || "rgba(255,255,255,0.04)", borderRadius: 8, border: `1px solid ${sc.dot || "#30363d"}33` }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: sc.dot || "#8b949e", flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "#e6edf3", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                  <div style={{ fontSize: "0.72rem", color: "#8b949e" }}>
                    {p.processNumber && `Nº ${p.processNumber}`}{p.setor && ` · ${p.setor}`}
                  </div>
                </div>
                <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: sc.bg, color: sc.text, border: `1px solid ${sc.dot}55`, flexShrink: 0 }}>
                  {sc.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SetorPieChart({ data }) {
  const [hovered, setHovered] = useState(null);
  const cx = 90, cy = 90, R = 76, r = 46, gap = 2;
  const total = data.reduce((s, d) => s + d.count, 0);

  function polarToXY(angle, radius) {
    const rad = (angle - 90) * Math.PI / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
  }
  function slicePath(startAngle, endAngle) {
    const s1 = polarToXY(startAngle + gap / 2, R), e1 = polarToXY(endAngle - gap / 2, R);
    const s2 = polarToXY(endAngle - gap / 2, r),   e2 = polarToXY(startAngle + gap / 2, r);
    const large = endAngle - startAngle > 180 ? 1 : 0;
    return `M${s1.x},${s1.y} A${R},${R} 0 ${large} 1 ${e1.x},${e1.y} L${s2.x},${s2.y} A${r},${r} 0 ${large} 0 ${e2.x},${e2.y} Z`;
  }

  let cursor = 0;
  const slices = data.map((d, i) => {
    const angle = (d.count / total) * 360;
    const slice = { ...d, start: cursor, end: cursor + angle, color: SETOR_COLORS[i % SETOR_COLORS.length] };
    cursor += angle;
    return slice;
  });

  if (data.length === 0) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:"32px 0", color:"#8b949e", fontSize:"0.85rem" }}>
        Nenhum processo ativo com setor definido.
      </div>
    );
  }

  return (
    <div className="dash-pie-wrap">
      <svg width={180} height={180} viewBox="0 0 180 180" style={{ flexShrink: 0 }}>
        {slices.map((s, i) => {
          const isHov = hovered === i;
          return (
            <path key={i} d={slicePath(s.start, s.end)}
              fill={isHov ? s.color : s.color + "cc"}
              style={{ transform: isHov ? `scale(1.05)` : "scale(1)", transformOrigin:`${cx}px ${cy}px`, transition:"all .2s", cursor:"pointer" }}
              onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)} />
          );
        })}
        {hovered !== null ? (
          <>
            <text x={cx} y={cy - 8} textAnchor="middle" fill="#e6edf3" fontSize="20" fontWeight="700" fontFamily="'Outfit',sans-serif">{slices[hovered]?.count}</text>
            <text x={cx} y={cy + 10} textAnchor="middle" fill="#8b949e" fontSize="9" fontFamily="'Nunito Sans',sans-serif"
              style={{ dominantBaseline:"middle" }}>
              {slices[hovered]?.setor.length > 14 ? slices[hovered]?.setor.slice(0,13)+"…" : slices[hovered]?.setor}
            </text>
          </>
        ) : (
          <>
            <text x={cx} y={cy - 8} textAnchor="middle" fill="#e6edf3" fontSize="22" fontWeight="700" fontFamily="'Outfit',sans-serif">{total}</text>
            <text x={cx} y={cy + 10} textAnchor="middle" fill="#8b949e" fontSize="10" fontFamily="'Nunito Sans',sans-serif">processos</text>
          </>
        )}
      </svg>

      <div className="dash-pie-legend">
        {slices.map((s, i) => (
          <div key={i} className={`dash-pie-legend-item ${hovered === i ? "hovered" : ""}`}
            onMouseEnter={() => setHovered(i)} onMouseLeave={() => setHovered(null)}>
            <span style={{ width:10, height:10, borderRadius:3, background:s.color, flexShrink:0 }} />
            <span className="dash-pie-legend-name">{s.setor}</span>
            <span className="dash-pie-legend-count" style={{ color: s.color }}>{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProcessReports({ columns, archived, sectors = [] }) {
  const allProcesses = useMemo(() => {
    const list = [...columns, ...archived].map(c => {
      const docs = normalizeDocs(c.docs || []);
      const regularDocs = docs.filter(d => d.type === "doc");
      const done = regularDocs.filter(d => d.done).length;
      const total = regularDocs.length;
      const pct = total === 0 ? 0 : Math.round((done / total) * 100);
      const due = c.dueDate || "";
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const dueDate = due ? new Date(due + "T00:00:00") : null;
      let dueStatus = "sem-data";
      if (dueDate) {
        const diff = Math.floor((dueDate - today) / 86400000);
        if (diff < 0) dueStatus = "overdue";
        else if (diff === 0) dueStatus = "today";
        else if (diff <= 7) dueStatus = "soon";
        else dueStatus = "future";
      }
      return {
        ...c,
        docs,
        regularDocs,
        totalDocs: total,
        doneDocs: done,
        progress: pct,
        dueStatus,
        statusLabel: c.status === "archived" ? "Finalizado" : "Ativo",
      };
    });
    return list;
  }, [columns, archived]);

  const [statusFilter, setStatusFilter] = useState("all");
  const [setorFilter, setSetorFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dueFilter, setDueFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [search, setSearch] = useState("");

  const uniqueSectors = useMemo(() => {
    return [...new Set(allProcesses.map(p => p.setor).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [allProcesses]);

  const uniqueTypes = useMemo(() => {
    return [...new Set(allProcesses.map(p => p.type).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [allProcesses]);

  const uniqueYears = useMemo(() => {
    const years = [...new Set(allProcesses.map(p => p.dueDate ? String(p.dueDate).slice(0, 4) : "sem-data"))];
    return years.sort((a, b) => {
      if (a === "sem-data") return 1;
      if (b === "sem-data") return -1;
      return Number(b) - Number(a);
    });
  }, [allProcesses]);

  const filteredProcesses = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allProcesses.filter(p => {
      const matchesStatus = statusFilter === "all" || p.status === statusFilter;
      const matchesSetor = setorFilter === "all" || p.setor === setorFilter;
      const matchesType = typeFilter === "all" || p.type === typeFilter;
      const matchesDue = dueFilter === "all" || p.dueStatus === dueFilter;
      const processYear = p.dueDate ? String(p.dueDate).slice(0, 4) : "sem-data";
      const matchesYear = yearFilter === "all" || processYear === yearFilter;
      const matchesSearch = !term || [p.title, p.processNumber, p.setor, p.type].filter(Boolean).some(v => String(v).toLowerCase().includes(term));
      return matchesStatus && matchesSetor && matchesType && matchesDue && matchesYear && matchesSearch;
    });
  }, [allProcesses, statusFilter, setorFilter, typeFilter, dueFilter, yearFilter, search]);

  const totalAtivos = columns.length;
  const totalFinalizados = archived.length;
  const totalVencidos = allProcesses.filter(p => p.dueStatus === "overdue").length;
  const totalProximos = allProcesses.filter(p => p.dueStatus === "soon" || p.dueStatus === "today").length;

  return (
    <div className="report-view" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <style>{`
        .report-view { width: 100%; max-width: 1320px; min-width: 0; margin: 0 auto; padding: 24px 28px; box-sizing: border-box; }
        .report-stats { display: grid !important; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px !important; flex: 1; width: auto; min-width: 0; }
        .report-stat-card { min-width: 0 !important; }
        .report-print-button { flex-shrink: 0; margin-left: auto; }
        .report-table { width: 100%; }
        .report-print-header { display: none; }
        @media print {
          @page { size: A4 landscape; margin: 14mm; }
          body { background: #fff !important; color: #111 !important; }
          .app::before, .app-orb { display: none !important; }
          .header, .tabs, .report-filters, .report-actions > .report-print-button { display: none !important; }
          .report-view { display: block !important; max-width: none !important; padding: 0 !important; margin: 0 !important; color: #111 !important; }
          .report-print-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; padding-bottom: 12px; margin-bottom: 14px; border-bottom: 2px solid #f0883e; color: #111 !important; }
          .report-print-brand { display: flex; align-items: center; }
          .report-print-name { font: 800 21px/1 'Outfit', sans-serif; color: #111 !important; }
          .report-print-title { font: 700 15px/1.2 'Outfit', sans-serif; color: #111 !important; text-align: right; }
          .report-print-date { display: block; margin-top: 4px; font: 400 10px/1.2 'Nunito Sans', sans-serif; color: #555 !important; }
          .report-actions { display: flex !important; margin-bottom: 14px; }
          .report-stats { width: 100%; gap: 8px !important; }
          .report-stat-card { background: #fff !important; border: 1px solid #bbb !important; border-radius: 5px !important; padding: 8px 10px !important; color: #111 !important; }
          .report-stat-card div:first-child { color: #555 !important; }
          .report-stat-card div:last-child { color: #111 !important; }
          .report-table-wrap { overflow: visible !important; background: #fff !important; border: 1px solid #999 !important; border-radius: 0 !important; }
          .report-table { color: #111 !important; table-layout: fixed; }
          .report-table th:nth-child(1), .report-table td:nth-child(1) { width: 32%; }
          .report-table th:nth-child(2), .report-table td:nth-child(2) { width: 19%; }
          .report-table th:nth-child(3), .report-table td:nth-child(3) { width: 13%; padding-left: 8px !important; padding-right: 8px !important; white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
          .report-table th:nth-child(4), .report-table td:nth-child(4) { width: 18%; padding-left: 8px !important; padding-right: 8px !important; white-space: nowrap; overflow: hidden; }
          .report-table th:nth-child(5), .report-table td:nth-child(5) { width: 18%; padding-left: 8px !important; padding-right: 8px !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .report-table thead tr { background: #eee !important; }
          .report-table th { color: #111 !important; border-bottom: 1px solid #888 !important; }
          .report-table tr { border-top: 1px solid #ccc !important; }
          .report-table td { color: #111 !important; }
          .report-table td div[style] { color: #111 !important; }
          .report-table td div div[style] { background: #ddd !important; }
          .report-table td div div div[style] { background: #555 !important; }
          .report-print-hidden { display: none !important; }
        }
        @media (max-width: 600px) {
          .report-view { padding: 16px 12px; }
          .report-view { gap: 12px !important; }
          .report-actions { align-items: stretch !important; }
          .report-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px !important; width: 100%; }
          .report-stat-card { min-width: 0 !important; padding: 10px !important; }
          .report-stat-card div:first-child { font-size: 0.6rem !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .report-stat-card div:last-child { font-size: 1.1rem !important; }
          .report-actions > .btn-save { width: 100%; justify-content: center; }
          .report-filters { grid-template-columns: 1fr !important; }
          .report-table-wrap { border-radius: 10px !important; background: transparent !important; border: none !important; overflow: visible !important; }
          .report-table, .report-table tbody, .report-table tr, .report-table td { display: block; width: 100%; }
          .report-table thead { display: none; }
          .report-table tr { background: #0f1724; border: 1px solid #30363d; border-radius: 10px; margin-bottom: 10px; overflow: hidden; }
          .report-table td { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 10px !important; border-top: 1px solid #1f2937; text-align: right; }
          .report-table td:first-child { display: block; padding: 12px 10px !important; text-align: left; border-top: none; background: #161b24; }
          .report-table td:not(:first-child)::before { content: attr(data-label); flex-shrink: 0; color: #8b949e; font-size: 0.68rem; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; text-align: left; }
          .report-table td:nth-child(6) { align-items: flex-start; }
          .report-table td:nth-child(6) > div { flex: 1; min-width: 0; justify-content: flex-end; }
          .report-table td[colspan] { display: block; text-align: center; }
          .report-table td[colspan]::before { display: none; }
        }
        @media (max-width: 480px) {
          .report-view { padding: 10px; }
        }
      `}</style>

      <div className="report-print-header" aria-hidden="true">
        <div className="report-print-brand">
          <div className="report-print-name">LicitKanban</div>
        </div>
        <div className="report-print-title">
          Relatório de Processos
          <span className="report-print-date">Emitido em {new Date().toLocaleDateString("pt-BR")}</span>
        </div>
      </div>

      <div className="report-actions" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div className="report-stats">
          <div className="report-card report-stat-card" style={{ padding: "12px 14px", borderRadius: 12, background: "#111827", border: "1px solid #30363d", minWidth: 110 }}>
            <div style={{ fontSize: "0.68rem", color: "#8b949e", textTransform: "uppercase", letterSpacing: ".5px" }}>Ativos</div>
            <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#58a6ff" }}>{totalAtivos}</div>
          </div>
          <div className="report-card report-stat-card" style={{ padding: "12px 14px", borderRadius: 12, background: "#111827", border: "1px solid #30363d", minWidth: 110 }}>
            <div style={{ fontSize: "0.68rem", color: "#8b949e", textTransform: "uppercase", letterSpacing: ".5px" }}>Finalizados</div>
            <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#3fb950" }}>{totalFinalizados}</div>
          </div>
          <div className="report-card report-stat-card" style={{ padding: "12px 14px", borderRadius: 12, background: "#111827", border: "1px solid #30363d", minWidth: 110 }}>
            <div style={{ fontSize: "0.68rem", color: "#8b949e", textTransform: "uppercase", letterSpacing: ".5px" }}>Vencidos</div>
            <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#f85149" }}>{totalVencidos}</div>
          </div>
          <div className="report-card report-stat-card" style={{ padding: "12px 14px", borderRadius: 12, background: "#111827", border: "1px solid #30363d", minWidth: 140 }}>
            <div style={{ fontSize: "0.68rem", color: "#8b949e", textTransform: "uppercase", letterSpacing: ".5px" }}>Próximos do venc.</div>
            <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#e3b341" }}>{totalProximos}</div>
          </div>
          <div className="report-card report-stat-card" style={{ padding: "12px 14px", borderRadius: 12, background: "#111827", border: "1px solid #30363d", minWidth: 110 }}>
            <div style={{ fontSize: "0.68rem", color: "#8b949e", textTransform: "uppercase", letterSpacing: ".5px" }}>Total de processos</div>
            <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#f0883e" }}>{totalAtivos + totalFinalizados}</div>
          </div>
        </div>
        <button className="btn-save report-print-button" onClick={() => window.print()} style={{ whiteSpace: "nowrap" }}>Imprimir relatório</button>
      </div>

      <div className="report-filters" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "0.78rem", color: "#8b949e" }}>
          Buscar
          <input className="doc-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Título, número, setor..." />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "0.78rem", color: "#8b949e" }}>
          Status
          <select className="select-field" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">Todos</option>
            <option value="active">Ativos</option>
            <option value="archived">Finalizados</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "0.78rem", color: "#8b949e" }}>
          Setor
          <select className="select-field" value={setorFilter} onChange={e => setSetorFilter(e.target.value)}>
            <option value="all">Todos</option>
            {uniqueSectors.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "0.78rem", color: "#8b949e" }}>
          Tipo
          <select className="select-field" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="all">Todos</option>
            {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "0.78rem", color: "#8b949e" }}>
          Vencimento
          <select className="select-field" value={dueFilter} onChange={e => setDueFilter(e.target.value)}>
            <option value="all">Todos</option>
            <option value="overdue">Vencidos</option>
            <option value="today">Vence hoje</option>
            <option value="soon">Próximos 7 dias</option>
            <option value="future">Futuro</option>
            <option value="sem-data">Sem data</option>
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "0.78rem", color: "#8b949e" }}>
          Ano
          <select className="select-field" value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
            <option value="all">Todos</option>
            {uniqueYears.map(year => (
              <option key={year} value={year}>{year === "sem-data" ? "Sem data" : year}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="report-table-wrap" style={{ overflowX: "auto", background: "#0f1724", border: "1px solid #30363d", borderRadius: 12 }}>
        <table className="report-table" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#161b24" }}>
              <th style={{ textAlign: "left", padding: "10px 12px", color: "#8b949e", fontSize: "0.72rem", textTransform: "uppercase" }}>Processo</th>
              <th style={{ textAlign: "left", padding: "10px 12px", color: "#8b949e", fontSize: "0.72rem", textTransform: "uppercase" }}>Setor</th>
              <th style={{ textAlign: "left", padding: "10px 12px", color: "#8b949e", fontSize: "0.72rem", textTransform: "uppercase" }}>Tipo</th>
              <th style={{ textAlign: "left", padding: "10px 12px", color: "#8b949e", fontSize: "0.72rem", textTransform: "uppercase" }}>Vencimento</th>
              <th style={{ textAlign: "left", padding: "10px 12px", color: "#8b949e", fontSize: "0.72rem", textTransform: "uppercase" }}>Status</th>
              <th className="report-print-hidden" style={{ textAlign: "left", padding: "10px 12px", color: "#8b949e", fontSize: "0.72rem", textTransform: "uppercase" }}>Progresso</th>
              <th className="report-print-hidden" style={{ textAlign: "left", padding: "10px 12px", color: "#8b949e", fontSize: "0.72rem", textTransform: "uppercase" }}>Docs</th>
            </tr>
          </thead>
          <tbody>
            {filteredProcesses.map(p => (
              <tr key={p.id} style={{ borderTop: "1px solid #1f2937" }}>
                <td style={{ padding: "10px 12px", color: "#e6edf3" }}>
                  <div style={{ fontWeight: 700 }}>{p.title}</div>
                  <div style={{ fontSize: "0.74rem", color: "#8b949e" }}>{p.processNumber || "Sem número"}</div>
                </td>
                <td data-label="Setor" style={{ padding: "10px 12px", color: "#e6edf3" }}>{p.setor || "—"}</td>
                <td data-label="Tipo" style={{ padding: "10px 12px", color: "#e6edf3" }}>{p.type || "—"}</td>
                <td data-label="Vencimento" style={{ padding: "10px 12px", color: "#e6edf3" }}>
                  {formatDateForPrint(p.dueDate)}
                </td>
                <td data-label="Status" style={{ padding: "10px 12px", color: "#e6edf3" }}>{p.statusLabel}</td>
                <td className="report-print-hidden" data-label="Progresso" style={{ padding: "10px 12px", color: "#e6edf3" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 120, height: 8, borderRadius: 99, background: "#1f2937", overflow: "hidden" }}>
                      <div style={{ width: `${p.progress}%`, height: "100%", background: p.status === "archived" ? "#3fb950" : "#58a6ff" }} />
                    </div>
                    <span style={{ fontSize: "0.78rem", color: "#8b949e" }}>{p.progress}%</span>
                  </div>
                </td>
                <td className="report-print-hidden" data-label="Docs" style={{ padding: "10px 12px", color: "#e6edf3" }}>{p.totalDocs}</td>
              </tr>
            ))}
            {filteredProcesses.length === 0 && (
              <tr>
                <td colSpan="7" style={{ padding: "16px", textAlign: "center", color: "#8b949e" }}>Nenhum processo encontrado com os filtros selecionados.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Dashboard({ columns, archived }) {
  const getRegDocs = (c) => normalizeDocs(c.docs || []).filter(d => d.type === "doc");

  const ativos     = columns.length;
  const concluidos = archived.length;

  const bySetor = {};
  columns.forEach(c => {
    const setor = c.setor?.trim() || "Sem setor";
    if (!bySetor[setor]) bySetor[setor] = { setor, count: 0 };
    bySetor[setor].count++;
  });
  const setorData = Object.values(bySetor).sort((a, b) => b.count - a.count);

  return (
    <div className="dashboard">

      {/* Cards: ativos e concluídos */}
      <div className="dash-cards-row">
        <div className="dash-count-card" style={{ borderLeftColor:"#58a6ff" }}>
          <span className="dash-count-value" style={{ color:"#58a6ff" }}>{ativos}</span>
          <span className="dash-count-label">Processos Ativos</span>
        </div>
        <div className="dash-count-card" style={{ borderLeftColor:"#3fb950" }}>
          <span className="dash-count-value" style={{ color:"#3fb950" }}>{concluidos}</span>
          <span className="dash-count-label">Concluídos</span>
        </div>
      </div>

      {/* Progresso por processo ativo */}
      <div className="dash-section">
        <h3 className="dash-title">Progresso dos Processos Ativos</h3>
        {columns.length === 0 ? (
          <p style={{ fontSize:"0.85rem", color:"#8b949e" }}>Nenhum processo ativo.</p>
        ) : (
          <div className="dash-process-progress-list">
            {columns.map(c => {
              const docs  = getRegDocs(c);
              const done  = docs.filter(d => d.done).length;
              const total = docs.length;
              const p     = total ? Math.round((done / total) * 100) : 0;
              const color = p === 100 ? "#3fb950" : c.typeColor || "#f0883e";
              return (
                <div key={c.id} className="dash-process-progress-item">
                  <div className="dash-process-progress-header">
                    <span className="dash-process-progress-name">{c.title}</span>
                    <span className="dash-process-progress-pct" style={{ color }}>{p}%</span>
                  </div>
                  <div className="dash-process-progress-bar">
                    <div style={{ height:"100%", width:`${p}%`, background: color, borderRadius:99, transition:"width 1s cubic-bezier(.4,0,.2,1)" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Calendário de Vencimentos */}
      <div className="dash-section">
        <h3 className="dash-title">Calendário de Vencimentos</h3>
        <ProcessCalendar columns={columns} />
      </div>

      {/* Pizza por setor */}
      <div className="dash-section">
        <h3 className="dash-title">Processos por Setor</h3>
        <SetorPieChart data={setorData} />
      </div>

    </div>
  );
}

// ── NewProcessModal ───────────────────────────────────────────────────────────

function NewProcessModal({ templates, onAdd, onClose, sectors = [] }) {
  const orderedTypes = useMemo(() => orderedTemplateTypeNames(templates), [templates]);
  const [selectedType, setSelectedType] = useState("");
  const [customTitle, setCustomTitle]   = useState("");
  const [processNumber, setProcessNumber] = useState("");
  const [setor, setSetor]               = useState("");
  const [dueDate, setDueDate]           = useState("");

  useEffect(() => {
    const first = orderedTypes[0] || "";
    if (!orderedTypes.includes(selectedType)) setSelectedType(first);
  }, [orderedTypes, selectedType]);

  const title = customTitle.trim() || selectedType;
  const canSubmit = title && processNumber.trim() && setor.trim() && dueDate;

  const handleAdd = () => {
    if (!canSubmit) return;
    const tpl     = selectedType ? templates[selectedType] : null;
    const rawItems = tpl ? tmplItems(tpl) : [];
    const docs = rawItems.map(item => {
      if (typeof item === "string") return { id: generateId(), type: "doc", name: item, done: false, bgColor: null };
      if (item.type === "phase")   return { id: generateId(), type: "phase", name: item.name, bgColor: item.bgColor || PHASE_COLORS[0] };
      return { id: generateId(), type: "doc", name: item.name, done: false, bgColor: item.bgColor || null };
    });
    const typeColor = selectedType ? tmplColor(selectedType, templates[selectedType]) : "#30363d";
    onAdd({ id: generateId(), title, processNumber: processNumber.trim(), setor: setor.trim(), type: selectedType || null, typeColor, dueDate, docs });
    onClose();
  };

  const previewColor = selectedType ? tmplColor(selectedType, templates[selectedType]) : "#30363d";
  const required = <span style={{ color: "#f85149", marginLeft: 2 }}>*</span>;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal sm-modal">
        <div className="modal-header">
          <h2>Novo Processo</h2>
          <button className="icon-btn" onClick={onClose}><IconClose /></button>
        </div>
        <div className="modal-body col">
          <label className="field-label">Tipo de processo (modelo){required}</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: previewColor, flexShrink: 0 }} />
            <select className="select-field" value={selectedType} onChange={e => setSelectedType(e.target.value)}>
              {orderedTypes.map(k => <option key={k} value={k}>{k}</option>)}
              <option value="">— Sem modelo —</option>
            </select>
          </div>
          <label className="field-label mt">Número do processo{required}</label>
          <input className="doc-input" placeholder="Ex: 001/2026" value={processNumber}
            onChange={e => setProcessNumber(e.target.value.replace(/[^0-9./-]/g, ""))}
            onKeyDown={e => e.key === "Enter" && handleAdd()} />
          <label className="field-label mt">Órgão / Setor solicitante{required}</label>
          {sectors.length > 0 ? (
            <select className="select-field" value={setor} onChange={e => setSetor(e.target.value)} required>
              <option value="">Selecione o setor...</option>
              {sectors.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          ) : (
            <p style={{ fontSize: "0.78rem", color: "#8b949e", padding: "8px 0" }}>
              Nenhum setor cadastrado. Um administrador precisa cadastrá-los na seção Administração → Setores.
            </p>
          )}
          <label className="field-label mt">Data de Vencimento{required}</label>
          <input
            className="doc-input"
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            style={{ colorScheme: "dark" }}
          />
          <label className="field-label mt">Título personalizado{required}</label>
          <input className="doc-input" placeholder={selectedType || "Ex: Pregão 001-2026"} value={customTitle} onChange={e => setCustomTitle(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAdd()} />
          <p className="hint">Título final: <strong>{title || "—"}</strong></p>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel-lg" onClick={onClose}>Cancelar</button>
          <button className="btn-save" onClick={handleAdd} disabled={!canSubmit}>Criar Processo</button>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function ProcessosPage({
  columns, archived, templates, sortedColumns,
  activeTab, setActiveTab,
  showNewProcess, setShowNewProcess,
  addColumn, updateDocs,
  deleteColumn, renameColumn, archiveColumn,
  unarchiveColumn, deleteArchived,
  sectors = [],
  isViewer,
}) {
  const TABS = [
    { id: "board",    label: "Processos" },
    { id: "reports",  label: "Relatórios" },
    { id: "archive",  label: "Finalizados" },
    { id: "dashboard",label: "Dashboard" },
  ];

  return (
    <>
      <nav className="tabs">
        {TABS.map(t => (
          <button key={t.id} className={`tab-btn ${activeTab === t.id ? "active" : ""}`} onClick={() => setActiveTab(t.id)}>{t.label}</button>
        ))}
      </nav>

      {activeTab === "board" && (
        columns.length === 0 ? (
          <div className="empty-board">
            <h2>Nenhum processo ainda</h2>
            <p>{isViewer ? "Nenhum processo ativo no momento." : "Clique em Novo Processo para começar."}</p>
            {!isViewer && <button className="btn-primary" onClick={() => setShowNewProcess(true)}><IconPlus /> Criar primeiro processo</button>}
          </div>
        ) : (
          <div className="board">
            {sortedColumns.map(col => (
              <ProcessColumn key={col.id} column={col}
                onUpdateDocs={updateDocs} onDeleteColumn={deleteColumn}
                onRenameColumn={renameColumn} onArchive={archiveColumn}
                isViewer={isViewer} />
            ))}
          </div>
        )
      )}

      {activeTab === "reports" && <ProcessReports columns={columns} archived={archived} sectors={sectors} />}

      {activeTab === "archive" && (
        archived.length === 0 ? (
          <div className="empty-board">
            <h2>Nenhum processo finalizado</h2>
            <p>Processos concluídos podem ser finalizados para manter o histórico sem poluir o board.</p>
          </div>
        ) : (
          <div className="archive-grid">
            {archived.map(col => (
              <ArchivedCard key={col.id} column={col} onUnarchive={unarchiveColumn} onDelete={deleteArchived} isViewer={isViewer} />
            ))}
          </div>
        )
      )}

      {activeTab === "dashboard" && <Dashboard columns={columns} archived={archived} />}

      {showNewProcess && <NewProcessModal templates={templates} onAdd={addColumn} onClose={() => setShowNewProcess(false)} sectors={sectors} />}
    </>
  );
}
