import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import mammoth from "mammoth";

const TYPE_COLORS = {
  "Aquisições":           "#e05500",
  "Dispensa sem Disputa": "#f07020",
  "Dispensa com Disputa": "#f0883e",
  "Pregão Eletrônico":    "#f85149",
  "Inexigibilidade":      "#e3b341",
  "Publicação":           "#e3b341",
  "Renovação Antiga":     "#3fb950",
  "Renovação Nova":       "#3fb950",
};

const COLUMN_ORDER = ["Aquisições", "Dispensa sem Disputa", "Dispensa com Disputa", "Inexigibilidade", "Renovação Antiga", "Renovação Nova", "Publicação", "Pregão Eletrônico"];

const DEFAULT_TEMPLATE_ITEMS = {};

function normalizeTemplateLine(item) {
  if (typeof item === "string") return { type: "doc", name: item, bgColor: null };
  return { type: item.type || "doc", name: item.name, bgColor: item.bgColor || null };
}

function tmplItems(entry) {
  if (entry == null) return [];
  return Array.isArray(entry) ? entry : (entry.items || []);
}

function tmplOrder(entry) {
  if (entry == null) return 999;
  return Array.isArray(entry) ? 999 : (entry.order ?? 999);
}

function tmplColor(name, entry) {
  if (entry == null) return TYPE_COLORS[name] || "#30363d";
  if (Array.isArray(entry)) return TYPE_COLORS[name] || "#30363d";
  return entry.color || TYPE_COLORS[name] || "#30363d";
}

function orderedTemplateTypeNames(templates) {
  return Object.entries(templates || {})
    .sort((a, b) => tmplOrder(a[1]) - tmplOrder(b[1]) || a[0].localeCompare(b[0]))
    .map(([k]) => k);
}

function normalizeTemplatesFromApi(raw) {
  if (!raw || typeof raw !== "object") return {};
  const result = {};
  for (const [k, v] of Object.entries(raw)) {
    if (Array.isArray(v)) {
      result[k] = {
        items: v.map(normalizeTemplateLine),
        color: TYPE_COLORS[k] || "#30363d",
        order: COLUMN_ORDER.indexOf(k) === -1 ? 999 : COLUMN_ORDER.indexOf(k),
      };
    } else if (v && typeof v === "object") {
      result[k] = {
        items: (v.items || []).map(normalizeTemplateLine),
        color: v.color || TYPE_COLORS[k] || "#30363d",
        order: typeof v.order === "number" ? v.order : 999,
      };
    }
  }
  orderedTemplateTypeNames(result).forEach((key, i) => {
    if (result[key]) result[key].order = i;
  });
  return result;
}

const DEFAULT_TEMPLATES = (() => {
  const out = {};
  let ord = 0;
  for (const name of COLUMN_ORDER) {
    if (!DEFAULT_TEMPLATE_ITEMS[name]) continue;
    out[name] = {
      items: DEFAULT_TEMPLATE_ITEMS[name].map(normalizeTemplateLine),
      color: TYPE_COLORS[name] || "#30363d",
      order: ord++,
    };
  }
  for (const name of Object.keys(DEFAULT_TEMPLATE_ITEMS)) {
    if (out[name]) continue;
    out[name] = {
      items: DEFAULT_TEMPLATE_ITEMS[name].map(normalizeTemplateLine),
      color: TYPE_COLORS[name] || "#30363d",
      order: ord++,
    };
  }
  return out;
})();

function generateId() { return Math.random().toString(36).substr(2, 9); }

function useStorage(key, defaultValue) {
  const [state, setState] = useState(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : defaultValue; } catch { return defaultValue; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(state)); } catch {} }, [key, state]);
  return [state, setState];
}

// Normalize old string/object docs to new format
function normalizeDocs(docs) {
  return docs.map(d => {
    if (typeof d === "string") return { id: generateId(), type: "doc", name: d, done: false, bgColor: null };
    if (!d.type) return { ...d, type: "doc", done: d.done ?? false };
    return d;
  });
}

// Group docs into phases for rendering
function groupByPhase(docs) {
  const groups = [];
  let currentPhase = null;
  let currentDocs = [];

  docs.forEach(doc => {
    if (doc.type === "phase") {
      if (currentPhase !== null || currentDocs.length > 0) {
        groups.push({ phase: currentPhase, docs: currentDocs });
      }
      currentPhase = doc;
      currentDocs = [];
    } else {
      currentDocs.push(doc);
    }
  });
  groups.push({ phase: currentPhase, docs: currentDocs });
  return groups;
}

// ─── Icons (Lucide style — 1.5px stroke, rounded) ────────────────────────────
const IconPlus = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>);
const IconTrash = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>);
const IconEdit = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>);
const IconClose = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>);
const IconTemplate = () => (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="7" rx="1.5"/><rect x="3" y="14" width="9" height="7" rx="1.5"/><rect x="16" y="14" width="5" height="7" rx="1.5"/></svg>);
const IconCheck = () => (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>);
const IconPalette = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r="1.5" fill="currentColor"/><circle cx="17.5" cy="10.5" r="1.5" fill="currentColor"/><circle cx="8.5" cy="7.5" r="1.5" fill="currentColor"/><circle cx="6.5" cy="12.5" r="1.5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>);
const IconArchive = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="5" rx="2"/><path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9"/><path d="M10 13h4"/></svg>);
const IconUnarchive = () => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="5" rx="2"/><path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9"/><path d="M12 19v-7"/><path d="M9 15l3-3 3 3"/></svg>);
const IconChevron = ({ down }) => (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transition: "transform .25s ease" }}><polyline points={down ? "6 9 12 15 18 9" : "18 15 12 9 6 15"}/></svg>);
const IconFlag = () => (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>);
const IconLink = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>);
const IconUpload = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>);
const IconClipboard = () => (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>);
const IconFileText = () => (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>);
const IconEye = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>);
const IconEyeOff = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>);
const IconUser = () => (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 5-6 8-6s6.5 2 8 6"/></svg>);
const IconShield = () => (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>);

const CARD_COLORS = [
  { label: "Padrão", value: null },
  { label: "Azul", value: "#1e88e5" },
  { label: "Verde", value: "#43a047" },
  { label: "Amarelo", value: "#f9a825" },
  { label: "Vermelho", value: "#e53935" },
  { label: "Roxo", value: "#8e24aa" },
  { label: "Ciano", value: "#00acc1" },
  { label: "Laranja", value: "#fb8c00" },
];

const PHASE_COLORS = ["#1e88e5","#8e24aa","#43a047","#f9a825","#e53935","#00acc1","#fb8c00"];

// ─── DocCard ──────────────────────────────────────────────────────────────────
function DocCard({ doc, onToggle, onDelete, onRename, onChangeColor }) {
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

// ─── PhaseCard ────────────────────────────────────────────────────────────────
function PhaseCard({ phase, docs, onToggleDoc, onDeleteDoc, onRenameDoc, onChangeDocColor, onDeletePhase, onRenamePhase }) {
  const allDone = docs.length > 0 && docs.every(d => d.done);
  const doneCnt = docs.filter(d => d.done).length;
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(phase.name);
  const inputRef = useRef();

  // auto-collapse when all done
  useEffect(() => { if (allDone && docs.length > 0) setCollapsed(true); }, [allDone, docs.length]);
  // auto-expand if a doc becomes undone
  useEffect(() => { if (!allDone) setCollapsed(false); }, [allDone]);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
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
            <DocCard key={doc.id} doc={doc}
              onToggle={onToggleDoc} onDelete={onDeleteDoc}
              onRename={onRenameDoc} onChangeColor={onChangeDocColor} />
          ))}
          {docs.length === 0 && <p className="phase-empty">Nenhum documento nesta fase.</p>}
        </div>
      )}
    </div>
  );
}

