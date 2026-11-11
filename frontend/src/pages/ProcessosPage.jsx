import ProcessCalendar from "../components/ProcessCalendar";
import "./ProcessReports.css";
import { formatDate, usePreferences } from "../preferences";
import { downloadCsv } from "../exportTable";
import { Fragment, useState, useEffect, useRef, useMemo } from "react";
import { Toast, useToast } from "../components/Toast";
import { clearedStartedField } from "../processRules";
import {
  IconPlus, IconTrash, IconEdit, IconClose, IconCheck,
  IconUnarchive, IconChevron, IconCalendar, IconFlag,
  IconMaximize, IconMinimize,
} from "../icons";
import {
  PHASE_COLORS, orderedTemplateTypeNames,
  tmplItems, tmplColor, generateId,
  normalizeDocs, groupByPhase,
} from "../utils";

// ── DocCard ───────────────────────────────────────────────────────────────────

function DocCard({ doc, onToggle, onDelete, isViewer }) {
  return (
    // Cor do documento em tom pastel: fundo claro na cor escolhida e barra lateral mais viva.
    <div className={`doc-card ${doc.done ? "done" : ""} ${doc.bgColor ? "doc-pastel" : ""}`} style={doc.bgColor ? { "--doc-color": doc.bgColor } : {}}>
      <button className="check-btn" aria-label={`${doc.done ? "Desmarcar" : "Concluir"} ${doc.name}`} aria-pressed={doc.done} onClick={() => !isViewer && onToggle(doc.id)} disabled={isViewer}>
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

// Preferência "esconder concluídos": some com os documentos marcados e deixa só um aviso discreto.
const HiddenDone = ({ count }) => count > 0 ? <p className="docs-hidden-done">✓ {count} {count === 1 ? "concluído oculto" : "concluídos ocultos"}</p> : null;

function PhaseCard({ phase, docs, onToggleDoc, onDeleteDoc, onDeletePhase, onRenamePhase, isViewer, hideDone }) {
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
      <div className="phase-header" style={{ background: bgColor, "--phase-color": bgColor }}>
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
            <button className="icon-btn sm" onClick={() => onDeletePhase(phase.id)} title="Excluir fase"><IconTrash /></button>
          )}
          <button className="icon-btn sm" onClick={() => setCollapsed(p => !p)} title={collapsed ? "Expandir" : "Recolher"}>
            <IconChevron down={!collapsed} />
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="phase-docs">
          {(hideDone ? docs.filter(doc => !doc.done) : docs).map(doc => (
            <DocCard key={doc.id} doc={doc} onToggle={onToggleDoc} onDelete={onDeleteDoc} isViewer={isViewer} />
          ))}
          {docs.length === 0 && <p className="phase-empty">Nenhum documento nesta fase.</p>}
          {hideDone && <HiddenDone count={doneCnt} />}
        </div>
      )}
    </div>
  );
}

// ── ProcessColumn ─────────────────────────────────────────────────────────────

