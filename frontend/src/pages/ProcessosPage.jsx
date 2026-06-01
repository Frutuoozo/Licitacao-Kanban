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

function DocCard({ doc, onToggle, onDelete }) {
  return (
    <div className={`doc-card ${doc.done ? "done" : ""}`} style={doc.bgColor ? { background: doc.bgColor } : {}}>
      <button className="check-btn" onClick={() => onToggle(doc.id)}>
        <div className="check-box">{doc.done && <IconCheck />}</div>
      </button>
      <span className="card-name">{doc.name}</span>
      <div className="card-actions">
        <button className="icon-btn danger" onClick={() => onDelete(doc.id)} title="Remover"><IconTrash /></button>
      </div>
    </div>
  );
}

// ── PhaseCard ─────────────────────────────────────────────────────────────────

function PhaseCard({ phase, docs, onToggleDoc, onDeleteDoc, onDeletePhase, onRenamePhase }) {
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
        {editing ? (
          <input ref={inputRef} className="phase-input" value={val} onChange={e => setVal(e.target.value)}
            onBlur={save} onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") { setVal(phase.name); setEditing(false); } }} />
        ) : (
          <span className="phase-name" onClick={() => setEditing(true)}>{phase.name}</span>
        )}
        <span className="phase-count">{doneCnt}/{docs.length}</span>
        {allDone && <span className="phase-done-badge">✓</span>}
        <div className="phase-actions">
          <button className="icon-btn sm" style={{ color: "#fff" }} onClick={() => setEditing(true)} title="Renomear fase"><IconEdit /></button>
          <button className="icon-btn sm" style={{ color: "#fff" }} onClick={() => onDeletePhase(phase.id)} title="Excluir fase"><IconTrash /></button>
          <button className="icon-btn sm" style={{ color: "#fff" }} onClick={() => setCollapsed(p => !p)} title={collapsed ? "Expandir" : "Recolher"}>
            <IconChevron down={!collapsed} />
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="phase-docs">
          {docs.map(doc => (
            <DocCard key={doc.id} doc={doc} onToggle={onToggleDoc} onDelete={onDeleteDoc} />
          ))}
          {docs.length === 0 && <p className="phase-empty">Nenhum documento nesta fase.</p>}
        </div>
      )}
    </div>
  );
}

// ── ProcessColumn ─────────────────────────────────────────────────────────────

function ProcessColumn({ column, onUpdateDocs, onDeleteColumn, onRenameColumn, onArchive }) {
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
    if (isComplete && !archiving) {
      const t = setTimeout(() => {
        setArchiving(true);
        setTimeout(() => onArchive(column.id), 750);
      }, 900);
      return () => clearTimeout(t);
    }
  }, [isComplete, archiving, column.id]);

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
          {editingTitle ? (
            <input className="title-input" value={titleVal} onChange={e => setTitleVal(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={e => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") { setTitleVal(column.title); setEditingTitle(false); } }}
              autoFocus />
          ) : (
            <h3 className="column-title" onClick={() => setEditingTitle(true)}>{column.title}</h3>
          )}
          <div style={{ display: "flex", gap: 2 }}>
            <button className="icon-btn danger sm" onClick={() => onDeleteColumn(column.id)} title="Excluir"><IconTrash /></button>
          </div>
        </div>
        {column.setor && <div className="process-setor">{column.setor}</div>}
        {column.processNumber && <div className="process-number">Nº {column.processNumber}</div>}
        <div className="progress-row">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${pct}%`, background: borderColor }} />
          </div>
          <span className="progress-label">{pct}%</span>
        </div>
        {isComplete && <div className="complete-badge">✓ Concluído — arquivando…</div>}
      </div>

      <div className="docs-list">
        {groups.map((group, gi) => (
          group.phase ? (
            <PhaseCard key={group.phase.id} phase={group.phase} docs={group.docs}
              onToggleDoc={toggleDoc} onDeleteDoc={deleteDoc}
              onRenameDoc={renameDoc} onChangeDocColor={() => {}}
              onDeletePhase={deletePhase} onRenamePhase={renamePhase} />
          ) : (
            group.docs.map(doc => (
              <DocCard key={doc.id} doc={doc} onToggle={toggleDoc} onDelete={deleteDoc} />
            ))
          )
        ))}
      </div>

      {addingItem ? (
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
      )}
    </div>
  );
}

// ── ArchivedCard ──────────────────────────────────────────────────────────────

function ArchivedCard({ column, onUnarchive, onDelete }) {
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
          <div style={{ display: "flex", gap: 4 }}>
            <button className="icon-btn" onClick={() => onUnarchive(column.id)} title="Restaurar"><IconUnarchive /></button>
            <button className="icon-btn danger sm" onClick={() => onDelete(column.id)} title="Excluir"><IconTrash /></button>
          </div>
        </div>
        {column.setor && <div className="process-setor">{column.setor}</div>}
        {column.processNumber && <div className="process-number">Nº {column.processNumber}</div>}
        <div className="progress-row" style={{ marginTop: 8 }}>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${pct}%`, background: typeColor }} />
          </div>
          <span className="progress-label">{pct}%</span>
        </div>
        <div className="complete-badge" style={{ marginTop: 6 }}>✓ Arquivado</div>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

const SETOR_COLORS = ["#58a6ff","#f0883e","#3fb950","#bc8cff","#ff7b72","#e3b341","#00acc1","#f48fb1","#80cbc4","#ffb74d"];

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

  useEffect(() => {
    const first = orderedTypes[0] || "";
    if (!orderedTypes.includes(selectedType)) setSelectedType(first);
  }, [orderedTypes, selectedType]);

  const title = customTitle.trim() || selectedType;
  const canSubmit = title && processNumber.trim() && setor.trim();

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
    onAdd({ id: generateId(), title, processNumber: processNumber.trim(), setor: setor.trim(), type: selectedType || null, typeColor, docs });
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
}) {
  const TABS = [
    { id: "board",    label: "Processos" },
    { id: "archive",  label: archived.length ? `Arquivados (${archived.length})` : "Arquivados" },
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
            <p>Clique em <strong>Novo Processo</strong> para começar.</p>
            <button className="btn-primary" onClick={() => setShowNewProcess(true)}><IconPlus /> Criar primeiro processo</button>
          </div>
        ) : (
          <div className="board">
            {sortedColumns.map(col => (
              <ProcessColumn key={col.id} column={col}
                onUpdateDocs={updateDocs} onDeleteColumn={deleteColumn}
                onRenameColumn={renameColumn} onArchive={archiveColumn} />
            ))}
          </div>
        )
      )}

      {activeTab === "archive" && (
        archived.length === 0 ? (
          <div className="empty-board">
            <h2>Nenhum processo arquivado</h2>
            <p>Processos concluídos podem ser arquivados para manter o histórico sem poluir o board.</p>
          </div>
        ) : (
          <div className="archive-grid">
            {archived.map(col => (
              <ArchivedCard key={col.id} column={col} onUnarchive={unarchiveColumn} onDelete={deleteArchived} />
            ))}
          </div>
        )
      )}

      {activeTab === "dashboard" && <Dashboard columns={columns} archived={archived} />}

      {showNewProcess && <NewProcessModal templates={templates} onAdd={addColumn} onClose={() => setShowNewProcess(false)} sectors={sectors} />}
    </>
  );
}