// ─── ProcessColumn ────────────────────────────────────────────────────────────
function ProcessColumn({ column, onUpdateDocs, onDeleteColumn, onRenameColumn, onArchive }) {
  const [addingItem, setAddingItem] = useState(null); // null | "doc" | "phase"
  const [newName, setNewName] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(column.title);
  const [phaseColorIdx, setPhaseColorIdx] = useState(0);
  const [archiving, setArchiving] = useState(false); // estado de animação de arquivamento
  const inputRef = useRef();

  useEffect(() => { if (addingItem) inputRef.current?.focus(); }, [addingItem]);

  const docs = normalizeDocs(column.docs || []);
  const allRegularDocs = docs.filter(d => d.type === "doc");
  const done = allRegularDocs.filter(d => d.done).length;
  const total = allRegularDocs.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const isComplete = total > 0 && done === total;
  const typeColor = column.typeColor || "#30363d";
  const borderColor = isComplete ? "#3fb950" : typeColor;

  // Auto-arquiva 1.6s depois que a coluna fica 100% concluída (tempo da animação)
  useEffect(() => {
    if (isComplete && !archiving) {
      const t = setTimeout(() => {
        setArchiving(true);
        // Espera a animação de saída terminar antes de mover pra arquivados
        setTimeout(() => onArchive(column.id), 750);
      }, 900);
      return () => clearTimeout(t);
    }
  }, [isComplete, archiving, column.id]);

  const saveTitle = () => { if (titleVal.trim()) onRenameColumn(column.id, titleVal.trim()); setEditingTitle(false); };

  const submitItem = () => {
    if (!newName.trim()) { setAddingItem(null); return; }
    let newDoc;
    if (addingItem === "phase") {
      newDoc = { id: generateId(), type: "phase", name: newName.trim(), bgColor: PHASE_COLORS[phaseColorIdx] };
    } else {
      newDoc = { id: generateId(), type: "doc", name: newName.trim(), done: false, bgColor: null };
    }
    onUpdateDocs(column.id, [...docs, newDoc]);
    setNewName("");
    setAddingItem(null);
  };

  const toggleDoc = (docId) => {
    onUpdateDocs(column.id, docs.map(d => d.id === docId ? { ...d, done: !d.done } : d));
  };
  const deleteDoc = (docId) => onUpdateDocs(column.id, docs.filter(d => d.id !== docId));
  const deletePhase = (phaseId) => {
    // Remove phase and all docs that belong to it (docs after phase, before next phase)
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
  const renameDoc = (docId, name) => onUpdateDocs(column.id, docs.map(d => d.id === docId ? { ...d, name } : d));
  const renamePhase = (phaseId, name) => onUpdateDocs(column.id, docs.map(d => d.id === phaseId ? { ...d, name } : d));
  const changeDocColor = (docId, color) => onUpdateDocs(column.id, docs.map(d => d.id === docId ? { ...d, bgColor: color } : d));

  const groups = groupByPhase(docs);

  return (
    <div className={`column ${isComplete ? "complete" : ""} ${archiving ? "archiving" : ""}`} style={{ borderColor }}>
      {isComplete && !archiving && <div className="complete-overlay" />}
      <div className="column-header" style={{ borderBottom: `1px solid ${borderColor}33` }}>
        <div className="col-type-stripe" style={{ background: borderColor }} />
        {column.processNumber && <div className="process-number">Nº {column.processNumber}</div>}
        {column.setor && <div className="process-setor">{column.setor}</div>}
        <div className="column-title-row">
          {editingTitle ? (
            <input className="title-input" value={titleVal} onChange={e => setTitleVal(e.target.value)}
              onBlur={saveTitle} onKeyDown={e => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") { setTitleVal(column.title); setEditingTitle(false); } }} autoFocus />
          ) : (
            <h3 className="column-title" onClick={() => setEditingTitle(true)}>{column.title}</h3>
          )}
          <div style={{ display: "flex", gap: 2 }}>
            <button className="icon-btn danger sm" onClick={() => onDeleteColumn(column.id)} title="Excluir"><IconTrash /></button>
          </div>
        </div>
        <div className="progress-row">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${pct}%`, background: borderColor }} />
          </div>
          <span className="progress-label">{done}/{total}</span>
        </div>
        {isComplete && <div className="complete-badge">✓ Concluído — arquivando…</div>}
      </div>

      <div className="docs-list">
        {groups.map((group, gi) => (
          group.phase ? (
            <PhaseCard key={group.phase.id} phase={group.phase} docs={group.docs}
              onToggleDoc={toggleDoc} onDeleteDoc={deleteDoc} onRenameDoc={renameDoc}
              onChangeDocColor={changeDocColor} onDeletePhase={deletePhase} onRenamePhase={renamePhase} />
          ) : (
            group.docs.map(doc => (
              <DocCard key={doc.id} doc={doc}
                onToggle={toggleDoc} onDelete={deleteDoc}
                onRename={renameDoc} onChangeColor={changeDocColor} />
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
            <button className="btn-cancel" onClick={() => { setAddingItem(null); setNewName(""); }}><IconClose /></button>
          </div>
        </div>
      ) : (
        <div className="add-bar">
          <button className="add-doc-btn" onClick={() => setAddingItem("doc")}><IconPlus /> Documento</button>
          <button className="add-phase-btn" onClick={() => setAddingItem("phase")}><IconFlag /> Fase</button>
        </div>
      )}
    </div>
  );
}

// ─── ArchivedCard ─────────────────────────────────────────────────────────────
function ArchivedCard({ column, onUnarchive, onDelete }) {
  const docs = normalizeDocs(column.docs || []).filter(d => d.type === "doc");
  const done = docs.filter(d => d.done).length;
  const total = docs.length;
  const typeColor = column.typeColor || "#30363d";
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="archived-card" style={{ borderColor: typeColor }}>
      <div className="col-type-stripe" style={{ background: typeColor }} />
      <div style={{ padding: "10px 14px 14px" }}>
        {column.processNumber && <div className="process-number">Nº {column.processNumber}</div>}
        {column.setor && <div className="process-setor">{column.setor}</div>}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "6px 0 8px" }}>
          <h3 className="column-title" style={{ cursor: "default" }}>{column.title}</h3>
          <div style={{ display: "flex", gap: 4 }}>
            <button className="icon-btn" onClick={() => onUnarchive(column.id)} title="Restaurar"><IconUnarchive /></button>
            <button className="icon-btn danger sm" onClick={() => onDelete(column.id)} title="Excluir"><IconTrash /></button>
          </div>
        </div>
        <div className="progress-row">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${pct}%`, background: typeColor }} />
          </div>
          <span className="progress-label">{done}/{total} docs</span>
        </div>
        <div className="complete-badge" style={{ marginTop: 6 }}>✓ Arquivado</div>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function DonutChart({ pct, color }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      <circle cx="70" cy="70" r={r} fill="none" stroke="#30363d" strokeWidth="14" />
      <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="14"
        strokeDasharray={`${dash} ${circ}`} strokeDashoffset={circ / 4}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 1s ease" }} />
      <text x="70" y="65" textAnchor="middle" fill="#e6edf3" fontSize="22" fontWeight="800" fontFamily="Syne, sans-serif">{pct}%</text>
      <text x="70" y="84" textAnchor="middle" fill="#8b949e" fontSize="10" fontFamily="DM Sans, sans-serif">concluído</text>
    </svg>
  );
}

function AnimatedBar({ pct, color }) {
  const [width, setWidth] = useState(0);
  useEffect(() => { const t = setTimeout(() => setWidth(pct), 100); return () => clearTimeout(t); }, [pct]);
  return (
    <div style={{ flex: 1, height: 8, background: "#30363d", borderRadius: 99, overflow: "hidden" }}>
      <div style={{ width: `${width}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.8s cubic-bezier(.4,0,.2,1)" }} />
    </div>
  );
}

function SetorBarChart({ setores }) {
  const max = Math.max(...setores.map(s => s.total), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {setores.map((s, i) => {
        const pctDone = s.total ? Math.round((s.done / s.total) * 100) : 0;
        const barWidthTotal = Math.round((s.total / max) * 100);
        const barWidthDone = s.total ? Math.round((s.done / s.total) * barWidthTotal) : 0;
        return (
          <div key={i}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 6 }}>
              <div>
                <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#e6edf3" }}>{s.setor}</span>
                <span style={{ fontSize: "0.72rem", color: "#8b949e", marginLeft: 8 }}>
                  {s.count} processo{s.count > 1 ? "s" : ""}
                  {s.arquivados > 0 && <span style={{ marginLeft: 6, color: "#8b949e" }}>· {s.arquivados} arquivado{s.arquivados > 1 ? "s" : ""}</span>}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: "0.72rem", color: "#8b949e" }}>{s.done}/{s.total} docs</span>
                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: pctDone === 100 ? "#3fb950" : "#f0883e", minWidth: 38, textAlign: "right" }}>{pctDone}%</span>
              </div>
            </div>
            {/* Stacked bar: done (green) + pending (orange) */}
            <div style={{ height: 10, background: "#21293a", borderRadius: 99, overflow: "hidden", position: "relative" }}>
              <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${barWidthTotal}%`, background: "#f0883e44", borderRadius: 99, transition: "width 0.8s cubic-bezier(.4,0,.2,1)" }} />
              <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${barWidthDone}%`, background: pctDone === 100 ? "#3fb950" : "#f0883e", borderRadius: 99, transition: "width 0.8s cubic-bezier(.4,0,.2,1)" }} />
            </div>
            {/* Mini process badges */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 7 }}>
              {s.processes.map((p, pi) => (
                <span key={pi} style={{
                  fontSize: "0.68rem", padding: "2px 8px", borderRadius: 99,
                  background: p.color + "22", color: p.color,
                  border: `1px solid ${p.color}55`,
                  maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {p.processNumber ? `Nº ${p.processNumber}` : p.title}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Dashboard({ columns, archived }) {
  const all = [...columns, ...archived];
  const getRegularDocs = (c) => normalizeDocs(c.docs || []).filter(d => d.type === "doc");
  const emAndamento = columns.filter(c => { const d = getRegularDocs(c); return d.length === 0 || d.some(x => !x.done); }).length;
  const concluidos = columns.filter(c => { const d = getRegularDocs(c); return d.length > 0 && d.every(x => x.done); }).length;
  const totalDocs = all.reduce((a, c) => a + getRegularDocs(c).length, 0);
  const totalDone = all.reduce((a, c) => a + getRegularDocs(c).filter(d => d.done).length, 0);
  const pctGeral = totalDocs ? Math.round((totalDone / totalDocs) * 100) : 0;

  const totalPendente = totalDocs - totalDone;

  // Por tipo — count + docs
  const byType = {};
  all.forEach(c => {
    const key = c.type || Object.entries(TYPE_COLORS).find(([, v]) => v === c.typeColor)?.[0] || c.title;
    const color = c.typeColor || "#8b949e";
    const d = getRegularDocs(c);
    if (!byType[key]) byType[key] = { count: 0, color, done: 0, total: 0 };
    byType[key].count++;
    byType[key].done += d.filter(x => x.done).length;
    byType[key].total += d.length;
  });

  // Por setor — agrupa ativos + arquivados
  const bySetor = {};
  const addToSetor = (c, isArchived) => {
    const setor = c.setor?.trim() || "Sem setor definido";
    const d = getRegularDocs(c);
    if (!bySetor[setor]) bySetor[setor] = { setor, count: 0, arquivados: 0, done: 0, total: 0, processes: [] };
    bySetor[setor].count++;
    if (isArchived) bySetor[setor].arquivados++;
    bySetor[setor].done += d.filter(x => x.done).length;
    bySetor[setor].total += d.length;
    bySetor[setor].processes.push({ title: c.title, processNumber: c.processNumber, color: c.typeColor || "#8b949e" });
  };
  columns.forEach(c => addToSetor(c, false));
  archived.forEach(c => addToSetor(c, true));
  const setoresArr = Object.values(bySetor).sort((a, b) => b.total - a.total);

  const stats = [
    { label: "Em Andamento", value: emAndamento, color: "#58a6ff", sub: "processos ativos" },
    { label: "Concluídos", value: concluidos, color: "#3fb950", sub: "prontos para arquivar" },
    { label: "Arquivados", value: archived.length, color: "#8b949e", sub: "no histórico" },
    { label: "Pendentes", value: totalPendente, color: "#f0883e", sub: "documentos a fazer" },
  ];

  return (
    <div className="dashboard">

      {/* Top row: donut + stats */}
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>

        {/* Donut */}
        <div className="dash-section" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minWidth: 180, padding: "24px 28px" }}>
          <DonutChart pct={pctGeral} color="#f0883e" />
          <p style={{ fontSize: "0.75rem", color: "#8b949e", marginTop: 8, textAlign: "center" }}>{totalDone} de {totalDocs} docs concluídos</p>
        </div>

        {/* Stat cards */}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, minWidth: 240 }}>
          {stats.map(s => (
            <div key={s.label} className="dash-stat" style={{ borderLeftColor: s.color }}>
              <div className="dash-stat-value" style={{ color: s.color }}>{s.value}</div>
              <div className="dash-stat-label">{s.label}</div>
              <div style={{ fontSize: "0.7rem", color: "#8b949e", marginTop: 2 }}>{s.sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Distribuição por Setor */}
      {setoresArr.length > 0 && (
        <div className="dash-section">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <h3 className="dash-title" style={{ marginBottom: 0 }}>Carga por Setor / Órgão</h3>
            <div style={{ display: "flex", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: "#f0883e" }} />
                <span style={{ fontSize: "0.7rem", color: "#8b949e" }}>Concluído</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: "#f0883e44", border: "1px solid #f0883e55" }} />
                <span style={{ fontSize: "0.7rem", color: "#8b949e" }}>Pendente</span>
              </div>
            </div>
          </div>
          <SetorBarChart setores={setoresArr} />
          {/* Summary footer */}
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid #30363d", display: "flex", gap: 20, flexWrap: "wrap" }}>
            <div style={{ fontSize: "0.75rem", color: "#8b949e" }}>
              <span style={{ color: "#e6edf3", fontWeight: 600 }}>{setoresArr.length}</span> setor{setoresArr.length > 1 ? "es" : ""} com processos
            </div>
            <div style={{ fontSize: "0.75rem", color: "#8b949e" }}>
              Maior carga: <span style={{ color: "#e6edf3", fontWeight: 600 }}>{setoresArr[0]?.setor}</span>
              {" "}({setoresArr[0]?.count} processo{setoresArr[0]?.count > 1 ? "s" : ""})
            </div>
          </div>
        </div>
      )}

      {/* Progresso por tipo */}
      {Object.keys(byType).length > 0 && (
        <div className="dash-section">
          <h3 className="dash-title">Progresso por Tipo de Processo</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {Object.entries(byType).map(([type, info]) => {
              const pct = info.total ? Math.round((info.done / info.total) * 100) : 0;
              return (
                <div key={type}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: info.color, flexShrink: 0 }} />
                      <span style={{ fontSize: "0.83rem" }}>{type}</span>
                      <span style={{ fontSize: "0.72rem", color: "#8b949e" }}>{info.count} processo{info.count > 1 ? "s" : ""}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: "0.75rem", color: "#8b949e" }}>{info.done}/{info.total} docs</span>
                      <span style={{ fontSize: "0.82rem", fontWeight: 700, color: info.color, minWidth: 38, textAlign: "right" }}>{pct}%</span>
                    </div>
                  </div>
                  <AnimatedBar pct={pct} color={info.color} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Processos ativos */}
      {columns.length > 0 && (
        <div className="dash-section">
          <h3 className="dash-title">Processos Ativos</h3>
          <div className="dash-process-list">
            {columns.map(c => {
              const d = getRegularDocs(c);
              const dn = d.filter(x => x.done).length;
              const pct = d.length ? Math.round((dn / d.length) * 100) : 0;
              const color = c.typeColor || "#30363d";
              return (
                <div key={c.id} className="dash-process-item">
                  <div className="dash-process-dot" style={{ background: color }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span className="dash-process-name">{c.processNumber ? `Nº ${c.processNumber} — ` : ""}{c.title}</span>
                      <span style={{ fontSize: "0.78rem", fontWeight: 700, color, marginLeft: 8, flexShrink: 0 }}>{pct}%</span>
                    </div>
                    <AnimatedBar pct={pct} color={color} />
                    {c.setor && <div style={{ fontSize: "0.7rem", color: "#8b949e", marginTop: 4 }}>{c.setor}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}

// Lê um DOCX: H2 → fase, parágrafo → card
async function parseDocxToItems(file) {
  const arrayBuffer = await file.arrayBuffer();
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
  const doc = new DOMParser().parseFromString(html, "text/html");
  const items = [];
  let phaseColorIdx = 0;
  for (const el of Array.from(doc.body.children)) {
    const text = el.textContent.trim();
    if (!text) continue;
    if (el.tagName === "H2") {
      items.push({ type: "phase", name: text, bgColor: PHASE_COLORS[phaseColorIdx % PHASE_COLORS.length] });
      phaseColorIdx++;
    } else if (el.tagName === "P") {
      items.push({ type: "doc", name: text, bgColor: null });
    }
  }
  return items;
}

// ─── TemplateManager ──────────────────────────────────────────────────────────
function TemplateManager({ templates, onSave, onClose }) {
  const [local, setLocal] = useState(() => normalizeTemplatesFromApi(JSON.parse(JSON.stringify(templates))));
  const [selected, setSelected] = useState(() => orderedTemplateTypeNames(normalizeTemplatesFromApi(JSON.parse(JSON.stringify(templates))))[0] || "");
  const [newName, setNewName] = useState("");
  const [newItem, setNewItem] = useState("");
  const [addType, setAddType] = useState("doc");
  const [openColorIdx, setOpenColorIdx] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const [dragTypeKey, setDragTypeKey] = useState(null);
  const [dragOverTypeKey, setDragOverTypeKey] = useState(null);
  const [openTypeColorKey, setOpenTypeColorKey] = useState(null);
  const [phaseColorIdx, setPhaseColorIdx] = useState(0);
  const colorRefs = useRef({});
  const typeColorRef = useRef({});
  const docxInputRef = useRef(null);
  const [docxError, setDocxError] = useState("");

  const orderedKeys = useMemo(() => orderedTemplateTypeNames(local), [local]);
  const selectedEntry = selected ? local[selected] : null;
  const selectedItems = selectedEntry ? selectedEntry.items : [];

  useEffect(() => {
    if (selected && !local[selected]) setSelected(orderedKeys[0] || "");
    else if (!selected && orderedKeys.length) setSelected(orderedKeys[0]);
  }, [local, selected, orderedKeys]);

  useEffect(() => {
    if (openColorIdx === null) return;
    const h = (e) => { if (colorRefs.current[openColorIdx] && !colorRefs.current[openColorIdx].contains(e.target)) setOpenColorIdx(null); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [openColorIdx]);

  useEffect(() => {
    if (openTypeColorKey == null) return;
    const h = (e) => {
      const ref = typeColorRef.current[openTypeColorKey];
      if (ref && !ref.contains(e.target)) setOpenTypeColorKey(null);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [openTypeColorKey]);

  const addTemplate = () => {
    if (!newName.trim() || local[newName.trim()]) return;
    const key = newName.trim();
    setLocal((p) => {
      const next = { ...p, [key]: { items: [], color: "#30363d", order: 999 } };
      const keys = orderedTemplateTypeNames(next);
      const out = { ...next };
      keys.forEach((k, i) => {
        out[k] = { ...out[k], order: i };
      });
      return out;
    });
    setSelected(key);
    setNewName("");
  };

  const deleteTemplate = (key) => {
    setLocal((p) => {
      const next = { ...p };
      delete next[key];
      const keys = orderedTemplateTypeNames(next);
      keys.forEach((k, i) => {
        next[k] = { ...next[k], order: i };
      });
      return next;
    });
    setSelected((s) => (s === key ? "" : s));
  };

  const addItem = () => {
    if (!newItem.trim() || !selected || !local[selected]) return;
    const entry = addType === "phase"
      ? { type: "phase", name: newItem.trim(), bgColor: PHASE_COLORS[phaseColorIdx] }
      : { type: "doc", name: newItem.trim(), bgColor: null };
    setLocal((p) => ({
      ...p,
      [selected]: { ...p[selected], items: [...p[selected].items, entry] },
    }));
    setNewItem("");
  };
  const removeItem = (idx) => setLocal((p) => ({
    ...p,
    [selected]: { ...p[selected], items: p[selected].items.filter((_, i) => i !== idx) },
  }));
  const setItemColor = (idx, color) => {
    setLocal((p) => ({
      ...p,
      [selected]: {
        ...p[selected],
        items: p[selected].items.map((item, i) => (i === idx ? { ...item, bgColor: color } : item)),
      },
    }));
    setOpenColorIdx(null);
  };
  const setTypeRowColor = (key, color) => {
    setLocal((p) => ({ ...p, [key]: { ...p[key], color } }));
    setOpenTypeColorKey(null);
  };
  const handleDragStart = (i) => setDragIdx(i);
  const handleDragOver = (e, i) => { e.preventDefault(); setDragOverIdx(i); };
  const handleDrop = (i) => {
    if (dragIdx === null || dragIdx === i) { setDragIdx(null); setDragOverIdx(null); return; }
    setLocal((p) => {
      const items = [...p[selected].items];
      const [moved] = items.splice(dragIdx, 1);
      items.splice(i, 0, moved);
      return { ...p, [selected]: { ...p[selected], items } };
    });
    setDragIdx(null); setDragOverIdx(null);
  };
  const handleDragEnd = () => { setDragIdx(null); setDragOverIdx(null); };

  const handleTypeDragStart = (e, k) => { e.stopPropagation(); setDragTypeKey(k); };
  const handleTypeDragOver = (e, k) => { e.preventDefault(); setDragOverTypeKey(k); };
  const handleTypeDrop = (targetKey) => {
    if (!dragTypeKey || dragTypeKey === targetKey) { setDragTypeKey(null); setDragOverTypeKey(null); return; }
    setLocal((p) => {
      const keys = orderedTemplateTypeNames(p);
      const from = keys.indexOf(dragTypeKey);
      const to = keys.indexOf(targetKey);
      if (from < 0 || to < 0) return p;
      const nk = [...keys];
      const [mv] = nk.splice(from, 1);
      nk.splice(to, 0, mv);
      const next = { ...p };
      nk.forEach((name, i) => {
        next[name] = { ...next[name], order: i };
      });
      return next;
    });
    setDragTypeKey(null); setDragOverTypeKey(null);
  };
  const handleTypeDragEnd = () => { setDragTypeKey(null); setDragOverTypeKey(null); };

  const handleDocxFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setDocxError("");
    try {
      const items = await parseDocxToItems(file);
      if (items.length === 0) { setDocxError("Nenhum item encontrado. Use Título 2 para fases e parágrafos para documentos."); return; }
      const base = file.name.replace(/\.docx?$/i, "").trim() || "Importado";
      let key = base;
      let n = 2;
      while (local[key]) { key = `${base} (${n++})`; }
      const order = orderedTemplateTypeNames(local).length;
      const newLocal = { ...local, [key]: { items, color: "#30363d", order } };
      setLocal(newLocal);
      setSelected(key);
      onSave(newLocal);
    } catch {
      setDocxError("Erro ao ler o arquivo. Certifique-se que é um .docx válido.");
    }
  };

  // Fully inline-styled fixed layout - no CSS cascade issues
  const S = {
    overlay: { position:"fixed", inset:0, background:"rgba(0,0,0,.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:100, padding:20 },
    box: { background:"#161b22", border:"1px solid #30363d", borderRadius:16, width:"100%", maxWidth:740, height:"80vh", display:"flex", flexDirection:"column", overflow:"hidden" },
    header: { display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 20px", borderBottom:"1px solid #30363d", flexShrink:0 },
    body: { display:"flex", flex:1, overflow:"hidden", minHeight:0 },
    sidebar: { width:236, minWidth:236, borderRight:"1px solid #30363d", padding:14, display:"flex", flexDirection:"column", gap:4, overflowY:"auto", overflowX:"hidden", flexShrink:0 },
    content: { flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 },
    label: { fontSize:"0.7rem", color:"#8b949e", textTransform:"uppercase", letterSpacing:".6px", marginBottom:6, flexShrink:0 },
    list: { flex:1, overflowY:"auto", overflowX:"hidden", padding:"12px 12px 0", display:"flex", flexDirection:"column", gap:3 },
    addBar: { flexShrink:0, borderTop:"1px solid #30363d", padding:"12px 14px", display:"flex", flexDirection:"column", gap:8 },
    footer: { display:"flex", justifyContent:"flex-end", gap:10, padding:"14px 20px", borderTop:"1px solid #30363d", flexShrink:0 },
  };

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.box}>

        {/* Header */}
        <div style={S.header}>
          <span style={{ fontFamily:"'Syne',sans-serif", fontWeight:700, fontSize:"1rem" }}>Gerenciar Modelos</span>
          <button className="icon-btn" onClick={onClose}><IconClose /></button>
        </div>

        {/* Body */}
        <div style={S.body}>

          {/* Sidebar */}
          <div style={S.sidebar}>
            <p style={S.label}>Tipos de Processo</p>
            <p style={{ fontSize:"0.65rem", color:"#6e7681", marginBottom:6, lineHeight:1.35 }}>Arraste ⠿ para ordem na aba Processos. A cor vale para novos processos deste tipo.</p>
            {orderedKeys.map(k => (
              <div key={k}
                onClick={() => setSelected(k)}
                onDragOver={(e) => handleTypeDragOver(e, k)}
                onDrop={() => handleTypeDrop(k)}
                onDragEnd={handleTypeDragEnd}
                style={{
                  display:"flex", alignItems:"center", gap:4,
                  padding:"6px 8px", borderRadius:8, cursor:"pointer", fontSize:"0.82rem",
                  background: selected === k ? "#1c2330" : "transparent",
                  color: selected === k ? "#f0883e" : "#e6edf3",
                  fontWeight: selected === k ? 500 : 400,
                  border: dragOverTypeKey === k && dragTypeKey !== k ? "1px dashed #58a6ff" : "1px solid transparent",
                  opacity: dragTypeKey === k ? 0.45 : 1,
                }}>
                <span
                  draggable
                  onDragStart={(e) => handleTypeDragStart(e, k)}
                  style={{ color:"#3a4556", fontSize:"1rem", userSelect:"none", flexShrink:0, cursor:"grab", padding:"2px 0" }}
                  title="Arrastar para reordenar tipos"
                >⠿</span>
                <span style={{ width:10, height:10, borderRadius:"50%", background: local[k].color || "#30363d", flexShrink:0 }} />
                <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1, minWidth:0 }}>{k}</span>
                <div style={{ display:"flex", gap:2, flexShrink:0 }} onClick={e => e.stopPropagation()}>
                  <div style={{ position:"relative" }} ref={(el) => { typeColorRef.current[k] = el; }}>
                    <button type="button" className="icon-btn" title="Cor do tipo" onClick={() => setOpenTypeColorKey(openTypeColorKey === k ? null : k)}><IconPalette /></button>
                    {openTypeColorKey === k && (
                      <div className="color-picker" style={{ right: 0, left: "auto" }}>
                        {CARD_COLORS.map(c => (
                          <button key={c.label} type="button" className={`color-swatch ${local[k].color === c.value ? "active" : ""}`}
                            style={{ background: c.value || "#1c2330", outline: local[k].color === c.value ? "2px solid #58a6ff" : "none" }}
                            title={c.label} onClick={() => setTypeRowColor(k, c.value)} />
                        ))}
                      </div>
                    )}
                  </div>
                  <button type="button" className="icon-btn danger sm" onClick={() => deleteTemplate(k)}><IconTrash /></button>
                </div>
              </div>
            ))}
            <div style={{ display:"flex", gap:6, marginTop:8 }}>
              <input className="tpl-input" placeholder="Novo tipo..." value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && addTemplate()} />
              <button className="btn-add-tpl" onClick={addTemplate}><IconPlus /></button>
            </div>
            <div style={{ borderTop:"1px solid #21262d", marginTop:10, paddingTop:10 }}>
              <input ref={docxInputRef} type="file" accept=".docx,.doc" style={{ display:"none" }} onChange={handleDocxFileChange} />
              <button
                className="btn-outline"
                style={{ width:"100%", justifyContent:"center", fontSize:"0.78rem", padding:"7px 10px" }}
                onClick={() => { setDocxError(""); docxInputRef.current?.click(); }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="12" x2="12" y2="18"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
                Importar Word (.docx)
              </button>
              {docxError && <p style={{ fontSize:"0.72rem", color:"#f85149", marginTop:6, lineHeight:1.4 }}>{docxError}</p>}
            </div>
          </div>

          {/* Content */}
          <div style={S.content}>
            {selected ? (<>

              {/* Label */}
              <div style={{ padding:"12px 14px 0", flexShrink:0 }}>
                <p style={S.label}>Itens em <strong style={{ color:"#e6edf3" }}>{selected}</strong> <span style={{ fontWeight:400, textTransform:"none", letterSpacing:0 }}>— arraste para reordenar</span></p>
              </div>

              {/* Scrollable list */}
              <div style={S.list} className="tpl-scroll-list">
                {selectedItems.map((item, i) => (
                  <div key={i}
                    style={{
                      display:"flex", alignItems:"center", gap:8, padding:"8px 10px",
                      borderRadius:8, fontSize:"0.82rem", cursor:"grab",
                      background: item.type === "phase" ? (item.bgColor || "#1a2a3a") : (item.bgColor || "#1c2330"),
                      border: dragOverIdx === i && dragIdx !== i ? "1px dashed #58a6ff" : "1px solid transparent",
                      opacity: dragIdx === i ? 0.35 : 1,
                      marginBottom: item.type === "phase" ? 4 : 0,
                    }}
                    draggable onDragStart={() => handleDragStart(i)} onDragOver={e => handleDragOver(e, i)}
                    onDrop={() => handleDrop(i)} onDragEnd={handleDragEnd}>
                    <span style={{ color:"#3a4556", fontSize:"1rem", userSelect:"none", flexShrink:0 }}>⠿</span>
                    {item.type === "phase" && <IconFlag />}
                    <span style={{ flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontWeight: item.type === "phase" ? 700 : 400, fontSize: item.type === "phase" ? "0.85rem" : "0.82rem" }}>{item.name}</span>
                    <div style={{ display:"flex", gap:4, alignItems:"center", flexShrink:0 }}>
                      {item.type === "doc" && (
                        <div style={{ position:"relative" }} ref={el => colorRefs.current[i] = el}>
                          <button className="icon-btn" title="Cor" onClick={() => setOpenColorIdx(openColorIdx === i ? null : i)}><IconPalette /></button>
                          {openColorIdx === i && (
                            <div className="color-picker">
                              {CARD_COLORS.map(c => (
                                <button key={c.label} className={`color-swatch ${item.bgColor === c.value ? "active" : ""}`}
                                  style={{ background: c.value || "#1c2330", outline: item.bgColor === c.value ? "2px solid #58a6ff" : "none" }}
                                  title={c.label} onClick={() => setItemColor(i, c.value)} />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      <button className="icon-btn danger sm" style={item.type === "phase" ? { color:"#ccc" } : {}} onClick={() => removeItem(i)}><IconTrash /></button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Fixed add bar */}
              <div style={S.addBar}>
                <div style={{ display:"flex", gap:6 }}>
                  <button className={`type-toggle ${addType === "doc" ? "active" : ""}`} onClick={() => setAddType("doc")}>Documento</button>
                  <button className={`type-toggle ${addType === "phase" ? "active" : ""}`} onClick={() => setAddType("phase")}><IconFlag /> Fase</button>
                </div>
                {addType === "phase" && (
                  <div style={{ display:"flex", gap:6 }}>
                    {PHASE_COLORS.map((c, i) => (
                      <button key={i} className={`phase-color-swatch ${phaseColorIdx === i ? "active" : ""}`} style={{ background:c }} onClick={() => setPhaseColorIdx(i)} />
                    ))}
                  </div>
                )}
                <div style={{ display:"flex", gap:6 }}>
                  <input className="tpl-input" placeholder={addType === "phase" ? "Nome da fase..." : "Nome do documento..."} value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => e.key === "Enter" && addItem()} style={{ flex:1 }} />
                  <button className="btn-add-tpl" onClick={addItem}><IconPlus /></button>
                </div>
              </div>

            </>) : (
              <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", color:"#8b949e", fontSize:"0.85rem" }}>
                Selecione ou crie um tipo de processo.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={S.footer}>
          <button className="btn-cancel-lg" onClick={onClose}>Cancelar</button>
          <button className="btn-save" onClick={() => { onSave(local); onClose(); }}>Salvar Modelos</button>
        </div>

      </div>
    </div>
  );
}

// ─── NewProcessModal ──────────────────────────────────────────────────────────
function NewProcessModal({ templates, onAdd, onClose }) {
  const orderedTypes = useMemo(() => orderedTemplateTypeNames(templates), [templates]);
  const [selectedType, setSelectedType] = useState("");
  const [customTitle, setCustomTitle] = useState("");
  const [processNumber, setProcessNumber] = useState("");
  const [setor, setSetor] = useState("");

  useEffect(() => {
    const first = orderedTypes[0] || "";
    if (!orderedTypes.includes(selectedType)) setSelectedType(first);
  }, [orderedTypes, selectedType]);

  const title = customTitle.trim() || selectedType;

  const handleAdd = () => {
    if (!title) return;
    const tpl = selectedType ? templates[selectedType] : null;
    const rawItems = tpl ? tmplItems(tpl) : [];
    const docs = rawItems.map(item => {
      if (typeof item === "string") return { id: generateId(), type: "doc", name: item, done: false, bgColor: null };
      if (item.type === "phase") return { id: generateId(), type: "phase", name: item.name, bgColor: item.bgColor || PHASE_COLORS[0] };
      return { id: generateId(), type: "doc", name: item.name, done: false, bgColor: item.bgColor || null };
    });
    const typeColor = selectedType ? tmplColor(selectedType, templates[selectedType]) : "#30363d";
    onAdd({ id: generateId(), title, processNumber: processNumber.trim(), setor: setor.trim(), type: selectedType || null, typeColor, docs });
    onClose();
  };

  const previewColor = selectedType ? tmplColor(selectedType, templates[selectedType]) : "#30363d";

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal sm-modal">
        <div className="modal-header">
          <h2>Novo Processo</h2>
          <button className="icon-btn" onClick={onClose}><IconClose /></button>
        </div>
        <div className="modal-body col">
          <label className="field-label">Tipo de processo (modelo)</label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", background: previewColor, flexShrink: 0 }} />
            <select className="select-field" value={selectedType} onChange={e => setSelectedType(e.target.value)}>
              {orderedTypes.map(k => <option key={k} value={k}>{k}</option>)}
              <option value="">— Sem modelo —</option>
            </select>
          </div>
          <label className="field-label mt">Número do processo <span className="optional">(opcional)</span></label>
          <input className="doc-input" placeholder="Ex: 001/2026" value={processNumber} onChange={e => setProcessNumber(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAdd()} />
          <label className="field-label mt">Órgão / Setor solicitante <span className="optional">(opcional)</span></label>
          <input className="doc-input" placeholder="Ex: Secretaria de Educação" value={setor} onChange={e => setSetor(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAdd()} />
          <label className="field-label mt">Título personalizado <span className="optional">(opcional)</span></label>
          <input className="doc-input" placeholder={selectedType || "Ex: Pregão 001/2026"} value={customTitle} onChange={e => setCustomTitle(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAdd()} />
          <p className="hint">Título final: <strong>{title || "—"}</strong></p>
        </div>
        <div className="modal-footer">
          <button className="btn-cancel-lg" onClick={onClose}>Cancelar</button>
          <button className="btn-save" onClick={handleAdd} disabled={!title}>Criar Processo</button>
        </div>
      </div>
    </div>
  );
}

// ─── Contratos Ativos ─────────────────────────────────────────────────────────

// Splits a raw CSV line respecting quoted fields
function splitCSVLine(line) {
  const cols = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; }
    else if (ch === "," && !inQ) { cols.push(cur.replace(/^"|"$/g, "").trim()); cur = ""; }
    else cur += ch;
  }
  cols.push(cur.replace(/^"|"$/g, "").trim());
  return cols;
}

/*
  CSV tem 2 linhas de cabeçalho. Mapeamento por índice de coluna:
  [0]  seq
  [1]  CONTRATADA (nome do processo/empresa)
  [2]  LEI
  [3]  Nº PROCESSO
  [4]  MODALIDADE
  [5]  OBJETO
  [6]  Nº CONTRATO
  [7]  VALOR INICIAL
  [8]  ASSINATURA
  [9]  VENCIMENTO inicial
  [10] Nº ADITIVO (ex: "4º", "-")
  [11] V. CONTRATO (valor do último aditivo)
  [12] V. MENSAL
  [13] VENCIMENTO (do último aditivo)
  [14] MENSAL 1º ADITIVO
  [15] VENCIMENTO 1º ADITIVO
  [16] MENSAL 2º ADITIVO
  [17] VENCIMENTO 2º ADITIVO
  [18] MENSAL 3º ADITIVO
  [19] VENCIMENTO 3º ADITIVO
  [20] MENSAL 4º ADITIVO
  [21] VENCIMENTO 4º ADITIVO
  [22] EMERGENCIAL VALOR
  [23] EMERGENCIAL VENCIMENTO
  [27] PORTARIA
  [28] FISCAL EFETIVO
  [29] MATRÍCULA FISCAL
  [30] SUBSTITUTO
  [31] MATRÍCULA SUBSTITUTO
*/
function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 3) return []; // 2 header rows + data
  return lines.slice(2).map(line => {
    const c = splitCSVLine(line);
    const g = (i) => (c[i] || "").replace(/\n/g, " ").trim();

    // Determinar estado atual do contrato
    const aditivoRaw = g(10); // "4º", "3°", "1°", "-", ""
    let estado = "Contrato Inicial";
    if (g(22) && g(22) !== "-") {
      estado = "Emergencial";
    } else if (aditivoRaw && aditivoRaw !== "-") {
      const n = aditivoRaw.replace(/[°º]/g, "").trim();
      const map = { "1": "1º Aditivo", "2": "2º Aditivo", "3": "3º Aditivo", "4": "4º Aditivo" };
      estado = map[n] || `${aditivoRaw} Aditivo`;
    }

    // Último vencimento: prioridade — col 13 (último aditivo) > emergencial > inicial
    let ultimoVenc = g(13);
    if (!ultimoVenc || ultimoVenc === "-") ultimoVenc = g(23); // emergencial
    if (!ultimoVenc || ultimoVenc === "-") ultimoVenc = g(9);  // inicial

    // Último valor: col 11 (V. CONTRATO do último aditivo) > col 22 (emergencial) > col 7 (inicial)
    let ultimoValor = g(11);
    if (!ultimoValor || ultimoValor === "-") ultimoValor = g(22);
    if (!ultimoValor || ultimoValor === "-") ultimoValor = g(7);

    return {
      contratada: g(1),
      lei:        g(2),
      processo:   g(3),
      modalidade: g(4),
      objeto:     g(5),
      contrato:   g(6),
      setor:      "",   // não existe coluna setor na planilha
      fiscalEfetivo: g(28),
      substituto:    g(30),
      estado,
      ultimoVenc,
      ultimoValor,
      // internos p/ fallback
      _vencInicial: g(9),
      _valorInicial: g(7),
    };
  }).filter(r => r.contrato && r.contrato !== "" && r.objeto !== "");
}

function parseDate(str) {
  if (!str) return null;
  const parts = str.split("/");
  if (parts.length === 3) return new Date(+parts[2], +parts[1] - 1, +parts[0]);
  return new Date(str);
}

function formatDate(str) {
  if (!str) return "—";
  const d = parseDate(str);
  if (!d || isNaN(d)) return str;
  return d.toLocaleDateString("pt-BR");
}

function formatMoney(str) {
  if (!str) return "—";
  const clean = str.replace(/[R$\s.]/g, "").replace(",", ".");
  const n = parseFloat(clean);
  if (isNaN(n)) return str;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getStatusVencimento(dateStr) {
  const d = parseDate(dateStr);
  if (!d || isNaN(d)) return { label: "Sem data", color: "#8b949e" };
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const diff = Math.ceil((d - hoje) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { label: "Vencido", color: "#f85149" };
  if (diff <= 30) return { label: `Vence em ${diff}d`, color: "#e3b341" };
  if (diff <= 90) return { label: `Vence em ${diff}d`, color: "#f0883e" };
  return { label: `Vence em ${diff}d`, color: "#3fb950" };
}


const LEI_COLORS = {
  "8.666":  { label: "Lei 8.666/93",  color: "#58a6ff", bg: "#58a6ff18" },
  "14.133": { label: "Lei 14.133/21", color: "#bc8cff", bg: "#bc8cff18" },
};
const ESTADO_COLORS = {
  "Contrato Inicial": "#3fb950",
  "1º Aditivo":       "#58a6ff",
  "2º Aditivo":       "#f0883e",
  "3º Aditivo":       "#e3b341",
  "4º Aditivo":       "#f85149",
  "Emergencial":      "#bc8cff",
};

function useContratoDerived(row) {
  const vencStatus = getStatusVencimento(row.ultimoVenc);
  const leiKey     = Object.keys(LEI_COLORS).find(k => row.lei.includes(k));
  const leiInfo    = leiKey ? LEI_COLORS[leiKey] : { label: row.lei || "Lei N/D", color: "#8b949e", bg: "#8b949e18" };
  const estadoColor = ESTADO_COLORS[row.estado] || "#8b949e";
  return { vencStatus, leiInfo, estadoColor };
}

// ── Modal de detalhe ──────────────────────────────────────────────────────────
function ContratoModal({ row, onClose }) {
  const { vencStatus, leiInfo, estadoColor } = useContratoDerived(row);

  // Fechar com Escape
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const Field = ({ label, value, mono, accent }) => (
    <div className="cdm-field">
      <span className="cdm-label">{label}</span>
      <span className="cdm-value" style={{
        fontFamily: mono ? "monospace" : undefined,
        color: accent || undefined,
        fontSize: mono ? "0.75rem" : undefined,
      }}>{value || "—"}</span>
    </div>
  );

  return (
    <div className="cdm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cdm-box">

        {/* ── Topo colorido ── */}
        <div className="cdm-hero" style={{ borderBottom: `3px solid ${vencStatus.color}` }}>
          <div className="cdm-hero-badges">
            <span className="cc2-estado" style={{ background: estadoColor + "22", color: estadoColor, borderColor: estadoColor + "55" }}>
              {row.estado}
            </span>
            <span className="cc2-lei" style={{ background: leiInfo.bg, color: leiInfo.color, borderColor: leiInfo.color + "44" }}>
              {leiInfo.label}
            </span>
            <span className="cc2-venc-badge" style={{ background: vencStatus.color + "22", color: vencStatus.color, borderColor: vencStatus.color + "55", marginLeft: "auto" }}>
              {vencStatus.label}
            </span>
          </div>
          <div className="cdm-hero-num">Contrato Nº {row.contrato}</div>
          <div className="cdm-hero-objeto">{row.objeto}</div>
          <button className="cdm-close" onClick={onClose}><IconClose /></button>
        </div>

        {/* ── Corpo scrollável ── */}
        <div className="cdm-body">

          {/* Processo */}
          {row.processo && (
            <div className="cdm-section">
              <div className="cdm-section-title">📋 Processo</div>
              <div className="cdm-grid">
                <Field label="Nº do Processo" value={row.processo} />
                <Field label="Modalidade" value={row.modalidade} />
              </div>
            </div>
          )}

          {/* Vigência & Valor */}
          <div className="cdm-section">
            <div className="cdm-section-title">💰 Vigência & Valor</div>
            <div className="cdm-grid">
              <Field label="Último vencimento" value={formatDate(row.ultimoVenc)} accent={vencStatus.color} />
              <Field label="Último valor" value={formatMoney(row.ultimoValor)} accent="#f0883e" />
            </div>
          </div>

          {/* Fiscalização */}
          <div className="cdm-section">
            <div className="cdm-section-title">👤 Fiscalização</div>
            <div className="cdm-grid">
              <Field label="Fiscal efetivo" value={row.fiscalEfetivo} />
              <Field
                label="Fiscal substituto"
                value={row.substituto && row.substituto !== "-" ? row.substituto : "Sem substituto designado"}
                accent={(!row.substituto || row.substituto === "-") ? "#8b949e" : undefined}
              />
            </div>
          </div>

        </div>

        {/* ── Rodapé ── */}
        <div className="cdm-footer">
          <button className="btn-cancel-lg" onClick={onClose}>Fechar</button>
        </div>

      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
function ContratoCard({ row }) {
  const [open, setOpen] = useState(false);
  const { vencStatus, leiInfo, estadoColor } = useContratoDerived(row);

  return (
    <>
      <div
        className="cc2-card"
        style={{ "--sc": vencStatus.color, "--ec": estadoColor, cursor: "pointer" }}
        onClick={() => setOpen(true)}
        title="Clique para ver detalhes"
      >
        {/* Faixa lateral = cor do vencimento */}
        <div className="cc2-stripe" style={{ background: vencStatus.color }} />

        <div className="cc2-body">
          {/* ── Linha 1: Nº Contrato + Estado + Lei ── */}
          <div className="cc2-top">
            <span className="cc2-num">Nº {row.contrato}</span>
            <span className="cc2-estado" style={{ background: estadoColor + "22", color: estadoColor, borderColor: estadoColor + "55" }}>
              {row.estado}
            </span>
            <span className="cc2-lei" style={{ background: leiInfo.bg, color: leiInfo.color, borderColor: leiInfo.color + "44" }}>
              {leiInfo.label}
            </span>
            <span className="cc2-venc-badge" style={{ background: vencStatus.color + "22", color: vencStatus.color, borderColor: vencStatus.color + "55" }}>
              {vencStatus.label}
            </span>
          </div>

          {/* ── Linha 2: Objeto ── */}
          <div className="cc2-objeto">{row.objeto}</div>

          {/* ── Linha 3: Fiscais ── */}
          <div className="cc2-fiscais">
            {row.fiscalEfetivo && (
              <span className="cc2-fiscal-item">
                <span className="cc2-fiscal-label">Fiscal</span>
                <span className="cc2-fiscal-val">{row.fiscalEfetivo}</span>
              </span>
            )}
            <span className="cc2-fiscal-item">
              <span className="cc2-fiscal-label">Substituto</span>
              <span className="cc2-fiscal-val cc2-subst">
                {row.substituto && row.substituto !== "-" ? row.substituto : "Sem substituto designado"}
              </span>
            </span>
          </div>

          {/* ── Linha 4: Valor + Vencimento ── */}
          <div className="cc2-bottom">
            <div className="cc2-valor-wrap">
              <span className="cc2-bottom-label">Último valor</span>
              <span className="cc2-valor">{formatMoney(row.ultimoValor)}</span>
            </div>
            <div className="cc2-venc-wrap">
              <span className="cc2-bottom-label">Vence em</span>
              <span className="cc2-venc-val" style={{ color: vencStatus.color }}>{formatDate(row.ultimoVenc)}</span>
            </div>
          </div>
        </div>
      </div>

      {open && <ContratoModal row={row} onClose={() => setOpen(false)} />}
    </>
  );
}

// Detecta o tipo de link e devolve URL pronta para download
// Tipos: 'pub-csv' | 'sheets-csv' | 'drive-xlsx' | 'unknown'
function toGSheetsCsvUrl(input) {
  const str = input.trim();
  if (!str) return { url: "", type: "unknown", sheetId: null, gid: null };

  // 1. Link já publicado como CSV
  if (str.includes("docs.google.com/spreadsheets") && str.includes("/pub") && str.includes("output=csv")) {
    return { url: str, type: "pub-csv", sheetId: null, gid: null };
  }

  // 2. Detecta upload de Excel (.xlsx) no Drive
  // Indícios: rtpof=true e/ou sd=true (Source Document) — arquivos Office hospedados
  const isExcelUpload = str.includes("rtpof=true") || str.includes("sd=true");

  // 3. Extrai ID padrão (/spreadsheets/d/ID/...)
  let match = str.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) match = str.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9_-]+)/);
  // Também aceita link direto do Drive (/file/d/ID/...)
  if (!match) match = str.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);

  if (match) {
    const id = match[1];
    const gidMatch = str.match(/[#&?]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : "0";

    if (isExcelUpload || str.includes("/file/d/")) {
      // Arquivo .xlsx hospedado no Drive — usa endpoint de download direto
      return {
        url: `https://docs.google.com/uc?export=download&id=${id}`,
        type: "drive-xlsx",
        sheetId: id,
        gid: null,
      };
    }

    // Google Sheets nativo — exporta como CSV
    return {
      url: `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`,
      type: "sheets-csv",
      sheetId: id,
      gid,
    };
  }

  return { url: str, type: "unknown", sheetId: null, gid: null };
}