function ProcessColumn({ column, onUpdateDocs, onDeleteColumn, onRenameColumn, onArchive, onInvalidEdit, isViewer, templates = {}, collaborators = [] }) {
  const hideDone = usePreferences().preferences.hideDoneDocs;
  const [addingItem, setAddingItem]     = useState(null);
  const [newName, setNewName]           = useState("");
  const [phaseColorIdx, setPhaseColorIdx] = useState(0);
  const [archiving, setArchiving]       = useState(false);
  const [editingProcess, setEditingProcess] = useState(false);
  const [editTitle, setEditTitle] = useState(column.title || "");
  const [editProcessNumber, setEditProcessNumber] = useState(column.processNumber || "");
  const [editSetor, setEditSetor] = useState(column.setor || "");
  const [editDueDate, setEditDueDate] = useState(String(column.dueDate || "").slice(0, 10));
  const [editType, setEditType] = useState(column.type || "");
  const inputRef = useRef();
  const orderedTypes = useMemo(() => orderedTemplateTypeNames(templates), [templates]);
  const collaboratorNames = useMemo(() => {
    const names = collaborators.map(collaborator => collaborator?.nome?.trim()).filter(Boolean);
    const current = column.setor?.trim();
    if (current) names.push(current);
    return [...new Set(names)].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [collaborators, column.setor]);

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
  }, [isComplete, archiving, column.id, isViewer, onArchive]);

  useEffect(() => {
    if (!editingProcess) {
      setEditTitle(column.title || "");
      setEditProcessNumber(column.processNumber || "");
      setEditSetor(column.setor || "");
      setEditDueDate(String(column.dueDate || "").slice(0, 10));
      setEditType(column.type || "");
    }
  }, [column.title, column.processNumber, column.setor, column.dueDate, column.type, editingProcess]);

  const saveProcess = () => {
    const title = editTitle.trim();
    if (!title) return;
    const selectedType = editType?.trim() || null;
    // O quadro grava sem esperar o servidor: o que ele recusaria é barrado aqui, com aviso, e o formulário fica aberto.
    const problem = clearedStartedField(column, { processNumber: editProcessNumber, dueDate: editDueDate, type: selectedType });
    if (problem) { onInvalidEdit(problem); return; }
    const selectedTypeColor = selectedType ? tmplColor(selectedType, templates[selectedType]) : (column.typeColor || "#30363d");
    const typeChanged = selectedType !== (column.type || null);
    const nextDocs = typeChanged && selectedType && templates[selectedType]
      ? tmplItems(templates[selectedType]).map((item, index) => ({
          id: generateId(),
          type: item.type || "doc",
          name: item.name,
          done: false,
          bgColor: item.bgColor || null,
          order: index,
        }))
      : normalizeDocs(column.docs || []);

    onRenameColumn(column.id, {
      title,
      processNumber: editProcessNumber.trim(),
      setor: editSetor.trim(),
      type: selectedType,
      typeColor: selectedTypeColor,
      dueDate: editDueDate || null,
      docs: nextDocs,
    });
    setEditingProcess(false);
  };

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
    <div className={`column ${isComplete ? "complete" : ""} ${archiving ? "archiving" : ""} ${editingProcess ? "editing-process" : ""}`} style={{ borderColor, "--process-color": borderColor }}>
      {isComplete && !archiving && <div className="complete-overlay" />}
      <div className="column-header" style={{ borderBottom: `1px solid ${borderColor}33` }}>
        <div className="col-type-stripe" style={{ background: borderColor }} />
        <div className="column-title-row">
          <h3 className="column-title" style={isViewer ? { cursor: "default" } : {}}>{column.title}</h3>
          {!isViewer && (
            <details className="process-actions-menu">
              <summary aria-label={`Ações do processo ${column.title}`}>•••</summary>
              <div className="process-actions-options">
              <button className="icon-btn sm" onClick={event => {
                event.currentTarget.closest("details")?.removeAttribute("open");
                setEditTitle(column.title || "");
                setEditProcessNumber(column.processNumber || "");
                setEditSetor(column.setor || "");
                setEditDueDate(String(column.dueDate || "").slice(0, 10));
                setEditType(column.type || "");
                setEditingProcess(true);
              }} title="Editar processo"><IconEdit /></button>
              <button className="icon-btn danger sm" onClick={() => onDeleteColumn(column.id)} title="Excluir"><IconTrash /></button>
              </div>
            </details>
          )}
        </div>
        {column.setor && <div className="process-setor">{column.setor}</div>}
        {column.processNumber && <div className="process-number">Nº {column.processNumber}</div>}
        <p className="process-progress-caption">Progresso</p>
        <div className="progress-row">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${pct}%`, background: borderColor }} />
          </div>
          <span className="progress-label">{pct}%</span>
        </div>
        {isComplete && <div className="complete-badge">✓ Concluído {isViewer ? "" : "— finalizando…"}</div>}
      </div>

      {editingProcess && !isViewer && (
        <form className="process-edit-panel" onSubmit={event => { event.preventDefault(); saveProcess(); }} onKeyDown={event => { if (event.key === "Escape") setEditingProcess(false); }}>
          <div className="process-edit-heading">
            <div><h4>Editar processo</h4><p>Atualize as informações abaixo.</p></div>
            <button type="button" className="icon-btn" aria-label="Fechar edição" onClick={() => setEditingProcess(false)}><IconClose /></button>
          </div>
          <div className="process-edit-fields">
            <label className="process-edit-field">Nome do processo
              <input className="doc-input" value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Nome do processo" required autoFocus />
            </label>
            <label className="process-edit-field">Número do processo
              <input className="doc-input" value={editProcessNumber} onChange={e => setEditProcessNumber(e.target.value)} placeholder="Ex.: 001/2026" />
            </label>
            <label className="process-edit-field">Gestor Principal
              <span className="process-edit-control">
                <select className="doc-input process-edit-select" value={editSetor} onChange={e => setEditSetor(e.target.value)}>
                  <option value="">Selecione o gestor principal...</option>
                  {collaboratorNames.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
                <span className="process-edit-control-icon" aria-hidden="true"><IconChevron down /></span>
              </span>
            </label>
            <label className="process-edit-field">Data de vencimento
              <span className="process-edit-control">
                <input className="doc-input process-edit-date" type="date" value={editDueDate} onChange={e => setEditDueDate(e.target.value)} />
                <span className="process-edit-control-icon" aria-hidden="true"><IconCalendar /></span>
              </span>
            </label>
            <label className="process-edit-field">Tipo de processo
              <span className="process-edit-control">
                <select className="doc-input process-edit-select" value={editType} onChange={e => setEditType(e.target.value)}>
                  <option value="">Sem tipo</option>
                  {orderedTypes.map(typeName => <option key={typeName} value={typeName}>{typeName}</option>)}
                </select>
                <span className="process-edit-control-icon" aria-hidden="true"><IconChevron down /></span>
              </span>
            </label>
          </div>
          <div className="process-edit-footer">
            <button type="button" className="process-edit-cancel" onClick={() => setEditingProcess(false)}>Cancelar</button>
            <button type="submit" className="process-edit-save" disabled={!editTitle.trim()}><IconCheck /> Salvar alterações</button>
          </div>
        </form>
      )}

      <div className="docs-list">
        {groups.map((group, gi) => (
          group.phase ? (
            <PhaseCard key={group.phase.id} phase={group.phase} docs={group.docs}
              onToggleDoc={toggleDoc} onDeleteDoc={deleteDoc}
              onRenameDoc={renameDoc} onChangeDocColor={() => {}}
              onDeletePhase={deletePhase} onRenamePhase={renamePhase} isViewer={isViewer} hideDone={hideDone} />
          ) : (
            <Fragment key={`loose-${gi}`}>
              {(hideDone ? group.docs.filter(doc => !doc.done) : group.docs).map(doc => (
                <DocCard key={doc.id} doc={doc} onToggle={toggleDoc} onDelete={deleteDoc} isViewer={isViewer} />
              ))}
              {hideDone && <HiddenDone count={group.docs.filter(doc => doc.done).length} />}
            </Fragment>
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

export function SetorPieChart({ data }) {
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
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", padding:"32px 0", color:"var(--muted)", fontSize:"0.85rem" }}>
        Nenhum processo ativo com gestor principal definido.
      </div>
    );
  }

  return (
    <div className="dash-pie-wrap">
      <svg className="dash-pie-chart" width={180} height={180} viewBox="0 0 180 180">
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
            <text x={cx} y={cy - 8} textAnchor="middle" fill="var(--text)" fontSize="20" fontWeight="700" fontFamily="'Outfit',sans-serif">{slices[hovered]?.count}</text>
            <text x={cx} y={cy + 10} textAnchor="middle" fill="var(--muted)" fontSize="9" fontFamily="'Nunito Sans',sans-serif"
              style={{ dominantBaseline:"middle" }}>
              {slices[hovered]?.setor.length > 14 ? slices[hovered]?.setor.slice(0,13)+"…" : slices[hovered]?.setor}
            </text>
          </>
        ) : (
          <>
            <text x={cx} y={cy - 8} textAnchor="middle" fill="var(--text)" fontSize="22" fontWeight="700" fontFamily="'Outfit',sans-serif">{total}</text>
            <text x={cx} y={cy + 10} textAnchor="middle" fill="var(--muted)" fontSize="10" fontFamily="'Nunito Sans',sans-serif">processos</text>
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

const IconChevronDown = ({ size = 14, className }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
);
const IconCheckMark = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
);

function Select({ label, value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    function handleKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  const current = options.find((o) => o.value === value);

  return (
    <div className="rp-field" ref={ref}>
      <span className="rp-field-label">{label}</span>
      <button type="button" className={`rp-select ${open ? "open" : ""}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>{current ? current.label : options[0]?.label}</span>
        <IconChevronDown className="rp-select-chevron" />
      </button>
      {open && (
        <div className="rp-menu" role="listbox" aria-label={label}>
          {options.map((o) => {
            const selected = o.value === value;
            return (
              <button type="button" role="option" aria-selected={selected} key={o.value} className={selected ? "selected" : ""} onClick={() => { onChange(o.value); setOpen(false); }}>
                <span>{o.label}</span>
                {selected && <IconCheckMark />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const PERIODS = [
  { value: "all", label: "Todo o período" },
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
  { value: "365", label: "Últimos 12 meses" },
  { value: "year", label: "Este ano" },
];
const SITUATIONS = {
  done: { label: "Concluído", plural: "Concluídos", color: "#16a34a" },
  progress: { label: "Em andamento", plural: "Em andamento", color: "#2563eb" },
  pending: { label: "Pendente", plural: "Pendentes", color: "#d97706" },
};
const DUE_FILTERS = [
  { value: "all", label: "Todos os vencimentos" },
  { value: "overdue", label: "Vencidos" },
  { value: "today", label: "Vence hoje" },
  { value: "week", label: "Próximos 7 dias" },
  { value: "month", label: "Em 8 a 30 dias" },
  { value: "later", label: "Após 30 dias" },
  { value: "none", label: "Sem data" },
];
const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const MONTH_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const CHART_MONTHS = 7;
const toDate = value => {
  if (!value) return null;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
  return Number.isFinite(date.getTime()) ? date : null;
};
const formatPercent = (part, total) => `${(total ? (part / total) * 100 : 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

function ProcessReports({ columns, archived }) {
  const exportFormat = usePreferences().preferences.exportFormat === "pdf" ? "pdf" : "csv";
  const allProcesses = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return [...columns, ...archived].map(c => {
      const regularDocs = normalizeDocs(c.docs || []).filter(d => d.type === "doc");
      const doneDocs = regularDocs.filter(d => d.done).length;
      const totalDocs = regularDocs.length;
      const dueDate = toDate(c.dueDate);
      const overdue = !!dueDate && dueDate < today;
      const dueDays = dueDate ? Math.round((dueDate - today) / 86400000) : null;
      const dueStatus = dueDays === null ? "none" : dueDays < 0 ? "overdue" : dueDays === 0 ? "today" : dueDays <= 7 ? "week" : dueDays <= 30 ? "month" : "later";
      const situation = c.status === "archived" ? "done" : (overdue || doneDocs === 0) ? "pending" : "progress";
      return {
        ...c,
        totalDocs,
        doneDocs,
        progress: totalDocs === 0 ? 0 : Math.round((doneDocs / totalDocs) * 100),
        situation,
        overdue,
        dueStatus,
        // "Criado" nos relatórios é quando o trabalho começou: a data de início da demanda.
        createdDate: toDate(c.startedAt || c.createdAt),
        archivedDate: c.status === "archived" ? toDate(c.archivedAt) : null,
      };
    });
  }, [columns, archived]);

  const [periodFilter, setPeriodFilter] = useState("all");
  const [setorFilter, setSetorFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dueFilter, setDueFilter] = useState("all");
  const [situationFilter, setSituationFilter] = useState("all");
  const [hoveredMonth, setHoveredMonth] = useState(null);


  const uniqueSectors = useMemo(() => [...new Set(allProcesses.map(p => p.setor).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [allProcesses]);
  const uniqueTypes = useMemo(() => [...new Set(allProcesses.map(p => p.type).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [allProcesses]);

  // Gestor principal, tipo, vencimento e situação valem para tudo; o período recorta pela data de criação.
  const scoped = useMemo(() => allProcesses.filter(p =>
    (setorFilter === "all" || p.setor === setorFilter) &&
    (typeFilter === "all" || p.type === typeFilter) &&
    (dueFilter === "all" || p.dueStatus === dueFilter) &&
    (situationFilter === "all" || p.situation === situationFilter)
  ), [allProcesses, setorFilter, typeFilter, dueFilter, situationFilter]);

  const filteredProcesses = useMemo(() => {
    if (periodFilter === "all") return scoped;
    const now = new Date();
    const start = periodFilter === "year" ? new Date(now.getFullYear(), 0, 1) : new Date(now.getTime() - Number(periodFilter) * 86400000);
    // Processos sem data de criação (recém-criados nesta sessão) contam como atuais.
    return scoped.filter(p => !p.createdDate || p.createdDate >= start);
  }, [scoped, periodFilter]);
  // PDF: impressão do próprio relatório (com cabeçalho e resumo); CSV: a tabela detalhada.
  const exportReport = () => {
    if (exportFormat === "pdf") { window.print(); return; }
    downloadCsv(`relatorio-processos-${new Date().toISOString().slice(0, 10)}.csv`,
      ["Nº do processo", "Processo", "Gestor Principal", "Tipo", "Vencimento", "Situação", "Itens concluídos", "Checklist (%)"],
      filteredProcesses.map(p => [p.processNumber || "", p.title || "", p.setor || "", p.type || "", p.dueDate ? new Date(`${String(p.dueDate).slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR") : "", SITUATIONS[p.situation]?.label || "", `${p.doneDocs}/${p.totalDocs}`, p.progress]));
  };

  const counts = { done: 0, progress: 0, pending: 0 };
  filteredProcesses.forEach(p => { counts[p.situation]++; });
  const total = filteredProcesses.length;

  const chart = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: CHART_MONTHS }, (_, i) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (CHART_MONTHS - 1 - i), 1);
      return { key: `${date.getFullYear()}-${date.getMonth()}`, label: MONTH_ABBR[date.getMonth()], month: date.getMonth(), year: date.getFullYear(), start: date, end: new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59), active: 0, created: 0, completed: 0 };
    });
    const byKey = new Map(months.map(m => [m.key, m]));
    const monthOf = date => date && byKey.get(`${date.getFullYear()}-${date.getMonth()}`);
    scoped.forEach(p => {
      const created = monthOf(p.createdDate);
      if (created) created.created++;
      const completed = monthOf(p.archivedDate);
      if (completed) completed.completed++;
      // Ativo no mês: já existia (criado até o fim do mês) e não estava concluído antes do começo dele.
      if (p.createdDate) months.forEach(m => { if (p.createdDate <= m.end && (!p.archivedDate || p.archivedDate >= m.start)) m.active++; });
    });
    const max = Math.max(1, ...months.flatMap(m => [m.active, m.created, m.completed]));
    return { months, max };
  }, [scoped]);

  const printFilterSummary = [
    periodFilter !== "all" && `Período: ${PERIODS.find(p => p.value === periodFilter)?.label}`,
    setorFilter !== "all" && `Gestor Principal: ${setorFilter}`,
    typeFilter !== "all" && `Tipo: ${typeFilter}`,
    dueFilter !== "all" && `Vencimento: ${DUE_FILTERS.find(d => d.value === dueFilter)?.label}`,
    situationFilter !== "all" && `Situação: ${SITUATIONS[situationFilter].label}`,
  ].filter(Boolean).join("  •  ");

  const kpis = [
    { label: "Processos acompanhados", value: total, tone: "blue" },
    { label: SITUATIONS.done.plural, value: counts.done, tone: "green" },
    { label: SITUATIONS.progress.plural, value: counts.progress, tone: "blue" },
    { label: SITUATIONS.pending.plural, value: counts.pending, tone: "amber" },
  ];

  return (
    <div className="report-view">
      <div className="report-print-header" aria-hidden="true">
        <div className="report-print-brand">
          <div className="report-print-name"><span className="report-print-accent">Licit</span>Kanban</div>
          <div className="report-print-brand-subtitle">Gestão inteligente de licitações</div>
        </div>
        <img className="report-print-logo" src="/image/LogoCRCPI.png" alt="Logo LicitKanban" />
        <div className="report-print-title">
          Relatório de Processos
          <span className="report-print-date">Emitido em {new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
        </div>
      </div>
      <div className="report-print-summary" aria-hidden="true">
        <span><strong>{total}</strong> {total === 1 ? "processo listado" : "processos listados"}</span>
        <span className="report-print-filter-text">{printFilterSummary || "Todos os registros · sem filtros aplicados"}</span>
      </div>

      <section className="rp-card rp-filters" aria-label="Filtros do relatório">
        <Select label="Período" value={periodFilter} onChange={setPeriodFilter} options={PERIODS} />
        <Select label="Gestor Principal" value={setorFilter} onChange={setSetorFilter} options={[{ value: "all", label: "Todos os gestores" }, ...uniqueSectors.map(s => ({ value: s, label: s }))]} />
        <Select label="Tipo" value={typeFilter} onChange={setTypeFilter} options={[{ value: "all", label: "Todos os tipos" }, ...uniqueTypes.map(t => ({ value: t, label: t }))]} />
        <Select label="Vencimento" value={dueFilter} onChange={setDueFilter} options={DUE_FILTERS} />
        <Select label="Situação" value={situationFilter} onChange={setSituationFilter} options={[{ value: "all", label: "Todas as situações" }, ...Object.entries(SITUATIONS).map(([value, s]) => ({ value, label: s.label }))]} />
        <button type="button" className="rp-export" onClick={exportReport} title={`Formato ${exportFormat.toUpperCase()}. Muda em Meu perfil › Preferências.`}>Exportar {exportFormat.toUpperCase()}</button>
      </section>

      <section className="lk-kpis rp-kpis" aria-label="Resumo">
        {kpis.map(k => (
          <article className={`lk-kpi ${k.tone}`} key={k.label}>
            <h2><i aria-hidden="true" />{k.label.toUpperCase()}</h2>
            <strong>{k.value}</strong>
          </article>
        ))}
      </section>

      <div className="rp-charts">
        <section className="rp-card rp-panel rp-evolution">
          <header className="rp-panel-heading">
            <div><h2>Evolução dos processos</h2><p>Processos ativos, criados e concluídos em cada mês</p></div>
            <div className="rp-legend" aria-hidden="true"><span><i className="active" />Ativos no mês</span><span><i className="created" />Criados</span><span><i className="completed" />Concluídos</span></div>
          </header>
          <div className="rp-bars" onMouseLeave={() => setHoveredMonth(null)}>
            {chart.months.map((m, i) => (
              <button
                type="button"
                className={`rp-bar-group ${hoveredMonth === i ? "active" : ""} ${hoveredMonth !== null && hoveredMonth !== i ? "dimmed" : ""}`}
                key={m.key}
                aria-label={`${MONTH_NAMES[m.month]} de ${m.year}: ${m.active} ${m.active === 1 ? "ativo" : "ativos"}, ${m.created} ${m.created === 1 ? "criado" : "criados"}, ${m.completed} ${m.completed === 1 ? "concluído" : "concluídos"}`}
                onMouseEnter={() => setHoveredMonth(i)}
                onFocus={() => setHoveredMonth(i)}
                onBlur={() => setHoveredMonth(null)}
                onClick={() => setHoveredMonth(hoveredMonth === i ? null : i)}
              >
                {hoveredMonth === i && (
                  <span className={`rp-tooltip ${i === 0 ? "start" : i === chart.months.length - 1 ? "end" : ""}`} role="tooltip">
                    <strong>{MONTH_NAMES[m.month]} de {m.year}</strong>
                    <span><i className="active" />Ativos no mês<b>{m.active}</b></span>
                    <span><i className="created" />Criados<b>{m.created}</b></span>
                    <span><i className="completed" />Concluídos<b>{m.completed}</b></span>
                    {m.created > 0 && <small>{formatPercent(m.completed, m.created)} de conclusão no mês</small>}
                  </span>
                )}
                <span className="rp-bar-pair">
                  <span className="rp-bar active" style={{ height: `${(m.active / chart.max) * 100}%` }}>{m.active > 0 && <em>{m.active}</em>}</span>
                  <span className="rp-bar created" style={{ height: `${(m.created / chart.max) * 100}%` }}>{m.created > 0 && <em>{m.created}</em>}</span>
                  <span className="rp-bar completed" style={{ height: `${(m.completed / chart.max) * 100}%` }}>{m.completed > 0 && <em>{m.completed}</em>}</span>
                </span>
                <span className="rp-bar-label">{m.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="rp-card rp-panel rp-situation">
          <header className="rp-panel-heading"><div><h2>Situação dos processos</h2></div></header>
          <ul>
            {Object.entries(SITUATIONS).map(([key, s]) => (
              <li key={key}>
                <i style={{ background: s.color }} aria-hidden="true" />
                <span className="rp-situation-name">{s.plural}</span>
                <strong>{counts[key]}</strong>
                <span className="rp-situation-pct">{formatPercent(counts[key], total)}</span>
                <span className="rp-situation-bar" aria-hidden="true"><span style={{ width: `${total ? (counts[key] / total) * 100 : 0}%`, background: s.color }} /></span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rp-card rp-panel rp-detail">
        <header className="rp-panel-heading"><div><h2>Relatório detalhado</h2><p>Dados consolidados dos processos</p></div></header>
        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr><th>Processo</th><th>Gestor Principal</th><th>Tipo</th><th>Vencimento</th><th>Situação</th><th>Checklist</th></tr>
            </thead>
            <tbody>
              {filteredProcesses.map(p => {
                const s = SITUATIONS[p.situation];
                return (
                  <tr key={p.id}>
                    <td className="rp-process"><strong>{p.processNumber || p.title}</strong>{p.processNumber && <small>{p.title}</small>}</td>
                    <td data-label="Gestor Principal">{p.setor || "—"}</td>
                    <td data-label="Tipo">{p.type || "—"}</td>
                    <td data-label="Vencimento" className={p.situation !== "done" && p.overdue ? "rp-overdue" : ""}>{p.dueDate ? <time dateTime={p.dueDate}>{formatDate(p.dueDate)}</time> : "—"}</td>
                    <td data-label="Situação" className="rp-status">{s.label}</td>
                    <td data-label="Checklist">
                      <div className="rp-checklist">
                        <span className="rp-track" role="progressbar" aria-valuemin={0} aria-valuemax={p.totalDocs} aria-valuenow={p.doneDocs} aria-label={`${p.doneDocs} de ${p.totalDocs} itens concluídos`}>
                          <span style={{ width: `${p.totalDocs ? (p.doneDocs / p.totalDocs) * 100 : 0}%`, background: s.color }} />
                        </span>
                        <span className="rp-count">{p.progress}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {total === 0 && <tr><td colSpan="6" className="rp-empty">Nenhum processo encontrado com os filtros selecionados.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export function ActiveProcessProgress({ columns, sortedColumns = [] }) {
  const getRegDocs = (c) => normalizeDocs(c.docs || []).filter(d => d.type === "doc");
  const formatDayMonth = (value) => {
    if (!value) return "—";
    const [year, month, day] = String(value).split("-");
    return year && month && day ? `${day}/${month}` : value;
  };

  const sortedColumnsForReport = sortedColumns.length
    ? sortedColumns
    : [...columns].sort((a, b) => (a.title || "").localeCompare(b.title || "", "pt-BR", { sensitivity: "base" }));

  return (columns.length === 0 ? (
            <p style={{ fontSize:"0.85rem", color:"var(--muted)" }}>Nenhum processo ativo.</p>
          ) : (
            <div className="dash-process-progress-list">
              {sortedColumnsForReport.map(c => {
                const docs  = getRegDocs(c);
                const done  = docs.filter(d => d.done).length;
                const total = docs.length;
                const p     = total ? Math.round((done / total) * 100) : 0;
                const color = p === 100 ? "var(--green)" : c.typeColor || "var(--accent)";
                const dueLabel = formatDayMonth(c.dueDate);
                return (
                  <div key={c.id} className="dash-process-progress-item" style={{ "--bar": color, "--type": c.typeColor || "var(--accent)" }}>
                    <div className="dash-process-progress-header">
                      <span className="dash-process-progress-name">{c.title}</span>
                      <div className="dash-process-progress-meta">
                        <span className="dash-process-progress-pct">{p}%</span>
                        <span className="dash-process-due">{dueLabel}</span>
                      </div>
                    </div>
                    <div className="dash-process-progress-bar">
                      <div className={`dash-process-progress-fill${p === 0 ? " is-zero" : ""}`} style={{ width: `${p}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ));
}

export function DashboardDetails({ columns, archived, sortedColumns = [] }) {

  const ativos     = columns.length;
  const concluidos = archived.length;

  const bySetor = {};
  columns.forEach(c => {
    const setor = c.setor?.trim() || "Sem gestor principal";
    if (!bySetor[setor]) bySetor[setor] = { setor, count: 0 };
    bySetor[setor].count++;
  });
  const setorData = Object.values(bySetor).sort((a, b) => b.count - a.count);


  return (
    <div className="dashboard">

      {/* Cards: ativos e concluídos */}
      <div className="dash-cards-row">
        <div className="dash-count-card" style={{ borderLeftColor:"var(--accent)" }}>
          <span className="dash-count-value" style={{ color:"var(--accent)" }}>{ativos}</span>
          <span className="dash-count-label">Processos Ativos</span>
        </div>
        <div className="dash-count-card" style={{ borderLeftColor:"var(--green)" }}>
          <span className="dash-count-value" style={{ color:"var(--green)" }}>{concluidos}</span>
          <span className="dash-count-label">Concluídos</span>
        </div>
      </div>

      <div className="dash-grid">
        {/* Progresso por processo ativo */}
        <div className="dash-section">
          <h3 className="dash-title">Progresso dos Processos Ativos</h3>
          <ActiveProcessProgress columns={columns} sortedColumns={sortedColumns} />
        </div>

        {/* Pizza por gestor principal */}
        <div className="dash-section">
          <h3 className="dash-title">Processos por Gestor Principal</h3>
          <SetorPieChart data={setorData} />
        </div>
      </div>

    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function ProcessosPage({
  columns, archived, templates, sortedColumns, onDashboard, onOpenMenu, loading, error,
  activeTab, setActiveTab,
  onOpenDemands, updateDocs,
  deleteColumn, renameColumn, archiveColumn,
  unarchiveColumn, deleteArchived,
  collaborators = [],
  isViewer,
}) {
  const boardRef = useRef(null);
  const { toast, notify, closeToast } = useToast();
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const update = () => {
      setCanScrollLeft(board.scrollLeft > 1);
      setCanScrollRight(board.scrollLeft + board.clientWidth < board.scrollWidth - 1);
    };
    const observer = new ResizeObserver(update);
    observer.observe(board);
    board.addEventListener("scroll", update, { passive: true });
    update();
    return () => { observer.disconnect(); board.removeEventListener("scroll", update); };
  }, [activeTab, columns.length, loading, error]);
  const scrollBoard = direction => {
    const board = boardRef.current;
    if (!board) return;
    const cardWidth = board.firstElementChild?.getBoundingClientRect().width || 354;
    const gap = parseFloat(getComputedStyle(board).columnGap) || 14;
    board.scrollBy({ left: direction * (cardWidth + gap), behavior: "smooth" });
  };
  // Tela cheia (como um vídeo): só o quadro de processos ocupa a tela. Esc ou o botão saem.
  const canFullscreen = typeof document !== "undefined" && document.fullscreenEnabled;
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const boardFullscreen = fullscreen && activeTab === "board";
  useEffect(() => {
    document.documentElement.classList.toggle("lk-board-fullscreen", boardFullscreen);
    return () => document.documentElement.classList.remove("lk-board-fullscreen");
  }, [boardFullscreen]);
  // Sai da tela cheia ao trocar de aba ou sair da página.
  useEffect(() => {
    if (activeTab !== "board" && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, [activeTab]);
  useEffect(() => () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  };
  const TABS = [
    { id: "board", label: "Processos" },
    { id: "calendar", label: "Calendário" },
    { id: "reports", label: "Relatórios" },
    { id: "archive", label: "Arquivados" },
  ];

  return (
    <>
      <h1 className="lk-sr">{activeTab === "calendar" ? "Calendário de Processos" : activeTab === "reports" ? "Relatórios" : "Acompanhar Processos"}</h1>
      <header className="process-page-header">
        <div className="process-page-heading">
          <button className="lk-menu" aria-label="Abrir navegação" onClick={onOpenMenu}>☰</button>
        </div>
        <nav className="process-page-tabs" aria-label="Visualização dos processos">
          {TABS.map(t => <button key={t.id} className={activeTab === t.id ? "active" : ""} aria-current={activeTab === t.id ? "page" : undefined} onClick={() => setActiveTab(t.id)}>{t.label}</button>)}
          {canFullscreen && activeTab === "board" && columns.length > 0 && <button className="process-fullscreen-button" aria-label="Ver processos em tela cheia" title="Tela cheia" onClick={toggleFullscreen}><IconMaximize /></button>}
        </nav>
      </header>
      {error && <p className="lk-error" role="alert">{error}</p>}

      {activeTab === "board" && (
        loading ? <p className="lk-empty">Carregando processos…</p> : error ? null : columns.length === 0 ? (
          <div className="empty-board">
            <h2>Nenhum processo ainda</h2>
            <p>{isViewer ? "Nenhum processo ativo no momento." : "Os processos nascem em Demandas e aparecem aqui depois de iniciados."}</p>
            {!isViewer && <button className="btn-primary" onClick={onOpenDemands}>Ir para Demandas</button>}
          </div>
        ) : (
          <div className="process-board-wrap">
          <div className="board" ref={boardRef} aria-label="Quadro de processos" tabIndex={0}>
            {sortedColumns.map(col => (
              <ProcessColumn key={col.id} column={col}
                onUpdateDocs={updateDocs} onDeleteColumn={deleteColumn}
                onRenameColumn={renameColumn} onArchive={archiveColumn}
                onInvalidEdit={(text) => notify("error", "Faltam dados do processo", text)}
                isViewer={isViewer} templates={templates} collaborators={collaborators} />
            ))}
          </div>
          {boardFullscreen && <button className="process-fullscreen-exit" aria-label="Sair da tela cheia" title="Sair da tela cheia (Esc)" onClick={toggleFullscreen}><IconMinimize /> Sair</button>}
          {(canScrollLeft || canScrollRight) && <button disabled={!canScrollLeft} className="process-scroll process-scroll-left" aria-label="Processos anteriores" onClick={() => scrollBoard(-1)}><IconChevron /></button>}
          {(canScrollLeft || canScrollRight) && <button disabled={!canScrollRight} className="process-scroll process-scroll-right" aria-label="Próximos processos" onClick={() => scrollBoard(1)}><IconChevron /></button>}
          </div>
        )
      )}

      {activeTab === "reports" && <ProcessReports columns={columns} archived={archived} />}

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

      {activeTab === "dashboard" && <DashboardDetails columns={columns} archived={archived} sortedColumns={sortedColumns} />}

      {activeTab === "calendar" && (
        loading ? <p className="lk-empty">Carregando calendário…</p> : !error && <ProcessCalendar columns={columns} />
      )}

      <Toast toast={toast} onClose={closeToast} />
    </>
  );
}