// Wrapper compatível
function toGSheetsCsvUrlString(input) {
  return toGSheetsCsvUrl(input).url;
}

const SYNC_INTERVALS = [
  { label: "1 min", value: 1 },
  { label: "5 min", value: 5 },
  { label: "10 min", value: 10 },
  { label: "30 min", value: 30 },
  { label: "Manual", value: 0 },
];

function ContratosAtivos() {
  const [csvUrl, setCsvUrl] = useStorage("licit_csv_url", "");
  const [syncInterval, setSyncInterval] = useStorage("licit_sync_interval", 5);
  const [inputUrl, setInputUrl] = useState("");
  const [contratos, setContratos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [fonte, setFonte] = useState("link");
  const [fileName, setFileName] = useState("");
  const [lastSync, setLastSync] = useState(null);
  const [nextSyncIn, setNextSyncIn] = useState(null);
  const [showConfig, setShowConfig] = useState(false);
  const fileRef = useRef();
  const syncTimerRef = useRef(null);
  const countdownRef = useRef(null);
  const [cols] = useState({
    contratada: "CONTRATADAS", objeto: "OBJETO", contrato: "Nº CONTRATO",
    modalidade: "MODALIDADE", valorInicial: "VALOR INICIAL", fiscal: "FISCAL DE CONTRATO",
  });

  // Carrega SheetJS dinamicamente (só quando precisa de Excel)
  const loadSheetJS = () => new Promise((resolve, reject) => {
    if (window.XLSX) return resolve(window.XLSX);
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => reject(new Error("Falha ao carregar a biblioteca de Excel."));
    document.head.appendChild(script);
  });

  // Lista de proxies CORS (tenta em ordem até um funcionar)
  const CORS_PROXIES = [
    (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
    (u) => `https://cors.eu.org/${u}`,
    (u) => u, // último: tenta direto (funciona pra alguns casos)
  ];

  // Faz fetch com fallback entre proxies
  const fetchWithFallback = async (rawUrl, asArrayBuffer = false) => {
    const cacheBust = rawUrl + (rawUrl.includes("?") ? "&" : "?") + "_t=" + Date.now();
    let lastError = null;
    for (const buildProxy of CORS_PROXIES) {
      try {
        const proxied = buildProxy(cacheBust);
        const res = await fetch(proxied, { redirect: "follow" });
        if (!res.ok) { lastError = new Error(`HTTP ${res.status}`); continue; }
        return asArrayBuffer ? await res.arrayBuffer() : await res.text();
      } catch (e) {
        lastError = e;
        continue;
      }
    }
    throw lastError || new Error("Todos os proxies falharam.");
  };

  const fetchCSV = async (url, silent = false) => {
    if (!silent) setLoading(true); else setSyncing(true);
    setError("");
    const detected = typeof url === "string" ? toGSheetsCsvUrl(url) : { url, type: "sheets-csv" };
    const csvUrl_ = detected.url;
    const isExcel = detected.type === "drive-xlsx";
    try {
      let rows;
      if (isExcel) {
        const XLSX = await loadSheetJS();
        const buffer = await fetchWithFallback(csvUrl_, true);
        const wb = XLSX.read(buffer, { type: "array" });
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        const csv = XLSX.utils.sheet_to_csv(firstSheet);
        rows = parseCSV(csv);
      } else {
        const text = await fetchWithFallback(csvUrl_, false);
        if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
          throw new Error("Planilha não está pública. Em Compartilhar, libere para 'Qualquer pessoa com o link'.");
        }
        rows = parseCSV(text);
      }

      if (rows.length === 0) throw new Error("Planilha vazia ou formato inválido.");
      setContratos(rows);
      setCsvUrl(url);
      setLastSync(new Date());
    } catch (e) {
      const msg = e.message === "Failed to fetch"
        ? "Não foi possível baixar o arquivo. Verifique sua conexão ou tente upload manual."
        : (e.message || "Erro ao carregar.");
      if (!silent) setError(msg);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  // Auto-sync scheduler
  const scheduleSync = (url, intervalMin) => {
    if (syncTimerRef.current) clearInterval(syncTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (!url || intervalMin === 0) { setNextSyncIn(null); return; }

    const ms = intervalMin * 60 * 1000;
    let remaining = ms;

    countdownRef.current = setInterval(() => {
      remaining -= 1000;
      setNextSyncIn(Math.max(0, Math.ceil(remaining / 1000)));
      if (remaining <= 0) remaining = ms;
    }, 1000);

    syncTimerRef.current = setInterval(() => {
      remaining = ms;
      fetchCSV(url, true);
    }, ms);

    setNextSyncIn(Math.ceil(ms / 1000));
  };

  useEffect(() => {
    if (csvUrl && fonte === "link") {
      fetchCSV(csvUrl);
      scheduleSync(csvUrl, syncInterval);
    }
    return () => {
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  useEffect(() => {
    if (csvUrl && fonte === "link") scheduleSync(csvUrl, syncInterval);
    else {
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      setNextSyncIn(null);
    }
  }, [syncInterval, csvUrl, fonte]);

  const formatCountdown = (secs) => {
    if (secs === null) return null;
    if (secs <= 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  };

  const handleConnect = () => {
    const raw = inputUrl.trim();
    if (!raw) return;
    const result = toGSheetsCsvUrl(raw);
    if (result.type === "unknown") {
      setError("Link não reconhecido. Cole um link válido do Google Sheets.");
      return;
    }
    fetchCSV(result.url);
    scheduleSync(result.url, syncInterval);
    setInputUrl("");
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true); setError("");
    setFileName(file.name);
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    try {
      let rows;
      if (isExcel) {
        const XLSX = await loadSheetJS();
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array" });
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        const csv = XLSX.utils.sheet_to_csv(firstSheet);
        rows = parseCSV(csv);
      } else {
        const text = await file.text();
        rows = parseCSV(text);
      }
      if (rows.length === 0) throw new Error("Arquivo vazio ou formato não reconhecido.");
      setContratos(rows);
      setLastSync(new Date());
    } catch (err) {
      setError(err.message || "Erro ao ler o arquivo.");
    } finally {
      setLoading(false);
    }
  };

  const hoje = new Date(); hoje.setHours(0,0,0,0);

  const filtered = contratos.filter(row => {
    const texto = Object.values(row).join(" ").toLowerCase();
    if (search && !texto.includes(search.toLowerCase())) return false;
    if (filterStatus !== "todos") {
      const d = parseDate(row.ultimoVenc);
      const diff = d ? Math.ceil((d - hoje) / (1000 * 60 * 60 * 24)) : null;
      if (filterStatus === "vencido" && (diff === null || diff >= 0)) return false;
      if (filterStatus === "alerta" && (diff === null || diff < 0 || diff > 90)) return false;
      if (filterStatus === "ok" && (diff === null || diff <= 90)) return false;
    }
    return true;
  });

  const totalVencidos = contratos.filter(r => {
    const d = parseDate(r.ultimoVenc);
    return d && Math.ceil((d - hoje) / (1000 * 60 * 60 * 24)) < 0;
  }).length;
  const totalAlerta = contratos.filter(r => {
    const d = parseDate(r.ultimoVenc);
    const diff = d ? Math.ceil((d - hoje) / (1000 * 60 * 60 * 24)) : null;
    return diff !== null && diff >= 0 && diff <= 90;
  }).length;

  return (
    <div className="contratos-page">

      {/* Painel de fonte de dados */}
      <div className="contratos-config">
        {/* Abas link / arquivo */}
        <div style={{ width: "100%" }}>
          <div className="fonte-tabs">
            <button className={`fonte-tab ${fonte === "link" ? "active" : ""}`} onClick={() => setFonte("link")}>
              <IconLink />
              Link Google Sheets
              <span className="fonte-badge">Tempo real</span>
            </button>
            <button className={`fonte-tab ${fonte === "arquivo" ? "active" : ""}`} onClick={() => setFonte("arquivo")}>
              <IconUpload />
              Upload de arquivo
              <span className="fonte-badge">CSV / Excel</span>
            </button>
          </div>

          {/* Painel Link */}
          {fonte === "link" && (
            <div className="fonte-panel">
              <p className="contratos-config-label">Cole o link do Google Sheets (qualquer formato)</p>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <input className="csv-input"
                  placeholder="https://docs.google.com/spreadsheets/d/... (link de edição ou publicação)"
                  value={inputUrl} onChange={e => setInputUrl(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleConnect()} />
                <button className="btn-primary" onClick={handleConnect} disabled={!inputUrl.trim() || loading}>
                  {loading ? "Carregando..." : csvUrl ? "Atualizar link" : "Conectar"}
                </button>
              </div>
              {/* Hint de conversão automática */}
              {(() => {
                if (!inputUrl.trim()) return null;
                const detected = toGSheetsCsvUrl(inputUrl);
                if (detected.type === "pub-csv") {
                  return <p style={{ fontSize: "0.7rem", color: "#3fb950", marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>✓ Link CSV publicado — pronto pra conectar</p>;
                }
                if (detected.type === "drive-xlsx") {
                  return (
                    <div style={{ marginTop: 6, padding: "8px 10px", background: "rgba(63,185,80,.08)", border: "1px solid rgba(63,185,80,.25)", borderRadius: 8 }}>
                      <p style={{ fontSize: "0.72rem", color: "#3fb950", marginBottom: 3 }}>✦ Arquivo Excel (.xlsx) detectado — será baixado e processado</p>
                      <p style={{ fontSize: "0.66rem", color: "#8b949e", lineHeight: 1.4 }}>
                        O arquivo precisa estar com <strong style={{ color: "#e6edf3" }}>"Qualquer pessoa com o link pode ver"</strong> em Compartilhar. Lê apenas a primeira aba.
                      </p>
                    </div>
                  );
                }
                if (detected.type === "sheets-csv") {
                  return (
                    <div style={{ marginTop: 6, padding: "8px 10px", background: "rgba(88,166,255,.08)", border: "1px solid rgba(88,166,255,.25)", borderRadius: 8 }}>
                      <p style={{ fontSize: "0.72rem", color: "#58a6ff", marginBottom: 3 }}>✦ Link de Google Sheets — será convertido para CSV</p>
                      <p style={{ fontSize: "0.66rem", color: "#8b949e", lineHeight: 1.4 }}>
                        Sua planilha precisa estar com <strong style={{ color: "#e6edf3" }}>"Qualquer pessoa com o link pode ver"</strong> em Compartilhar.
                      </p>
                    </div>
                  );
                }
                if (detected.type === "unknown" && inputUrl.trim().length > 10) {
                  return <p style={{ fontSize: "0.7rem", color: "#f85149", marginTop: 6 }}>✗ Link não reconhecido. Verifique se é do Google Sheets ou Drive.</p>;
                }
                return null;
              })()}

              {/* Status bar */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, flexWrap: "wrap", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {csvUrl && !error && (
                    <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.72rem", color: "#3fb950" }}>
                      {syncing
                        ? <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#e3b341" }} />
                        : <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#3fb950" }} />}
                      {syncing ? "Sincronizando..." : `Conectado · ${contratos.length} contratos`}
                      {lastSync && !syncing && ` · ${lastSync.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
                    </span>
                  )}
                  {error && <span style={{ fontSize: "0.72rem", color: "#f85149" }}>Erro: {error}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {csvUrl && nextSyncIn !== null && (
                    <span style={{ fontSize: "0.68rem", color: "#8b949e" }}>
                      Próxima sync: <strong style={{ color: "#58a6ff" }}>{formatCountdown(nextSyncIn)}</strong>
                    </span>
                  )}
                  {csvUrl && (
                    <button className="btn-outline" onClick={() => fetchCSV(csvUrl, true)} disabled={loading || syncing} style={{ fontSize: "0.75rem", padding: "4px 10px" }}>
                      {syncing ? "Sincronizando..." : "Sincronizar agora"}
                    </button>
                  )}
                </div>
              </div>

              {/* Sync interval selector */}
              {csvUrl && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, padding: "8px 12px", background: "#1c2330", borderRadius: 8, border: "1px solid #30363d" }}>
                  <span style={{ fontSize: "0.72rem", color: "#8b949e", flexShrink: 0 }}>Sincronizar a cada:</span>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {SYNC_INTERVALS.map(opt => (
                      <button key={opt.value}
                        onClick={() => setSyncInterval(opt.value)}
                        style={{
                          fontSize: "0.7rem", padding: "3px 9px", borderRadius: 99, border: "1px solid",
                          cursor: "pointer", transition: "all .15s", fontFamily: "'DM Sans', sans-serif",
                          background: syncInterval === opt.value ? "#f0883e22" : "transparent",
                          color: syncInterval === opt.value ? "#f0883e" : "#8b949e",
                          borderColor: syncInterval === opt.value ? "#f0883e66" : "#30363d",
                        }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!csvUrl && (
                <div style={{ marginTop: 10, padding: "10px 12px", background: "#161b22", borderRadius: 8, border: "1px solid #30363d" }}>
                  <p style={{ fontSize: "0.72rem", color: "#8b949e", marginBottom: 4 }}>
                    <strong style={{ color: "#e6edf3" }}>Como publicar sua planilha:</strong>
                  </p>
                  <div style={{ fontSize: "0.7rem", color: "#8b949e", display: "flex", flexDirection: "column", gap: 2 }}>
                    <span>1. No Google Sheets: <strong style={{ color: "#e6edf3" }}>Arquivo → Compartilhar → Publicar na web</strong></span>
                    <span>2. Selecione a aba e o formato <strong style={{ color: "#e6edf3" }}>Valores separados por vírgula (.csv)</strong></span>
                    <span>3. Clique em <strong style={{ color: "#e6edf3" }}>Publicar</strong> e cole o link acima</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Painel Upload */}
          {fonte === "arquivo" && (
            <div className="fonte-panel">
              <p className="contratos-config-label">Faça upload do arquivo exportado (.csv)</p>
              <p style={{ fontSize: "0.72rem", color: "#8b949e", margin: "4px 0 10px" }}>
                No Google Sheets: <strong style={{ color: "#e6edf3" }}>Arquivo → Fazer download → Valores separados por vírgula (.csv)</strong>
              </p>
              <div
                className="upload-zone"
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("drag-over"); }}
                onDragLeave={e => e.currentTarget.classList.remove("drag-over")}
                onDrop={e => {
                  e.preventDefault();
                  e.currentTarget.classList.remove("drag-over");
                  const file = e.dataTransfer.files?.[0];
                  if (file) { const dt = new DataTransfer(); dt.items.add(file); fileRef.current.files = dt.files; handleFileUpload({ target: { files: [file] } }); }
                }}
              >
                <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" style={{ display: "none" }} onChange={handleFileUpload} />
                {loading ? (
                  <p style={{ color: "#8b949e", fontSize: "0.85rem" }}>Lendo arquivo...</p>
                ) : fileName ? (
                  <div style={{ textAlign: "center" }}>
                    <p style={{ color: "#3fb950", fontSize: "0.85rem", fontWeight: 600 }}>✓ {fileName}</p>
                    <p style={{ color: "#8b949e", fontSize: "0.72rem", marginTop: 4 }}>{contratos.length} contratos carregados · Clique para trocar o arquivo</p>
                  </div>
                ) : (
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: "1.8rem", marginBottom: 8 }}>📂</p>
                    <p style={{ color: "#e6edf3", fontSize: "0.85rem", fontWeight: 600 }}>Clique ou arraste o arquivo aqui</p>
                    <p style={{ color: "#8b949e", fontSize: "0.72rem", marginTop: 4 }}>Suporta .csv exportado do Google Sheets ou Excel</p>
                  </div>
                )}
              </div>
              {error && <p style={{ fontSize: "0.72rem", color: "#f85149", marginTop: 6 }}>⚠ {error}</p>}
              {lastSync && !error && fileName && (
                <p style={{ fontSize: "0.7rem", color: "#8b949e", marginTop: 4 }}>
                  Carregado às {lastSync.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · Para atualizar, faça upload novamente
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {contratos.length > 0 && (
        <>
          {/* Resumo */}
          <div className="contratos-resumo">
            <div className="resumo-card" onClick={() => setFilterStatus("todos")} style={{ borderLeftColor: "#58a6ff", cursor: "pointer" }}>
              <div className="resumo-val" style={{ color: "#58a6ff" }}>{contratos.length}</div>
              <div className="resumo-label">Total de contratos</div>
            </div>
            <div className="resumo-card" onClick={() => setFilterStatus("alerta")} style={{ borderLeftColor: "#e3b341", cursor: "pointer" }}>
              <div className="resumo-val" style={{ color: "#e3b341" }}>{totalAlerta}</div>
              <div className="resumo-label">Vencem em 90 dias</div>
            </div>
            <div className="resumo-card" onClick={() => setFilterStatus("vencido")} style={{ borderLeftColor: "#f85149", cursor: "pointer" }}>
              <div className="resumo-val" style={{ color: "#f85149" }}>{totalVencidos}</div>
              <div className="resumo-label">Vencidos</div>
            </div>
            <div className="resumo-card" onClick={() => setFilterStatus("ok")} style={{ borderLeftColor: "#3fb950", cursor: "pointer" }}>
              <div className="resumo-val" style={{ color: "#3fb950" }}>{contratos.length - totalAlerta - totalVencidos}</div>
              <div className="resumo-label">Em dia</div>
            </div>
          </div>

          {/* Filtros e busca */}
          <div className="contratos-filters">
            <input className="contratos-search" placeholder="🔍  Buscar por objeto, fiscal, contrato..."
              value={search} onChange={e => setSearch(e.target.value)} />
            <div className="filter-btns">
              {[["todos","Todos"],["ok","Em dia"],["alerta","⚠ Alerta"],["vencido","Vencidos"]].map(([v,l]) => (
                <button key={v} className={`filter-btn ${filterStatus === v ? "active" : ""}`}
                  onClick={() => setFilterStatus(v)}>{l}</button>
              ))}
            </div>
          </div>

          {/* Cards */}
          {loading ? (
            <div className="contratos-loading">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="contratos-empty">Nenhum contrato encontrado com esses filtros.</div>
          ) : (
            <div className="cc2-grid">
              {filtered.map((row, i) => (
                <ContratoCard key={i} row={row} />
              ))}
            </div>
          )}
        </>
      )}

      {contratos.length === 0 && !loading && (
        <div className="contratos-empty-state">
          <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>📄</div>
          <h3>Nenhum dado carregado</h3>
          <p>Use o link do Google Sheets para atualização em tempo real, ou faça upload do arquivo CSV para carregar manualmente.</p>
        </div>
      )}
    </div>
  );
}

const LICIT_SESS_USER = "licit_sess_user";
const LICIT_SESS_PASS = "licit_sess_pass";

function clearLicitSessionCredentials() {
  try {
    sessionStorage.removeItem(LICIT_SESS_USER);
    sessionStorage.removeItem(LICIT_SESS_PASS);
  } catch { /* ignore */ }
}

function ProfileMenu({ token, onLogout }) {
  const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState(null);
  const [meLoading, setMeLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const wrapRef = useRef(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [resetErr, setResetErr] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePw, setDeletePw] = useState("");
  const [deleteErr, setDeleteErr] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMeLoading(true);
    fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (r.status === 401 || r.status === 403) {
          onLogout();
          throw new Error("Unauthorized");
        }
        return r.json();
      })
      .then((data) => setMe(data))
      .catch(() => setMe(null))
      .finally(() => setMeLoading(false));
  }, [open, token, API_URL, onLogout]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  let sessionPass = null;
  let sessionUser = null;
  try {
    sessionPass = sessionStorage.getItem(LICIT_SESS_PASS);
    sessionUser = sessionStorage.getItem(LICIT_SESS_USER);
  } catch { /* ignore */ }

  const displayUser = me?.username ?? sessionUser ?? "—";

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetErr("");
    if (newPw.length < 4) {
      setResetErr("Nova senha muito curta");
      return;
    }
    if (newPw !== newPw2) {
      setResetErr("Confirmação não confere");
      return;
    }
    setResetLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResetErr(data.error || "Não foi possível alterar");
        return;
      }
      try {
        sessionStorage.setItem(LICIT_SESS_PASS, newPw);
      } catch { /* ignore */ }
      setShowResetModal(false);
      setCurrentPw("");
      setNewPw("");
      setNewPw2("");
      setOpen(false);
    } catch {
      setResetErr("Erro de conexão");
    } finally {
      setResetLoading(false);
    }
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    setDeleteErr("");
    setDeleteLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/account`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password: deletePw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteErr(data.error || "Falha ao apagar");
        return;
      }
      clearLicitSessionCredentials();
      onLogout();
    } catch {
      setDeleteErr("Erro de conexão");
    } finally {
      setDeleteLoading(false);
    }
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
                <span className="profile-value profile-mono">
                  {sessionPass ? (showPass ? sessionPass : "••••••••") : "—"}
                </span>
                {sessionPass ? (
                  <button type="button" className="icon-btn" aria-label={showPass ? "Ocultar senha" : "Mostrar senha"} onClick={() => setShowPass((p) => !p)}>
                    {showPass ? <IconEyeOff /> : <IconEye />}
                  </button>
                ) : null}
              </div>
            </div>
            {!sessionPass ? (
              <p className="profile-hint">A senha digitada no login fica visível aqui só nesta sessão do navegador (por segurança, o servidor não guarda a senha em texto).</p>
            ) : null}
            <div className="profile-actions-col">
              <button
                type="button"
                className="btn-outline profile-action-full"
                onClick={() => {
                  setOpen(false);
                  setShowResetModal(true);
                  setResetErr("");
                  setCurrentPw("");
                  setNewPw("");
                  setNewPw2("");
                }}
              >
                Redefinir senha
              </button>
              <button
                type="button"
                className="btn-outline profile-action-full profile-danger-btn"
                onClick={() => {
                  setOpen(false);
                  setShowDeleteModal(true);
                  setDeleteErr("");
                  setDeletePw("");
                }}
              >
                Apagar conta
              </button>
            </div>
          </div>
        )}
      </div>

      {showResetModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowResetModal(false)}>
          <div className="modal sm-modal">
            <div className="modal-header">
              <h2>Redefinir senha</h2>
              <button type="button" className="icon-btn" onClick={() => setShowResetModal(false)} aria-label="Fechar">
                <IconClose />
              </button>
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
                <button type="button" className="btn-cancel" onClick={() => setShowResetModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-confirm" disabled={resetLoading}>
                  {resetLoading ? "Salvando..." : "Salvar"}
                </button>
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
              <button type="button" className="icon-btn" onClick={() => setShowDeleteModal(false)} aria-label="Fechar">
                <IconClose />
              </button>
            </div>
            <form className="modal-body col" onSubmit={handleDeleteAccount}>
              <p className="profile-muted profile-delete-lead">Esta ação não pode ser desfeita. Digite sua senha para confirmar.</p>
              <label className="profile-form-label">Senha</label>
              <input className="doc-input" type="password" value={deletePw} onChange={(e) => setDeletePw(e.target.value)} required autoComplete="current-password" />
              {deleteErr ? <div className="profile-err">{deleteErr}</div> : null}
              <div className="modal-footer profile-modal-footer">
                <button type="button" className="btn-cancel" onClick={() => setShowDeleteModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn-confirm profile-delete-submit" disabled={deleteLoading}>
                  {deleteLoading ? "Removendo..." : "Apagar definitivamente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function AdminPanel({ token, currentUserId, onUnauthorized, onSelfDemoted }) {
  const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    setErr("");
    setLoading(true);
    fetch(`${API_URL}/api/admin/users`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (r.status === 401) throw new Error("401");
        if (r.status === 403) {
          setErr("Sem permissão para acessar o painel.");
          setUsers([]);
          return null;
        }
        if (!r.ok) throw new Error("fail");
        return r.json();
      })
      .then((data) => {
        if (data) setUsers(data);
      })
      .catch((e) => {
        if (e.message === "401") onUnauthorized();
        else if (e.message !== "fail") setErr("Não foi possível carregar a lista.");
      })
      .finally(() => setLoading(false));
  }, [API_URL, token, onUnauthorized]);

  useEffect(() => {
    load();
  }, [load]);

  const patchRole = (id, role) => {
    fetch(`${API_URL}/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ role }),
    })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setErr(data.error || "Falha ao atualizar");
          load();
          return;
        }
        if (id === currentUserId && role === "user") {
          onSelfDemoted();
          return;
        }
        load();
      })
      .catch(() => {
        setErr("Erro de conexão");
        load();
      });
  };

  const deleteUser = (id) => {
    if (!window.confirm("Remover este usuário permanentemente?")) return;
    fetch(`${API_URL}/api/admin/users/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setErr(data.error || "Falha ao remover");
          return;
        }
        load();
      })
      .catch(() => setErr("Erro de conexão"));
  };

  const fmtDate = (d) => {
    if (!d) return "—";
    try {
      return new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    } catch {
      return "—";
    }
  };

  const adminCount = users.filter((u) => u.role === "admin").length;

  return (
    <div className="admin-panel">
      <div className="admin-panel-inner">
        <h1 className="admin-title">Painel de administração</h1>
        <p className="admin-lead">Gerencie contas: papel (usuário ou administrador) e exclusão de cadastros.</p>
        {err ? (
          <div className="profile-err admin-alert">
            {err}
          </div>
        ) : null}
        {loading ? (
          <div className="admin-muted">Carregando...</div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Papel</th>
                  <th>Cadastro</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const onlyAdmin = u.role === "admin" && adminCount <= 1;
                  return (
                    <tr key={u.id}>
                      <td className="admin-td-user">
                        {u.username}
                        {u.id === currentUserId ? <span className="admin-you"> (você)</span> : null}
                      </td>
                      <td>
                        <select
                          className="admin-select doc-input"
                          value={u.role}
                          onChange={(e) => patchRole(u.id, e.target.value)}
                          disabled={onlyAdmin}
                          title={onlyAdmin ? "É necessário haver outro administrador antes de rebaixar este perfil" : ""}
                        >
                          <option value="user">Usuário</option>
                          <option value="admin">Administrador</option>
                        </select>
                      </td>
                      <td className="admin-muted">{fmtDate(u.created_at)}</td>
                      <td className="admin-td-actions">
                        <button
                          type="button"
                          className="icon-btn danger"
                          title="Remover usuário"
                          disabled={u.id === currentUserId}
                          onClick={() => deleteUser(u.id)}
                        >
                          <IconTrash />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Login ────────────────────────────────────────────────────────────────────
function Login({ onLogin }) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);

  const switchMode = (reg) => {
    setIsRegistering(reg);
    setError("");
    setSuccessMsg("");
    setShowPassword(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccessMsg("");
    try {
      const endpoint = isRegistering ? "/api/auth/register" : "/api/auth/login";
      const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (res.ok) {
        if (isRegistering) {
          setSuccessMsg("Cadastro realizado! Faça o login.");
          setIsRegistering(false);
          setPassword("");
        } else {
          try {
            sessionStorage.setItem(LICIT_SESS_USER, username);
            sessionStorage.setItem(LICIT_SESS_PASS, password);
          } catch { /* ignore */ }
          onLogin(data.accessToken);
        }
      } else {
        setError(data.error || (isRegistering ? "Erro ao cadastrar" : "Login falhou"));
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

      <div className="ls-card">
        <div className="ls-brand">
          <div className="ls-logo">Licit<span>Track</span></div>
          <p className="ls-tagline">Gestão inteligente de licitações</p>
        </div>

        <h2 className="ls-title">{isRegistering ? "Criar conta" : "Bem-vindo de volta"}</h2>
        <p className="ls-subtitle">{isRegistering ? "Preencha os dados para se registrar" : "Entre com suas credenciais"}</p>

        <div className="ls-tabs">
          <button type="button" className={`ls-tab${!isRegistering ? " ls-tab-active" : ""}`} onClick={() => switchMode(false)}>Entrar</button>
          <button type="button" className={`ls-tab${isRegistering ? " ls-tab-active" : ""}`} onClick={() => switchMode(true)}>Cadastrar</button>
        </div>

        {successMsg && (
          <div className="ls-success">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="ls-form">
          <div className="ls-field-wrap">
            <span className="ls-field-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
            </span>
            <input className="ls-input" type="text" placeholder="Usuário" value={username} onChange={e => setUsername(e.target.value)} required autoComplete="username"/>
          </div>
          <div className="ls-field-wrap">
            <span className="ls-field-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </span>
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

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [token, setToken] = useStorage("licit_auth_token", null);
  const [columns, setColumns] = useState([]);
  const [archived, setArchived] = useState([]);
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showNewProcess, setShowNewProcess] = useState(false);
  const [activeTab, setActiveTab] = useState("board");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("processos");
  const [sessionUser, setSessionUser] = useState(null);

  const handleLogout = useCallback(() => {
    clearLicitSessionCredentials();
    setToken(null);
  }, [setToken]);

  const loadSessionUser = useCallback(() => {
    if (!token) {
      setSessionUser(null);
      return;
    }
    const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";
    fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (r.status === 401 || r.status === 403) {
          handleLogout();
          throw new Error("auth");
        }
        return r.json();
      })
      .then(setSessionUser)
      .catch((e) => {
        if (e.message !== "auth") setSessionUser(null);
      });
  }, [token, handleLogout]);

  useEffect(() => {
    loadSessionUser();
  }, [loadSessionUser]);

  useEffect(() => {
    if (sessionUser && activeSection === "admin" && sessionUser.role !== "admin") {
      setActiveSection("processos");
    }
  }, [sessionUser, activeSection]);

  const handleSelfDemotedFromAdmin = useCallback(() => {
    loadSessionUser();
    setActiveSection("processos");
  }, [loadSessionUser]);

  useEffect(() => {
    if (!token) return;
    
    const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";

    fetch(`${API_URL}/api/processes`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => {
        if (res.status === 401 || res.status === 403) throw new Error('Unauthorized');
        return res.json();
      })
      .then(data => {
        setColumns(data.filter(p => p.status === 'active'));
        setArchived(data.filter(p => p.status === 'archived'));
      })
      .catch(err => {
        console.error(err);
        if (err.message === 'Unauthorized') handleLogout();
      });

    fetch(`${API_URL}/api/templates`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        if (Object.keys(data).length > 0) {
          const normalized = normalizeTemplatesFromApi(data);
          if (!localStorage.getItem('licit_tmpl_reset_v2')) {
            setTemplates({});
            fetch(`${API_URL}/api/templates`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({})
            }).catch(console.error);
            localStorage.setItem('licit_tmpl_reset_v2', '1');
          } else {
            setTemplates(normalized);
          }
        }
      })
      .catch(console.error);
  }, [token, handleLogout]);

  const SECTIONS = useMemo(() => {
    const base = [
      { id: "processos", label: "Acompanhar Processos", icon: IconClipboard },
      { id: "contratos", label: "Contratos Ativos", icon: IconFileText },
    ];
    if (sessionUser?.role === "admin") {
      base.push({ id: "admin", label: "Administração", icon: IconShield });
    }
    return base;
  }, [sessionUser?.role]);

  const apiFetch = (url, method, body) => {
    if (!token) return;
    const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";
    fetch(`${API_URL}${url}`, {
      method,
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: body ? JSON.stringify(body) : undefined
    }).then(res => {
      if (res.status === 401 || res.status === 403) setToken(null);
    }).catch(console.error);
  };

  const addColumn = (col) => {
    setColumns(p => [...p, col]);
    apiFetch('/api/processes', 'POST', col);
  };
  const deleteColumn = (id) => {
    setColumns(p => p.filter(c => c.id !== id));
    apiFetch(`/api/processes/${id}`, 'DELETE');
  };
  const renameColumn = (id, title) => {
    setColumns(p => {
      const next = p.map(c => c.id === id ? { ...c, title } : c);
      const col = next.find(c => c.id === id);
      if (col) apiFetch(`/api/processes/${id}`, 'PUT', { title: col.title, processNumber: col.processNumber, setor: col.setor });
      return next;
    });
  };
  const updateDocs = (colId, docs) => {
    setColumns(p => {
      const next = p.map(c => c.id === colId ? { ...c, docs } : c);
      apiFetch(`/api/processes/${colId}/items`, 'PUT', { docs });
      return next;
    });
  };
  const archiveColumn = (id) => {
    const col = columns.find(c => c.id === id);
    if (col) {
      setArchived(p => [...p, { ...col, archivedAt: new Date().toISOString() }]);
      setColumns(p => p.filter(c => c.id !== id));
      apiFetch(`/api/processes/${id}/status`, 'PUT', { status: 'archived' });
    }
  };
  const unarchiveColumn = (id) => {
    const col = archived.find(c => c.id === id);
    if (col) {
      setColumns(p => [...p, col]);
      setArchived(p => p.filter(c => c.id !== id));
      apiFetch(`/api/processes/${id}/status`, 'PUT', { status: 'active' });
    }
  };
  const deleteArchived = (id) => {
    setArchived(p => p.filter(c => c.id !== id));
    apiFetch(`/api/processes/${id}`, 'DELETE');
  };

  const saveTemplates = (newTemplates) => {
    setTemplates(newTemplates);
    apiFetch('/api/templates', 'PUT', newTemplates);
  };

  const getRegularDocs = (c) => normalizeDocs(c.docs || []).filter(d => d.type === "doc");
  const totalDocs = columns.reduce((a, c) => a + getRegularDocs(c).length, 0);
  const totalDone = columns.reduce((a, c) => a + getRegularDocs(c).filter(d => d.done).length, 0);

  const processTypeOrder = useMemo(() => orderedTemplateTypeNames(templates), [templates]);
  const sortedColumns = useMemo(() => {
    const rank = (idx) => (idx === -1 ? 999 : idx);
    return [...columns].sort((a, b) => {
      const keyA = a.type || "";
      const keyB = b.type || "";
      const idxA = processTypeOrder.indexOf(keyA);
      const idxB = processTypeOrder.indexOf(keyB);
      if (rank(idxA) !== rank(idxB)) return rank(idxA) - rank(idxB);
      return (a.title || "").localeCompare(b.title || "", "pt-BR");
    });
  }, [columns, processTypeOrder]);

  const TABS = [
    { id: "board", label: "Processos" },
    { id: "archive", label: archived.length ? `Arquivados (${archived.length})` : "Arquivados" },
    { id: "dashboard", label: "Dashboard" },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --bg: #0d1117; --surface: #161b22; --surface2: #1c2330; --border: #30363d;
          --accent: #f0883e; --accent2: #58a6ff; --green: #3fb950; --red: #f85149;
          --text: #e6edf3; --muted: #8b949e; --radius: 10px;
        }
        body { background: var(--bg); color: var(--text); font-family: 'DM Sans', sans-serif; min-height: 100vh; }
        .app { display: flex; flex-direction: column; min-height: 100vh; }

        /* ── Keyframes ── */
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(.92) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes slideInRight { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes slideInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes checkPop { 0% { transform: scale(.6); } 50% { transform: scale(1.25); } 100% { transform: scale(1); } }
        @keyframes checkDraw { from { stroke-dashoffset: 24; } to { stroke-dashoffset: 0; } }
        @keyframes pulseRing { 0% { box-shadow: 0 0 0 0 rgba(63,185,80,.5); } 70% { box-shadow: 0 0 0 8px rgba(63,185,80,0); } 100% { box-shadow: 0 0 0 0 rgba(63,185,80,0); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes bounceIn { 0% { transform: scale(.3); opacity: 0; } 50% { transform: scale(1.05); } 70% { transform: scale(.95); } 100% { transform: scale(1); opacity: 1; } }

        /* Animação de arquivamento automático */
        @keyframes archiveFlash {
          0% { box-shadow: 0 0 0 0 rgba(63,185,80,0); }
          50% { box-shadow: 0 0 0 4px rgba(63,185,80,.4), 0 0 30px rgba(63,185,80,.5); }
          100% { box-shadow: 0 0 0 0 rgba(63,185,80,0); }
        }
        @keyframes archiveOut {
          0% { transform: scale(1) translateY(0) rotate(0); opacity: 1; filter: brightness(1); }
          25% { transform: scale(1.04) translateY(-6px) rotate(-1deg); filter: brightness(1.25); }
          60% { transform: scale(.85) translateY(20px) rotate(2deg); opacity: .6; filter: brightness(1); }
          100% { transform: scale(.4) translateY(80px) rotate(4deg); opacity: 0; filter: brightness(.6); }
        }
        @keyframes confettiPop {
          0% { transform: scale(0); opacity: 1; }
          80% { transform: scale(1.2); opacity: .9; }
          100% { transform: scale(.6); opacity: 0; }
        }

        .header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 14px 28px; display: flex; align-items: center; gap: 16px; position: sticky; top: 0; z-index: 10; }
        .logo { font-family: 'Syne', sans-serif; font-size: 1.3rem; font-weight: 800; color: var(--accent); letter-spacing: -0.5px; }
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
        .profile-dropdown-title { font-family: 'Syne', sans-serif; font-size: 0.95rem; font-weight: 700; margin-bottom: 12px; color: var(--text); }
        .profile-field { margin-bottom: 12px; }
        .profile-label { display: block; font-size: 0.68rem; color: var(--muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: .05em; }
        .profile-value { font-size: 0.88rem; color: var(--text); word-break: break-word; }
        .profile-mono { font-family: ui-monospace, 'DM Sans', monospace; font-size: 0.84rem; }
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
        .admin-title { font-family: 'Syne', sans-serif; font-size: 1.35rem; font-weight: 800; margin-bottom: 8px; color: var(--text); }
        .admin-lead { font-size: 0.88rem; color: var(--muted); margin-bottom: 20px; line-height: 1.5; }
        .admin-alert { margin-bottom: 14px; }
        .admin-muted { font-size: 0.85rem; color: var(--muted); }
        .admin-table-wrap { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; overflow: hidden; }
        .admin-table { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
        .admin-table th { text-align: left; padding: 12px 16px; background: var(--surface2); color: var(--muted); font-weight: 600; font-size: 0.72rem; text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid var(--border); }
        .admin-table td { padding: 12px 16px; border-bottom: 1px solid var(--border); vertical-align: middle; }
        .admin-table tr:last-child td { border-bottom: none; }
        .admin-td-user { color: var(--text); font-weight: 500; }
        .admin-you { color: var(--muted); font-weight: 400; }
        .admin-select { max-width: 200px; padding: 8px 10px !important; font-size: 0.82rem !important; cursor: pointer; }
        .admin-select:disabled { opacity: 0.45; cursor: not-allowed; }
        .admin-td-actions { text-align: right; width: 56px; }

        .sidebar-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 50; }
        .sidebar { position: fixed; top: 0; left: 0; height: 100vh; width: 260px; background: var(--surface); border-right: 1px solid var(--border); z-index: 51; display: flex; flex-direction: column; transform: translateX(-100%); transition: transform .25s cubic-bezier(.4,0,.2,1); }
        .sidebar.open { transform: translateX(0); }
        .sidebar-header { padding: 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
        .sidebar-logo { font-family: 'Syne', sans-serif; font-size: 1.2rem; font-weight: 800; color: var(--accent); }
        .sidebar-logo span { color: var(--text); }
        .sidebar-nav { flex: 1; padding: 12px 10px; display: flex; flex-direction: column; gap: 4px; }
        .sidebar-section-label { font-size: 0.68rem; color: var(--muted); text-transform: uppercase; letter-spacing: .6px; padding: 8px 10px 4px; }
        .sidebar-item { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 10px; cursor: pointer; font-size: 0.88rem; color: var(--muted); transition: background .15s, color .15s; border: none; background: none; width: 100%; text-align: left; font-family: 'DM Sans', sans-serif; }
        .sidebar-item:hover { background: var(--surface2); color: var(--text); }
        .sidebar-item.active { background: rgba(240,136,62,.12); color: var(--accent); font-weight: 500; }
        .sidebar-footer { padding: 14px; border-top: 1px solid var(--border); font-size: 0.72rem; color: var(--muted); text-align: center; }

        .tabs { display: flex; background: var(--surface); border-bottom: 1px solid var(--border); padding: 0 28px; }
        .tab-btn { background: none; border: none; color: var(--muted); padding: 12px 16px; font-family: 'DM Sans', sans-serif; font-size: 0.85rem; cursor: pointer; border-bottom: 2px solid transparent; transition: color .15s, border-color .15s; }
        .tab-btn:hover { color: var(--text); }
        .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 500; }

        .btn-primary { display: flex; align-items: center; gap: 6px; background: var(--accent); color: #000; border: none; padding: 8px 16px; border-radius: var(--radius); font-family: 'DM Sans', sans-serif; font-size: 0.85rem; font-weight: 500; cursor: pointer; transition: opacity .15s, transform .2s cubic-bezier(.34,1.56,.64,1), box-shadow .2s; }
        .btn-primary:hover { opacity: .92; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(240,136,62,.35); }
        .btn-primary:active { transform: translateY(0); }
        .btn-outline { display: flex; align-items: center; gap: 6px; background: transparent; color: var(--text); border: 1px solid var(--border); padding: 8px 14px; border-radius: var(--radius); font-family: 'DM Sans', sans-serif; font-size: 0.85rem; cursor: pointer; transition: background .2s, border-color .2s, transform .15s; }
        .btn-outline:hover { background: var(--surface2); border-color: var(--muted); transform: translateY(-1px); }
        .btn-outline:active { transform: translateY(0); }

        /* === Glassmorphism login === */
        .ls-shell {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #0f0c29 0%, #302b63 35%, #6d28d9 65%, #be185d 100%);
          position: relative;
          overflow: hidden;
          padding: 24px;
        }
        .ls-orb {
          position: absolute;
          border-radius: 50%;
          pointer-events: none;
          filter: blur(72px);
        }
        .ls-orb-1 { width: 540px; height: 540px; top: -15%; left: -12%; background: radial-gradient(circle, rgba(139,92,246,0.75) 0%, transparent 70%); }
        .ls-orb-2 { width: 440px; height: 440px; bottom: -12%; right: -8%; background: radial-gradient(circle, rgba(236,72,153,0.7) 0%, transparent 70%); }
        .ls-orb-3 { width: 360px; height: 360px; top: 38%; left: 48%; background: radial-gradient(circle, rgba(59,130,246,0.55) 0%, transparent 70%); }
        .ls-orb-4 { width: 280px; height: 280px; top: 8%; right: 22%; background: radial-gradient(circle, rgba(16,185,129,0.45) 0%, transparent 70%); }

        .ls-card {
          position: relative;
          z-index: 1;
          background: rgba(255,255,255,0.10);
          backdrop-filter: blur(28px);
          -webkit-backdrop-filter: blur(28px);
          border: 1px solid rgba(255,255,255,0.22);
          border-radius: 24px;
          padding: 48px 40px;
          width: 100%;
          max-width: 420px;
          box-shadow: 0 30px 70px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.28);
        }
        @media (max-width: 480px) {
          .ls-card { padding: 36px 24px; }
        }

        .ls-brand { text-align: center; margin-bottom: 32px; }
        .ls-logo {
          font-family: 'Syne', sans-serif;
          font-size: 2.4rem;
          font-weight: 800;
          color: #fff;
          letter-spacing: -1.2px;
          line-height: 1;
        }
        .ls-logo span { color: #fb923c; }
        .ls-tagline {
          margin-top: 8px;
          font-size: 0.85rem;
          color: rgba(255,255,255,0.58);
          font-family: 'DM Sans', sans-serif;
        }

        .ls-title {
          font-family: 'Syne', sans-serif;
          font-size: 1.45rem;
          font-weight: 700;
          color: #fff;
          letter-spacing: -0.3px;
          margin-bottom: 4px;
        }
        .ls-subtitle {
          font-size: 0.84rem;
          color: rgba(255,255,255,0.55);
          margin-bottom: 24px;
          font-family: 'DM Sans', sans-serif;
        }

        .ls-tabs {
          display: flex;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.14);
          border-radius: 12px;
          padding: 4px;
          gap: 4px;
          margin-bottom: 26px;
        }
        .ls-tab {
          flex: 1;
          padding: 9px;
          border: none;
          background: transparent;
          border-radius: 9px;
          font-family: 'DM Sans', sans-serif;
          font-size: 0.875rem;
          font-weight: 500;
          color: rgba(255,255,255,0.55);
          cursor: pointer;
          transition: all .2s;
        }
        .ls-tab-active {
          background: rgba(255,255,255,0.18);
          color: #fff;
          font-weight: 600;
          box-shadow: 0 1px 6px rgba(0,0,0,0.25);
        }

        .ls-form { display: flex; flex-direction: column; gap: 14px; }
        .ls-field-wrap { position: relative; display: flex; align-items: center; }
        .ls-field-icon {
          position: absolute;
          left: 13px;
          color: rgba(255,255,255,0.45);
          display: flex;
          align-items: center;
          pointer-events: none;
        }
        .ls-input {
          width: 100%;
          padding: 12px 14px 12px 42px;
          border: 1.5px solid rgba(255,255,255,0.18);
          border-radius: 10px;
          font-family: 'DM Sans', sans-serif;
          font-size: 0.9rem;
          color: #fff;
          background: rgba(255,255,255,0.09);
          outline: none;
          transition: border-color .2s, box-shadow .2s, background .2s;
          box-sizing: border-box;
        }
        .ls-input:focus { border-color: rgba(255,255,255,0.5); background: rgba(255,255,255,0.14); box-shadow: 0 0 0 3px rgba(255,255,255,0.08); }
        .ls-input::placeholder { color: rgba(255,255,255,0.35); }
        .ls-eye-btn {
          position: absolute;
          right: 10px;
          background: none;
          border: none;
          cursor: pointer;
          color: rgba(255,255,255,0.45);
          display: flex;
          align-items: center;
          padding: 4px;
          border-radius: 6px;
          transition: color .15s;
        }
        .ls-eye-btn:hover { color: rgba(255,255,255,0.9); }

        .ls-success {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(16,185,129,0.18);
          border: 1px solid rgba(16,185,129,0.38);
          color: #6ee7b7;
          padding: 10px 13px;
          border-radius: 9px;
          font-size: 0.84rem;
          font-family: 'DM Sans', sans-serif;
          margin-bottom: 4px;
        }
        .ls-error {
          color: #fca5a5;
          font-size: 0.83rem;
          font-family: 'DM Sans', sans-serif;
          margin: -4px 0 0;
        }
        .ls-submit {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 13px;
          background: linear-gradient(135deg, #7c3aed 0%, #db2777 100%);
          color: #fff;
          border: none;
          border-radius: 10px;
          font-family: 'DM Sans', sans-serif;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: opacity .2s, transform .15s, box-shadow .2s;
          margin-top: 6px;
          box-shadow: 0 4px 22px rgba(124,58,237,0.45);
        }
        .ls-submit:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); box-shadow: 0 8px 28px rgba(124,58,237,0.55); }
        .ls-submit:active:not(:disabled) { transform: translateY(0); }
        .ls-submit:disabled { opacity: 0.45; cursor: not-allowed; }

        .board { flex: 1; overflow-x: auto; padding: 24px 28px; display: flex; gap: 18px; align-items: flex-start; }
        .board::-webkit-scrollbar { height: 4px; }
        .board::-webkit-scrollbar-track { background: transparent; }
        .board::-webkit-scrollbar-thumb { background: #30363d; border-radius: 99px; }
        .board::-webkit-scrollbar-thumb:hover { background: #484f58; }

        @media (max-width: 480px) {
          .board { scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; padding: 10px; gap: 10px; }
          .column { scroll-snap-align: center; scroll-snap-stop: always; }
        }

        .column { min-width: 290px; max-width: 290px; background: var(--surface); border: 2px solid var(--border); border-radius: 14px; display: flex; flex-direction: column; max-height: calc(100vh - 230px); overflow: hidden; transition: border-color .25s, box-shadow .25s, transform .2s; animation: scaleIn .35s cubic-bezier(.4,0,.2,1); position: relative; }
        .column:hover { box-shadow: 0 6px 24px rgba(0,0,0,.35); }
        .column.complete { border-color: var(--green) !important; animation: scaleIn .35s cubic-bezier(.4,0,.2,1), archiveFlash 1.4s ease-in-out infinite; }
        .column.archiving { animation: archiveOut .7s cubic-bezier(.55,.05,.68,.05) forwards !important; pointer-events: none; }

        /* Overlay de "Concluído!" sobre a coluna concluída */
        .complete-overlay { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(circle at 50% 30%, rgba(63,185,80,.18), transparent 60%); animation: fadeIn .4s ease-out; z-index: 1; }
        .complete-overlay::before, .complete-overlay::after { content: '✓'; position: absolute; color: #3fb950; font-size: 1.4rem; font-weight: 800; opacity: 0; }
        .complete-overlay::before { top: 12%; left: 18%; animation: confettiPop 1.4s ease-out infinite; animation-delay: .2s; }
        .complete-overlay::after { top: 8%; right: 16%; animation: confettiPop 1.4s ease-out infinite; animation-delay: .7s; }
        .col-type-stripe { height: 3px; width: 100%; border-radius: 2px; }
        .process-number { font-size: 0.7rem; color: var(--muted); font-weight: 500; letter-spacing: .4px; margin-top: 10px; text-transform: uppercase; }
        .process-setor { font-size: 0.72rem; color: var(--accent2); margin-top: 2px; }
        .column-header { padding: 0 14px 10px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
        .column-title-row { display: flex; align-items: center; gap: 8px; margin: 6px 0 8px; }
        .column-title { font-family: 'DM Sans', sans-serif; font-size: 1.05rem; font-weight: 600; flex: 1; cursor: text; line-height: 1.3; letter-spacing: -0.2px; }
        .title-input { flex: 1; background: var(--surface2); border: 1px solid var(--accent2); border-radius: 6px; padding: 4px 8px; color: var(--text); font-family: 'Syne', sans-serif; font-size: 0.88rem; font-weight: 700; outline: none; }
        .progress-row { display: flex; align-items: center; gap: 8px; }
        .progress-bar { flex: 1; height: 5px; background: var(--border); border-radius: 99px; overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 99px; transition: width .3s; }
        .progress-label { font-size: 0.72rem; color: var(--muted); white-space: nowrap; }
        .complete-badge { margin-top: 6px; font-size: 0.72rem; color: var(--green); font-weight: 700; animation: slideInUp .35s cubic-bezier(.34,1.56,.64,1); }

        .docs-list { padding: 8px; display: flex; flex-direction: column; gap: 5px; overflow-y: auto; overflow-x: hidden; flex: 1; min-height: 0; }
        .docs-list::-webkit-scrollbar { width: 4px; }
        .docs-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 99px; }

        /* Phase */
        .phase-group { border-radius: 10px; overflow: hidden; border: 1px solid rgba(255,255,255,.08); flex-shrink: 0; animation: slideInUp .3s cubic-bezier(.4,0,.2,1); }
        .phase-header { display: flex; align-items: center; gap: 7px; padding: 8px 10px; cursor: default; transition: filter .2s; }
        .phase-header:hover { filter: brightness(1.15); }
        .phase-name { flex: 1; font-size: 0.83rem; font-weight: 700; color: #fff; cursor: text; }
        .phase-input { flex: 1; background: transparent; border: none; border-bottom: 1px solid rgba(255,255,255,.4); color: #fff; font-size: 0.83rem; font-weight: 700; outline: none; font-family: 'DM Sans', sans-serif; padding: 1px 0; }
        .phase-count { font-size: 0.7rem; color: rgba(255,255,255,.6); white-space: nowrap; }
        .phase-done-badge { font-size: 0.7rem; background: rgba(63,185,80,.3); color: #3fb950; border-radius: 99px; padding: 1px 6px; font-weight: 700; }
        .phase-actions { display: flex; gap: 2px; }
        .phase-docs { padding: 5px; display: flex; flex-direction: column; gap: 4px; background: rgba(0,0,0,.08); }
        .phase-empty { font-size: 0.75rem; color: var(--muted); text-align: center; padding: 8px; }

        /* Doc Card */
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
        .card-input { flex: 1; background: transparent; border: none; border-bottom: 1px solid var(--accent2); color: var(--text); font-family: 'DM Sans', sans-serif; font-size: 0.79rem; outline: none; padding: 2px 0; }
        .card-actions { display: flex; gap: 2px; opacity: 0; transition: opacity .2s ease; }
        .color-picker { position: absolute; right: 0; top: 22px; z-index: 20; background: #1c2330; border: 1px solid #30363d; border-radius: 10px; padding: 8px; display: flex; flex-wrap: wrap; width: 112px; gap: 6px; box-shadow: 0 4px 16px rgba(0,0,0,.5); animation: scaleIn .18s ease-out; transform-origin: top right; }
        .color-swatch { width: 18px; height: 18px; border-radius: 50%; border: 2px solid #30363d; cursor: pointer; transition: transform .2s cubic-bezier(.34,1.56,.64,1); }
        .color-swatch:hover { transform: scale(1.25); }
        .color-swatch.active { border-color: #58a6ff; }

        /* Add bar */
        .add-bar { display: flex; border-top: 1px solid var(--border); position: sticky; bottom: 0; background: var(--surface); z-index: 2; flex-shrink: 0; }
        .add-doc-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px; background: none; border: none; border-right: 1px solid var(--border); color: var(--muted); padding: 9px 10px; font-size: 0.78rem; cursor: pointer; transition: color .2s, background .2s, gap .2s; font-family: 'DM Sans', sans-serif; }
        .add-doc-btn:hover { color: var(--accent); background: rgba(240,136,62,.06); gap: 7px; }
        .add-phase-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px; background: none; border: none; color: var(--muted); padding: 9px 10px; font-size: 0.78rem; cursor: pointer; transition: color .2s, background .2s, gap .2s; font-family: 'DM Sans', sans-serif; }
        .add-phase-btn:hover { color: var(--accent2); background: rgba(88,166,255,.06); gap: 7px; }
        .add-doc-form { padding: 8px 10px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 6px; }
        .doc-input { background: var(--surface2); border: 1px solid var(--accent2); border-radius: 8px; padding: 8px 10px; color: var(--text); font-family: 'DM Sans', sans-serif; font-size: 0.82rem; outline: none; width: 100%; }
        .form-btns { display: flex; gap: 6px; align-items: center; }
        .btn-confirm { background: var(--accent); color: #000; border: none; padding: 6px 14px; border-radius: 6px; font-size: 0.8rem; font-family: 'DM Sans', sans-serif; font-weight: 500; cursor: pointer; }
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
        .empty-board h2 { font-family: 'Syne', sans-serif; color: var(--text); font-size: 1.2rem; }
        .empty-board p { font-size: 0.88rem; max-width: 340px; line-height: 1.6; }

        .archive-grid { padding: 24px 28px; display: flex; flex-wrap: wrap; gap: 16px; align-content: flex-start; }
        @keyframes archiveIn {
          from { transform: translateY(8px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .archived-card { width: 280px; background: var(--surface); border: 2px solid var(--border); border-radius: 14px; overflow: hidden; animation: archiveIn .25s ease-out; transition: transform .2s, box-shadow .2s, border-color .2s; }
        .archived-card:hover { border-color: var(--muted); box-shadow: 0 2px 8px rgba(0,0,0,.2); }

        .dashboard { padding: 28px; max-width: 860px; width: 100%; margin: 0 auto; display: flex; flex-direction: column; gap: 24px; }
        .dash-stats { display: flex; gap: 14px; flex-wrap: wrap; }
        .dash-stat { flex: 1; min-width: 130px; background: var(--surface); border: 1px solid var(--border); border-left: 4px solid; border-radius: 12px; padding: 16px 18px; }
        .dash-stat-value { font-family: 'Syne', sans-serif; font-size: 2rem; font-weight: 800; line-height: 1; margin-bottom: 4px; }
        .dash-stat-label { font-size: 0.78rem; color: var(--muted); }
        .dash-section { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 20px; }
        .dash-title { font-family: 'Syne', sans-serif; font-size: 0.9rem; font-weight: 700; margin-bottom: 14px; }
        .dash-progress-row { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
        .dash-progress-bar { flex: 1; height: 10px; background: var(--border); border-radius: 99px; overflow: hidden; }
        .dash-progress-fill { height: 100%; background: var(--accent); border-radius: 99px; transition: width .4s; }
        .dash-pct { font-family: 'Syne', sans-serif; font-size: 1rem; font-weight: 700; color: var(--accent); min-width: 42px; text-align: right; }
        .dash-sub { font-size: 0.78rem; color: var(--muted); }
        .dash-by-type { display: flex; flex-direction: column; gap: 10px; }
        .dash-type-row { display: flex; align-items: center; gap: 10px; }
        .dash-type-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
        .dash-type-name { font-size: 0.82rem; min-width: 190px; }
        .dash-type-bar { flex: 1; height: 6px; background: var(--border); border-radius: 99px; overflow: hidden; }
        .dash-type-count { font-size: 0.78rem; color: var(--muted); min-width: 20px; text-align: right; }
        .dash-process-list { display: flex; flex-direction: column; gap: 12px; }
        .dash-process-item { display: flex; align-items: flex-start; gap: 10px; }
        .dash-process-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
        .dash-process-name { font-size: 0.82rem; }

        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.7); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px; animation: fadeIn .2s ease-out; backdrop-filter: blur(4px); }
        .modal { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; width: 100%; max-width: 720px; display: flex; flex-direction: column; height: 80vh; max-height: 80vh; min-height: 80vh; overflow: hidden; flex-shrink: 0; animation: scaleIn .25s cubic-bezier(.34,1.56,.64,1); box-shadow: 0 20px 60px rgba(0,0,0,.5); }
        .sm-modal { max-width: 420px; height: auto !important; min-height: auto !important; max-height: 90vh !important; }
        .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid var(--border); }
        .modal-header h2 { font-family: 'Syne', sans-serif; font-size: 1rem; font-weight: 700; }
        .modal-body { display: flex; flex: 1; overflow: hidden; min-height: 0; }
        .modal-body.col { flex-direction: column; padding: 20px; gap: 8px; overflow-y: auto; }
        .modal-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 20px; border-top: 1px solid var(--border); flex-shrink: 0; }
        .tpl-sidebar { width: 200px; min-width: 200px; max-width: 200px; border-right: 1px solid var(--border); padding: 14px; display: flex; flex-direction: column; gap: 4px; overflow-y: auto; overflow-x: hidden; flex-shrink: 0; align-self: stretch; }
        .tpl-content { flex: 1; flex-grow: 1; padding: 16px; overflow: hidden; display: flex; flex-direction: column; gap: 10px; min-width: 0; min-height: 0; }
        .sidebar-label { font-size: 0.7rem; color: var(--muted); text-transform: uppercase; letter-spacing: .6px; margin-bottom: 6px; flex-shrink: 0; }
        .tpl-item { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 7px 10px; border-radius: 8px; cursor: pointer; font-size: 0.82rem; transition: background .15s; min-width: 0; }
        .tpl-item span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
        .tpl-item:hover { background: var(--surface2); }
        .tpl-item.active { background: var(--surface2); color: var(--accent); font-weight: 500; }
        .tpl-docs { display: flex; flex-direction: column; gap: 3px; flex: 1; flex-grow: 1; overflow-y: auto; overflow-x: hidden; min-height: 0; padding-right: 2px; }
        .tpl-scroll-list::-webkit-scrollbar { width: 3px; }
        .tpl-scroll-list::-webkit-scrollbar-track { background: transparent; }
        .tpl-scroll-list::-webkit-scrollbar-thumb { background: #30363d; border-radius: 99px; }
        .tpl-scroll-list::-webkit-scrollbar-thumb:hover { background: #484f58; }
        .tpl-doc-item { display: flex; align-items: center; gap: 8px; padding: 8px 10px; background: var(--surface2); border-radius: 8px; font-size: 0.82rem; min-width: 0; overflow: hidden; transition: background .15s; }
        .tpl-doc-item:hover { background: #21293a; }
        .tpl-doc-item span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
        .tpl-phase-item { margin: 4px 0 2px; }
        .tpl-phase-item:hover { filter: brightness(1.1); }
        .tpl-doc-item.draggable { cursor: grab; border: 1px solid transparent; }
        .tpl-doc-item.dragging { opacity: .35; cursor: grabbing; }
        .tpl-doc-item.drag-over { border: 1px dashed var(--accent2); background: #1a2540; }
        .drag-handle { color: #3a4556; font-size: 1rem; cursor: grab; user-select: none; flex-shrink: 0; transition: color .15s; }
        .tpl-doc-item:hover .drag-handle { color: var(--muted); }
        .new-tpl-row { display: flex; gap: 6px; margin-top: 8px; }
        .tpl-add-bar { display: flex; flex-direction: column; gap: 8px; padding-top: 10px; border-top: 1px solid var(--border); flex-shrink: 0; }
        .tpl-type-row { display: flex; gap: 6px; }
        .tpl-input-row { display: flex; gap: 6px; }
        .tpl-input { flex: 1; min-width: 0; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; color: var(--text); font-family: 'DM Sans', sans-serif; font-size: 0.82rem; outline: none; transition: border-color .15s; }
        .tpl-input:focus { border-color: var(--accent2); }
        .btn-add-tpl { background: var(--accent); border: none; color: #000; border-radius: 8px; padding: 8px 12px; cursor: pointer; display: flex; align-items: center; flex-shrink: 0; font-weight: 700; font-size: 1rem; transition: opacity .15s; }
        .btn-add-tpl:hover { opacity: .85; }
        .type-toggle { display: flex; align-items: center; gap: 5px; background: transparent; border: 1px solid var(--border); border-radius: 8px; padding: 6px 14px; color: var(--muted); font-size: 0.8rem; font-family: 'DM Sans', sans-serif; cursor: pointer; transition: all .15s; }
        .type-toggle:hover { border-color: var(--muted); color: var(--text); }
        .type-toggle.active { border-color: var(--accent); color: var(--accent); background: rgba(240,136,62,.08); }
        .field-label { font-size: 0.82rem; color: var(--muted); font-weight: 500; }
        .field-label.mt { margin-top: 8px; }
        .optional { font-weight: 400; color: var(--muted); }
        .hint { font-size: 0.78rem; color: var(--muted); margin-top: 2px; }
        .select-field { background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; color: var(--text); font-family: 'DM Sans', sans-serif; font-size: 0.85rem; outline: none; width: 100%; }
        .select-field:focus { border-color: var(--accent2); }
        .btn-save { background: var(--accent); color: #000; border: none; padding: 8px 20px; border-radius: 8px; font-family: 'DM Sans', sans-serif; font-size: 0.85rem; font-weight: 500; cursor: pointer; transition: opacity .15s; }
        .btn-save:hover:not(:disabled) { opacity: .85; }
        .btn-save:disabled { opacity: .4; cursor: default; }
        .btn-cancel-lg { background: transparent; border: 1px solid var(--border); color: var(--text); padding: 8px 18px; border-radius: 8px; font-family: 'DM Sans', sans-serif; font-size: 0.85rem; cursor: pointer; transition: background .15s; }
        .btn-cancel-lg:hover { background: var(--surface2); }

        /* ── Contratos Ativos ── */
        .contratos-page { padding: 24px 28px; max-width: 1100px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
        .contratos-config { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 18px 20px; }

        /* Abas de fonte (Link / Upload) */
        .fonte-tabs { display: flex; gap: 8px; background: var(--surface2); padding: 4px; border-radius: 12px; margin-bottom: 14px; }
        .fonte-tab { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; background: transparent; border: none; color: var(--muted); padding: 10px 14px; border-radius: 9px; cursor: pointer; font-family: 'DM Sans', sans-serif; font-size: 0.85rem; font-weight: 500; transition: background .2s, color .2s, transform .15s; }
        .fonte-tab:hover { color: var(--text); }
        .fonte-tab.active { background: var(--surface); color: var(--accent); box-shadow: 0 2px 8px rgba(0,0,0,.25); }
        .fonte-tab.active:hover { transform: translateY(-1px); }
        .fonte-badge { font-size: 0.65rem; font-weight: 600; padding: 2px 8px; border-radius: 99px; background: rgba(255,255,255,.08); color: var(--muted); text-transform: uppercase; letter-spacing: .4px; }
        .fonte-tab.active .fonte-badge { background: rgba(240,136,62,.15); color: var(--accent); }

        .fonte-panel { display: flex; flex-direction: column; gap: 4px; animation: slideInUp .25s ease-out; }
        .fonte-panel .csv-input, .fonte-panel input[type="file"] { margin-top: 4px; }

        /* Caixa de instruções (Como publicar) */
        .fonte-help { margin-top: 14px; background: var(--surface2); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; font-size: 0.82rem; color: var(--muted); line-height: 1.7; display: flex; flex-direction: column; gap: 4px; }

        .contratos-config-label { font-size: 0.75rem; color: var(--muted); font-weight: 500; }
        .csv-input { flex: 1; min-width: 200px; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; color: var(--text); font-family: 'DM Sans', sans-serif; font-size: 0.82rem; outline: none; transition: border-color .15s; }
        .csv-input:focus { border-color: var(--accent2); }
        .contratos-resumo { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        .resumo-card { background: var(--surface); border: 1px solid var(--border); border-left: 4px solid; border-radius: 12px; padding: 14px 16px; transition: background .15s; }
        .resumo-card:hover { background: var(--surface2); }
        .resumo-val { font-family: 'Syne', sans-serif; font-size: 1.8rem; font-weight: 800; line-height: 1; margin-bottom: 4px; }
        .resumo-label { font-size: 0.75rem; color: var(--muted); }
        .contratos-filters { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
        .contratos-search { flex: 1; min-width: 200px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 9px 14px; color: var(--text); font-family: 'DM Sans', sans-serif; font-size: 0.85rem; outline: none; transition: border-color .15s; }
        .contratos-search:focus { border-color: var(--accent2); }
        .filter-btns { display: flex; gap: 6px; flex-wrap: wrap; }
        .filter-btn { background: transparent; border: 1px solid var(--border); color: var(--muted); padding: 6px 14px; border-radius: 99px; font-family: 'DM Sans', sans-serif; font-size: 0.78rem; cursor: pointer; transition: all .15s; }
        .filter-btn:hover { border-color: var(--muted); color: var(--text); }
        .filter-btn.active { border-color: var(--accent); color: var(--accent); background: rgba(240,136,62,.1); }
        .contratos-loading { text-align: center; color: var(--muted); padding: 40px; font-size: 0.88rem; }
        .contratos-empty { text-align: center; color: var(--muted); padding: 30px; font-size: 0.85rem; }
        .contratos-empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; flex: 1; gap: 10px; color: var(--muted); text-align: center; padding: 60px 20px; }
        .contratos-empty-state h3 { font-family: 'Syne', sans-serif; color: var(--text); font-size: 1.1rem; }
        .contratos-empty-state p { font-size: 0.85rem; max-width: 360px; line-height: 1.6; }

        /* ── Grid de cards ── */
        .cc2-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }

        /* ── ContratoCard v2 ── */
        .cc2-card { display: flex; background: var(--surface); border: 1px solid var(--border); border-radius: 13px; overflow: hidden; transition: border-color .2s, box-shadow .2s, transform .15s; }
        .cc2-card:hover { border-color: var(--sc, var(--border)); box-shadow: 0 4px 24px rgba(0,0,0,.3); transform: translateY(-2px); }
        .cc2-stripe { width: 5px; flex-shrink: 0; }
        .cc2-body { flex: 1; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }

        /* Linha 1 — badges */
        .cc2-top { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; }
        .cc2-num { font-family: 'Syne', sans-serif; font-size: 0.72rem; font-weight: 700; color: var(--muted); letter-spacing: .3px; flex-shrink: 0; }
        .cc2-estado { font-size: 0.62rem; padding: 2px 8px; border-radius: 99px; font-weight: 700; border: 1px solid; white-space: nowrap; }
        .cc2-lei { font-size: 0.6rem; padding: 2px 8px; border-radius: 99px; font-weight: 600; border: 1px solid; white-space: nowrap; }
        .cc2-venc-badge { font-size: 0.6rem; padding: 2px 8px; border-radius: 99px; font-weight: 600; border: 1px solid; white-space: nowrap; margin-left: auto; }

        /* Linha 2 — objeto */
        .cc2-objeto { font-size: 0.85rem; font-weight: 600; color: var(--text); line-height: 1.45; }

        /* Linha 3 — fiscais */
        .cc2-fiscais { display: flex; flex-direction: column; gap: 4px; }
        .cc2-fiscal-item { display: flex; align-items: baseline; gap: 5px; }
        .cc2-fiscal-label { font-size: 0.6rem; text-transform: uppercase; letter-spacing: .5px; color: var(--muted); white-space: nowrap; flex-shrink: 0; }
        .cc2-fiscal-val { font-size: 0.75rem; color: var(--text); line-height: 1.3; }
        .cc2-subst { color: var(--muted); }

        /* Linha 4 — valor + vencimento */
        .cc2-bottom { display: flex; align-items: flex-end; justify-content: space-between; padding-top: 8px; border-top: 1px solid var(--border); gap: 10px; }
        .cc2-valor-wrap { display: flex; flex-direction: column; gap: 1px; }
        .cc2-venc-wrap { display: flex; flex-direction: column; gap: 1px; align-items: flex-end; }
        .cc2-bottom-label { font-size: 0.58rem; text-transform: uppercase; letter-spacing: .5px; color: var(--muted); }
        .cc2-valor { font-family: 'Syne', sans-serif; font-size: 1rem; font-weight: 800; color: var(--accent); }
        .cc2-venc-val { font-family: 'Syne', sans-serif; font-size: 0.9rem; font-weight: 700; }

        @media (max-width: 768px) {
          .contratos-page { padding: 16px; }
          .contratos-resumo { grid-template-columns: repeat(2, 1fr); }
          .cc2-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 480px) {
          .contratos-page { padding: 10px; }
          .contratos-resumo { grid-template-columns: repeat(2, 1fr); gap: 8px; }
          .resumo-val { font-size: 1.4rem; }
        }

        /* ── Modal de Detalhe do Contrato ── */
        .cdm-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.75); display: flex; align-items: center; justify-content: center; z-index: 200; padding: 20px; backdrop-filter: blur(4px); }
        .cdm-box { background: var(--surface); border: 1px solid var(--border); border-radius: 18px; width: 100%; max-width: 560px; max-height: 88vh; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 24px 80px rgba(0,0,0,.6); animation: cdm-in .18s cubic-bezier(.4,0,.2,1); }
        @keyframes cdm-in { from { opacity:0; transform: translateY(16px) scale(.97); } to { opacity:1; transform: none; } }

        .cdm-hero { padding: 22px 24px 18px; position: relative; flex-shrink: 0; }
        .cdm-hero-badges { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
        .cdm-hero-num { font-family: 'Syne', sans-serif; font-size: 0.78rem; font-weight: 700; color: var(--muted); letter-spacing: .5px; margin-bottom: 6px; }
        .cdm-hero-objeto { font-family: 'Syne', sans-serif; font-size: 1.1rem; font-weight: 700; color: var(--text); line-height: 1.4; padding-right: 32px; }
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

        @media (max-width: 480px) {
          .cdm-overlay { padding: 0; align-items: flex-end; }
          .cdm-box { border-radius: 18px 18px 0 0; max-height: 92vh; }
          .cdm-grid { grid-template-columns: 1fr; }
        }


        @media (hover: none) {
          .card-actions { opacity: 1; }
        }

        /* ── Tablet (≤768px) ── */
        @media (max-width: 768px) {
          .header { padding: 12px 16px; gap: 10px; }
          .header-section-name { display: none; }
          .header-stats { display: none; }
          .tabs { padding: 0 16px; overflow-x: auto; }
          .tabs::-webkit-scrollbar { display: none; }
          .tab-btn { padding: 12px 12px; font-size: 0.8rem; white-space: nowrap; }
          .board { padding: 16px; gap: 14px; }
          .column { min-width: 270px; max-width: 270px; max-height: calc(100vh - 200px); }
          .archive-grid { padding: 16px; gap: 12px; }
          .archived-card { width: 100%; max-width: 320px; }
          .dashboard { padding: 16px; gap: 16px; }
          .dash-section { padding: 16px; }
          .dash-stat-value { font-size: 1.6rem; }
          .modal { height: 90vh; max-height: 90vh; min-height: 90vh; }
          .sm-modal { max-height: 95vh !important; }
        }

        /* ── Mobile (≤480px) ── */
        @media (max-width: 480px) {
          .header { padding: 10px 12px; gap: 8px; }
          .logo { font-size: 1.1rem; }
          .header-actions { gap: 6px; }
          .btn-label { display: none; }
          .btn-outline { padding: 7px 10px; }
          .btn-primary { padding: 7px 10px; }
          .tabs { padding: 0 12px; }
          .tab-btn { padding: 11px 10px; font-size: 0.78rem; }
          .board { padding: 10px; gap: 10px; }
          .column { min-width: calc(100vw - 20px); max-width: calc(100vw - 20px); max-height: none; }
          .archive-grid { padding: 10px; }
          .archived-card { width: 100%; max-width: 100%; }
          .dashboard { padding: 10px; gap: 10px; }
          .dash-section { padding: 14px 12px; border-radius: 12px; }
          .dash-stat { padding: 12px 14px; border-radius: 10px; min-width: 0; }
          .dash-stat-value { font-size: 1.4rem; }
          .dash-title { font-size: 0.85rem; }
          .card-actions { opacity: 1; }
          .add-doc-btn, .add-phase-btn { padding: 13px 10px; font-size: 0.82rem; }
          .check-box { width: 20px; height: 20px; }
          .card-name { font-size: 0.82rem; }
          .docs-list { max-height: 60vh; }
          .modal-overlay { padding: 0; align-items: flex-end; }
          .modal { border-radius: 16px 16px 0 0; height: 92vh; max-height: 92vh; min-height: 50vh; }
          .sm-modal { border-radius: 16px 16px 0 0; max-height: 92vh !important; height: auto !important; min-height: auto !important; }
          .modal-body { flex-direction: column; }
          .tpl-sidebar { width: 100%; min-width: unset; max-width: unset; border-right: none; border-bottom: 1px solid var(--border); flex-direction: row; overflow-x: auto; padding: 8px 10px; gap: 6px; max-height: 56px; align-self: auto; }
          .tpl-sidebar::-webkit-scrollbar { display: none; }
          .tpl-sidebar > p { display: none; }
        }
      `}</style>
      
      {!token ? (
        <Login onLogin={setToken} />
      ) : (
        <>
          {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
          <div className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">Licit<span>Track</span></div>
          <button className="icon-btn" onClick={() => setSidebarOpen(false)}><IconClose /></button>
        </div>
        <nav className="sidebar-nav">
          <p className="sidebar-section-label">Menu</p>
          {SECTIONS.map(s => {
            const Icon = s.icon;
            return (
              <button key={s.id} className={`sidebar-item ${activeSection === s.id ? "active" : ""}`}
                onClick={() => { setActiveSection(s.id); setSidebarOpen(false); }}>
                <Icon />{s.label}
              </button>
            );
          })}
        </nav>
        <div style={{ marginTop: 'auto', padding: '14px', borderTop: '1px solid var(--border)' }}>
          <button className="sidebar-item" style={{ color: 'var(--red)', justifyContent: 'center' }} onClick={handleLogout}>Sair</button>
        </div>
        <div className="sidebar-footer">LicitTrack v1.0</div>
      </div>

      <div className="app">
        <header className="header">
          <button className="hamburger" onClick={() => setSidebarOpen(true)}>
            <span /><span /><span />
          </button>
          <div className="logo">Licit<span>Track</span></div>
          <span className="header-section-name">{SECTIONS.find(s => s.id === activeSection)?.label}</span>
          {activeSection === "processos" && totalDocs > 0 && <span className="header-stats">{totalDone}/{totalDocs} docs</span>}
          <div className="header-actions">
            {activeSection === "processos" && <>
              <button className="btn-outline" onClick={() => setShowTemplates(true)}><IconTemplate /><span className="btn-label"> Modelos</span></button>
              <button className="btn-primary" onClick={() => setShowNewProcess(true)}><IconPlus /><span className="btn-label"> Novo Processo</span></button>
            </>}
            <ProfileMenu token={token} onLogout={handleLogout} />
          </div>
        </header>

        {activeSection === "contratos" ? (
          <ContratosAtivos />
        ) : activeSection === "admin" ? (
          <AdminPanel
            token={token}
            currentUserId={sessionUser?.id}
            onUnauthorized={handleLogout}
            onSelfDemoted={handleSelfDemotedFromAdmin}
          />
        ) : (
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
                      onUpdateDocs={updateDocs}
                      onDeleteColumn={deleteColumn} onRenameColumn={renameColumn} onArchive={archiveColumn} />
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
          </>
        )}
      </div>

      {showTemplates && <TemplateManager templates={templates} onSave={saveTemplates} onClose={() => setShowTemplates(false)} />}
      {showNewProcess && <NewProcessModal templates={templates} onAdd={addColumn} onClose={() => setShowNewProcess(false)} />}
        </>
      )}
    </>
  );
}
