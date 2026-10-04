import { useEffect, useMemo, useRef, useState } from "react";
import mammoth from "mammoth";
import { IconClose, IconCopy, IconPlus, IconTrash, IconUpload } from "../icons";
import { normalizeTemplatesFromApi, orderedTemplateTypeNames } from "../utils";
import { RowMenu } from "./ContratosPage";
import "./ModelsManager.css";

// Paleta única (modelos e fases): 12 tons distintos, no mesmo padrão de cores do app.
const PALETTE = [
  { value: "#2563eb", name: "Azul" },
  { value: "#4f46e5", name: "Índigo" },
  { value: "#7c3aed", name: "Roxo" },
  { value: "#db2777", name: "Rosa" },
  { value: "#dc2626", name: "Vermelho" },
  { value: "#ea580c", name: "Laranja" },
  { value: "#d97706", name: "Âmbar" },
  { value: "#ca8a04", name: "Mostarda" },
  { value: "#16a34a", name: "Verde" },
  { value: "#0d9488", name: "Verde-água" },
  { value: "#0891b2", name: "Ciano" },
  { value: "#64748b", name: "Cinza" },
];
const PALETTE_VALUES = PALETTE.map((c) => c.value);
const DEFAULT_MODEL_COLOR = PALETTE[0].value;
const clone = (value) => JSON.parse(JSON.stringify(value));

// A lista de itens do modelo é plana (fase, doc, doc, fase, doc...). Na tela ela vira grupos:
// cada fase com os documentos que vêm depois dela. Documentos antes da 1ª fase ficam num grupo sem fase.
function toGroups(items) {
  const groups = [];
  items.forEach((item) => {
    if (item.type === "phase") groups.push({ phase: { name: item.name, bgColor: item.bgColor || PALETTE_VALUES[0] }, docs: [] });
    else {
      if (!groups.length) groups.push({ phase: null, docs: [] });
      groups[groups.length - 1].docs.push({ name: item.name, required: item.required !== false, bgColor: item.bgColor || null });
    }
  });
  return groups;
}

function toItems(groups) {
  return groups.flatMap((group) => [
    ...(group.phase ? [{ type: "phase", name: group.phase.name, bgColor: group.phase.bgColor }] : []),
    ...group.docs.map((doc) => ({ type: "doc", name: doc.name, bgColor: doc.bgColor || null, required: doc.required })),
  ]);
}

function reorderKeys(templates, keys) {
  const next = {};
  keys.forEach((key, i) => { next[key] = { ...templates[key], order: i }; });
  return next;
}

async function parseDocxToItems(file) {
  const arrayBuffer = await file.arrayBuffer();
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
  const doc = new DOMParser().parseFromString(html, "text/html");
  const items = [];
  let phaseColorIdx = 0;
  for (const el of Array.from(doc.body.children)) {
    const text = el.textContent.trim();
    if (!text) continue;
    if (el.tagName === "H2") { items.push({ type: "phase", name: text, bgColor: PALETTE_VALUES[phaseColorIdx % PALETTE_VALUES.length] }); phaseColorIdx++; }
    else if (el.tagName === "P") items.push({ type: "doc", name: text, bgColor: null, required: true });
  }
  return items;
}

// Texto editável no próprio lugar: clique para editar, Enter/sair confirma, Esc cancela.
function InlineText({ value, onChange, className, placeholder, label }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);
  const commit = () => { setEditing(false); const clean = draft.trim(); if (clean !== value) onChange(clean); };
  if (editing) {
    return (
      <input className={`mm-inline-input ${className || ""}`} value={draft} autoFocus aria-label={label} placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)} onBlur={commit}
        onKeyDown={(event) => { if (event.key === "Enter") commit(); if (event.key === "Escape") { setDraft(value); setEditing(false); } }} />
    );
  }
  return (
    <button type="button" className={`mm-inline-text ${className || ""} ${value ? "" : "empty"}`} onClick={() => setEditing(true)} title="Clique para editar" aria-label={`${label}: ${value || placeholder}. Clique para editar`}>
      {value || placeholder}
    </button>
  );
}

function ColorDot({ color, onChange, label, size = "md", allowNone = false, align = "left", variant = "dot", pastel = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!ref.current?.contains(event.target)) setOpen(false); };
    const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const current = (color || "").toLowerCase();
  // Cores antigas (fora da paleta) continuam visíveis como "Cor atual" para não serem perdidas sem querer.
  const legacy = current && !PALETTE_VALUES.includes(current);
  return (
    <span className="mm-color" ref={ref}>
      {variant === "button" ? (
        // Mesmo formato dos botões de ação (lixeira), com a cor atual dentro.
        <button type="button" className={`mm-icon-btn mm-color-btn ${open ? "open" : ""} ${pastel ? "pastel" : ""}`} onClick={() => setOpen((o) => !o)} aria-label={label} title={label} aria-expanded={open}>
          <i className={color ? "" : "none"} style={color ? { background: color } : undefined} aria-hidden="true" />
        </button>
      ) : (
        <button type="button" className={`mm-color-dot ${size} ${color ? "" : "none"}`} style={color ? { background: color } : undefined} onClick={() => setOpen((o) => !o)} aria-label={label} title={label} aria-expanded={open} />
      )}
      {open && (
        <span className={`mm-color-menu ${align === "right" ? "align-right" : ""} ${pastel ? "pastel" : ""}`} role="listbox" aria-label={label}>
          <span className="mm-color-title">{label}</span>
          {allowNone && (
            <button type="button" role="option" aria-selected={!current} className={`mm-color-none ${!current ? "active" : ""}`} onClick={() => { onChange(null); setOpen(false); }}>
              <i aria-hidden="true" /> Sem cor (padrão)
            </button>
          )}
          <span className="mm-color-grid">
            {PALETTE.map((c) => (
              <button type="button" key={c.value} role="option" aria-selected={c.value === current} className={c.value === current ? "active" : ""}
                style={{ "--swatch": c.value }} title={c.name} aria-label={c.name} onClick={() => { onChange(c.value); setOpen(false); }}>
                {c.value === current && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>}
              </button>
            ))}
          </span>
          {legacy && (
            <span className="mm-color-legacy">
              <i style={{ background: color }} /> Cor atual (fora da paleta)
            </span>
          )}
        </span>
      )}
    </span>
  );
}

function ConfirmModal({ title, text, confirmLabel, onConfirm, onCancel }) {
  return (
    <div className="contract-modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}
      onKeyDown={(event) => { if (event.key === "Escape") onCancel(); }}>
      <div className="contract-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="mm-confirm-title">
        <div className="contract-delete-icon"><IconTrash /></div>
        <h2 id="mm-confirm-title">{title}</h2>
        <p>{text}</p>
        <div className="contract-delete-actions">
          <button type="button" className="btn-cancel-lg" onClick={onCancel} autoFocus>Cancelar</button>
          <button type="button" className="btn-danger" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}


export default function ModelsManager({ templates, onSave, onBack, confirmBeforeDelete }) {
  const initial = useMemo(() => normalizeTemplatesFromApi(clone(templates)), [templates]);
  const [local, setLocal] = useState(initial);
  const [selected, setSelected] = useState(() => orderedTemplateTypeNames(initial)[0] || "");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState({});
  const [adding, setAdding] = useState(null); // índice do grupo recebendo um novo documento
  const [newDoc, setNewDoc] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const drag = useRef(null);
  const [dropTarget, setDropTarget] = useState(null);
  const docxRef = useRef(null);

  const dirty = JSON.stringify(local) !== JSON.stringify(initial);
  const keys = orderedTemplateTypeNames(local);
  const visibleKeys = keys.filter((key) => {
    const q = search.trim().toLocaleLowerCase("pt-BR");
    return !q || key.toLocaleLowerCase("pt-BR").includes(q) || (local[key].description || "").toLocaleLowerCase("pt-BR").includes(q);
  });
  const entry = selected ? local[selected] : null;
  const groups = entry ? toGroups(entry.items) : [];

  // Quando os modelos mudam por fora (ex.: outro admin salvou) e não há alteração local, acompanha.
  useEffect(() => { if (!dirty) setLocal(initial); }, [initial]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (selected && !local[selected]) setSelected(keys[0] || ""); }, [local, selected, keys]);

  const updateEntry = (patch) => setLocal((p) => ({ ...p, [selected]: { ...p[selected], ...patch } }));
  const updateGroups = (fn) => updateEntry({ items: toItems(fn(clone(groups))) });
  const ask = (data) => (confirmBeforeDelete ? setConfirm(data) : data.onConfirm());

  // ── Modelos ──
  const uniqueName = (base) => { let name = base, n = 2; while (local[name]) name = `${base} (${n++})`; return name; };
  const addModel = () => {
    const name = uniqueName("Novo modelo");
    setLocal((p) => reorderKeys({ ...p, [name]: { items: [], color: DEFAULT_MODEL_COLOR, order: 999, description: "" } }, [...keys, name]));
    setSelected(name);
  };
  const duplicateModel = (key) => {
    const name = uniqueName(`${key} (cópia)`);
    const list = [...keys];
    list.splice(list.indexOf(key) + 1, 0, name);
    setLocal((p) => reorderKeys({ ...p, [name]: clone(p[key]) }, list));
    setSelected(name);
  };
  const deleteModel = (key) => ask({
    title: "Excluir este modelo?",
    text: <>O modelo <strong>{key}</strong> e a estrutura dele serão removidos ao salvar. Processos já criados não são apagados.</>,
    confirmLabel: "Excluir modelo",
    onConfirm: () => {
      setLocal((p) => { const next = { ...p }; delete next[key]; return reorderKeys(next, keys.filter((k) => k !== key)); });
      setConfirm(null);
    },
  });
  const moveModel = (key, delta) => {
    const list = [...keys];
    const from = list.indexOf(key), to = from + delta;
    if (to < 0 || to >= list.length) return;
    [list[from], list[to]] = [list[to], list[from]];
    setLocal((p) => reorderKeys(p, list));
  };
  const renameModel = (name) => {
    setNameError("");
    if (!name) { setNameError("O nome não pode ficar vazio."); return; }
    if (name !== selected && local[name]) { setNameError("Já existe um modelo com esse nome."); return; }
    setLocal((p) => {
      const next = {};
      keys.forEach((key) => { next[key === selected ? name : key] = p[key]; });
      return next;
    });
    setSelected(name);
  };

  // ── Estrutura ──
  const addPhase = () => {
    const used = groups.filter((g) => g.phase).length;
    updateGroups((g) => [...g, { phase: { name: `Nova fase ${used + 1}`, bgColor: PALETTE_VALUES[used % PALETTE_VALUES.length] }, docs: [] }]);
  };
  const startAddDoc = (groupIdx) => {
    if (groupIdx === undefined) {
      if (!groups.length) { updateGroups(() => [{ phase: null, docs: [] }]); setAdding(0); }
      else setAdding(groups.length - 1);
    } else setAdding(groupIdx);
    setNewDoc("");
  };
  const commitDoc = () => {
    const name = newDoc.trim();
    if (name) updateGroups((g) => { g[adding].docs.push({ name, required: true, bgColor: null }); return g; });
    setNewDoc("");
    if (!name) setAdding(null);
  };
  const deletePhase = (groupIdx) => ask({
    title: "Excluir esta fase?",
    text: <>A fase <strong>{groups[groupIdx].phase.name}</strong> e os {groups[groupIdx].docs.length} documentos dela serão removidos do modelo.</>,
    confirmLabel: "Excluir fase",
    onConfirm: () => { updateGroups((g) => g.filter((_, i) => i !== groupIdx)); setConfirm(null); },
  });
  const movePhase = (groupIdx, delta) => updateGroups((g) => {
    const to = groupIdx + delta;
    if (to < 0 || to >= g.length || !g[to].phase) return g; // o grupo "sem fase" fica sempre no topo
    [g[groupIdx], g[to]] = [g[to], g[groupIdx]];
    return g;
  });

  // Arrastar: documentos entre/ dentro de fases e fases entre si.
  const onDragStart = (data) => (event) => { drag.current = data; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", ""); };
  const onDragOver = (target) => (event) => {
    const d = drag.current;
    if (!d || (d.kind === "phase") !== (target.kind === "phase")) return;
    event.preventDefault();
    setDropTarget(JSON.stringify(target));
  };
  const onDrop = (target) => (event) => {
    event.preventDefault();
    const d = drag.current;
    drag.current = null;
    setDropTarget(null);
    if (!d) return;
    if (d.kind === "doc" && target.kind === "doc") {
      updateGroups((g) => {
        const [doc] = g[d.group].docs.splice(d.doc, 1);
        let index = target.doc;
        if (d.group === target.group && d.doc < target.doc) index -= 1;
        g[target.group].docs.splice(Math.max(0, index), 0, doc);
        return g;
      });
    } else if (d.kind === "phase" && target.kind === "phase" && d.group !== target.group && groups[target.group].phase) {
      updateGroups((g) => { const [phase] = g.splice(d.group, 1); g.splice(target.group, 0, phase); return g; });
    }
  };
  const isDrop = (target) => dropTarget === JSON.stringify(target);

  const importDocx = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const items = await parseDocxToItems(file);
      if (!items.length) { setStatus({ type: "error", text: "Nenhum item encontrado. Use Título 2 para fases e parágrafos para documentos." }); return; }
      const name = uniqueName(file.name.replace(/\.docx?$/i, "").trim() || "Importado");
      setLocal((p) => reorderKeys({ ...p, [name]: { items, color: DEFAULT_MODEL_COLOR, order: 999, description: "" } }, [...keys, name]));
      setSelected(name);
      setStatus({ type: "ok", text: `Modelo "${name}" importado. Revise e salve as alterações.` });
    } catch {
      setStatus({ type: "error", text: "Não foi possível ler o arquivo. Use um .docx válido." });
    }
  };

  const save = async () => {
    setSaving(true); setStatus(null);
    try {
      await onSave(local);
      setStatus({ type: "ok", text: "Modelos salvos. Os processos ativos foram atualizados." });
    } catch (error) {
      setStatus({ type: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  };

  const back = () => {
    if (!dirty) { onBack(); return; }
    setConfirm({
      title: "Descartar alterações?",
      text: "Há alterações nos modelos que ainda não foram salvas.",
      confirmLabel: "Descartar e sair",
      onConfirm: onBack,
    });
  };

  const modelActions = (key) => [
    { key: "up", label: "Mover para cima", icon: <span aria-hidden="true">↑</span>, run: () => moveModel(key, -1) },
    { key: "down", label: "Mover para baixo", icon: <span aria-hidden="true">↓</span>, run: () => moveModel(key, 1) },
    { key: "dup", label: "Duplicar", icon: <IconCopy />, run: () => duplicateModel(key) },
    { key: "del", label: "Excluir", icon: <IconTrash />, run: () => deleteModel(key), danger: true },
  ];
  const phaseActions = (groupIdx) => [
    { key: "up", label: "Mover para cima", icon: <span aria-hidden="true">↑</span>, run: () => movePhase(groupIdx, -1) },
    { key: "down", label: "Mover para baixo", icon: <span aria-hidden="true">↓</span>, run: () => movePhase(groupIdx, 1) },
    { key: "add", label: "Adicionar documento", icon: <IconPlus />, run: () => startAddDoc(groupIdx) },
    { key: "del", label: "Excluir fase", icon: <IconTrash />, run: () => deletePhase(groupIdx), danger: true },
  ];

  let phaseNumber = 0;

  return (
    <div className="lk-contracts mm-page">
      <header className="ct-header mm-header">
        <div className="ct-header-text">
          <button type="button" className="mm-breadcrumb" onClick={back}>‹ Administração</button>
          <h1>Gerenciar modelos</h1>
          <p>Defina os tipos de processo e os documentos/fases de cada modelo</p>
        </div>
        <div className="mm-header-actions">
          <button type="button" className="ct-header-export" onClick={() => docxRef.current?.click()} title="Título 2 vira fase; parágrafos viram documentos"><IconUpload /> Importar .docx</button>
          <button type="button" className="ct-new-button" onClick={addModel}><IconPlus /> Novo modelo</button>
          <input ref={docxRef} type="file" accept=".docx" hidden onChange={importDocx} />
        </div>
      </header>

      {(status || dirty) && (
        <div className={`mm-status ${status?.type || "dirty"}`} role="status">
          <span>{status ? status.text : "Há alterações não salvas. Ao salvar, os processos ativos destes modelos são atualizados."}</span>
          {status && <button type="button" onClick={() => setStatus(null)} aria-label="Fechar aviso"><IconClose /></button>}
        </div>
      )}

      <div className="mm-layout">
        <aside className="mm-list" aria-label="Modelos">
          <input className="mm-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar modelos..." aria-label="Buscar modelos" />
          <ul>
            {visibleKeys.map((key) => (
              <li key={key} className={key === selected ? "active" : ""}>
                <button type="button" className="mm-list-item" onClick={() => { setSelected(key); setNameError(""); setAdding(null); }} aria-current={key === selected}>
                  <span className="mm-dot" style={{ background: local[key].color || DEFAULT_MODEL_COLOR }} aria-hidden="true" />
                  <span className="mm-list-text">
                    <strong>{key}</strong>
                    <small>{local[key].description || `${toGroups(local[key].items).filter((g) => g.phase).length} fases`}</small>
                  </span>
                </button>
                <RowMenu contract={{}} actions={modelActions(key)} label={`Ações do modelo ${key}`} />
              </li>
            ))}
            {visibleKeys.length === 0 && <li className="mm-list-empty">Nenhum modelo encontrado.</li>}
          </ul>
          <button type="button" className="mm-dashed" onClick={addModel}><IconPlus /> Novo modelo</button>
        </aside>

        <section className="mm-editor" aria-label="Edição do modelo">
          {!entry ? (
            <div className="mm-empty">
              <strong>Nenhum modelo selecionado</strong>
              <p>Crie um modelo para definir as fases e os documentos de um tipo de processo.</p>
              <button type="button" className="ct-new-button" onClick={addModel}><IconPlus /> Novo modelo</button>
            </div>
          ) : (
            <>
              <header className="mm-editor-head">
                <div className="mm-title">
                  <ColorDot color={entry.color || DEFAULT_MODEL_COLOR} onChange={(color) => updateEntry({ color })} label="Cor do modelo (usada nos processos deste tipo)" size="lg" />
                  <div className="mm-title-text">
                    <InlineText value={selected} onChange={renameModel} className="mm-name" placeholder="Nome do modelo" label="Nome do modelo" />
                    <InlineText value={entry.description || ""} onChange={(description) => updateEntry({ description })} className="mm-desc" placeholder="Adicionar uma descrição curta" label="Descrição do modelo" />
                    {nameError && <small className="ct-file-error">{nameError}</small>}
                  </div>
                </div>
                <div className="mm-editor-actions">
                  <button type="button" className="mm-btn" onClick={() => duplicateModel(selected)}><IconCopy /> Duplicar</button>
                  <button type="button" className="mm-btn danger" onClick={() => deleteModel(selected)}><IconTrash /> Excluir</button>
                  <button type="button" className="ct-new-button mm-save" onClick={save} disabled={!dirty || saving}>{saving ? "Salvando..." : "Salvar alterações"}</button>
                </div>
              </header>

              <div className="mm-structure-head">
                <div>
                  <h2>Estrutura do modelo</h2>
                  <p>Organize as fases e os documentos que compõem este modelo. Arraste ⋮⋮ para reordenar.</p>
                </div>
                <div className="mm-structure-actions">
                  <button type="button" className="mm-btn outline" onClick={addPhase}><IconPlus /> Adicionar fase</button>
                  <button type="button" className="mm-btn outline" onClick={() => startAddDoc()}><IconPlus /> Adicionar documento</button>
                </div>
              </div>

              {groups.length === 0 && <p className="mm-structure-empty">Este modelo ainda não tem fases nem documentos.</p>}

              <div className="mm-phases">
                {groups.map((group, groupIdx) => {
                  if (group.phase) phaseNumber += 1;
                  const isCollapsed = group.phase && collapsed[`${selected}:${groupIdx}`];
                  const phaseTarget = { kind: "phase", group: groupIdx };
                  return (
                    <article key={`${selected}-${groupIdx}`} className={`mm-phase ${isDrop(phaseTarget) ? "drop" : ""}`}
                      onDragOver={group.phase ? onDragOver(phaseTarget) : undefined} onDrop={group.phase ? onDrop(phaseTarget) : undefined}>
                      <header className="mm-phase-head">
                        {group.phase ? (
                          <>
                            <span className="mm-grip" draggable onDragStart={onDragStart({ kind: "phase", group: groupIdx })} title="Arraste para reordenar a fase" aria-hidden="true">⋮⋮</span>
                            <span className="mm-phase-num" style={{ background: group.phase.bgColor }}>{phaseNumber}</span>
                            <InlineText value={group.phase.name} onChange={(name) => name && updateGroups((g) => { g[groupIdx].phase.name = name; return g; })} className="mm-phase-name" placeholder="Nome da fase" label="Nome da fase" />
                            <ColorDot color={group.phase.bgColor} onChange={(bgColor) => updateGroups((g) => { g[groupIdx].phase.bgColor = bgColor; return g; })} label="Cor da fase" size="sm" />
                            <span className="mm-phase-count">{group.docs.length} {group.docs.length === 1 ? "documento" : "documentos"}</span>
                            <button type="button" className="mm-icon-btn" onClick={() => setCollapsed((c) => ({ ...c, [`${selected}:${groupIdx}`]: !isCollapsed }))} aria-expanded={!isCollapsed} aria-label={isCollapsed ? "Expandir fase" : "Recolher fase"}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isCollapsed ? "rotate(180deg)" : "none" }}><path d="m6 15 6-6 6 6" /></svg>
                            </button>
                            <RowMenu contract={{}} actions={phaseActions(groupIdx)} label={`Ações da fase ${group.phase.name}`} />
                          </>
                        ) : (
                          <span className="mm-phase-name static">Documentos sem fase</span>
                        )}
                      </header>
                      {!isCollapsed && (
                        <div className="mm-docs">
                          {group.docs.length > 0 && (
                            <div className="mm-docs-head" aria-hidden="true"><span>Documento</span><span>Obrigatório</span><span /></div>
                          )}
                          {group.docs.map((doc, docIdx) => {
                            const docTarget = { kind: "doc", group: groupIdx, doc: docIdx };
                            return (
                              <div key={`${docIdx}-${doc.name}`} className={`mm-doc ${isDrop(docTarget) ? "drop" : ""} ${doc.bgColor ? "tinted" : ""}`}
                                style={doc.bgColor ? { "--doc-color": doc.bgColor } : undefined}
                                onDragOver={onDragOver(docTarget)} onDrop={onDrop(docTarget)}>
                                <span className="mm-grip" draggable onDragStart={onDragStart({ kind: "doc", group: groupIdx, doc: docIdx })} title="Arraste para reordenar" aria-hidden="true">⋮⋮</span>
                                <InlineText value={doc.name} onChange={(name) => name && updateGroups((g) => { g[groupIdx].docs[docIdx].name = name; return g; })} className="mm-doc-name" placeholder="Nome do documento" label="Nome do documento" />
                                <button type="button" className={`mm-required ${doc.required ? "yes" : "no"}`} aria-pressed={doc.required} title="Clique para alternar"
                                  onClick={() => updateGroups((g) => { g[groupIdx].docs[docIdx].required = !doc.required; return g; })}>
                                  {doc.required ? "Sim" : "Não"}
                                </button>
                                <span className="mm-doc-actions">
                                  <ColorDot color={doc.bgColor} allowNone variant="button" pastel label="Cor do documento" align="right"
                                    onChange={(bgColor) => updateGroups((g) => { g[groupIdx].docs[docIdx].bgColor = bgColor; return g; })} />
                                  <button type="button" className="mm-icon-btn danger" aria-label={`Remover ${doc.name}`} title="Remover documento"
                                    onClick={() => updateGroups((g) => { g[groupIdx].docs.splice(docIdx, 1); return g; })}><IconTrash /></button>
                                </span>
                              </div>
                            );
                          })}
                          {/* Alvo para soltar no fim da fase (também em fases vazias). */}
                          <div className={`mm-doc-end ${isDrop({ kind: "doc", group: groupIdx, doc: group.docs.length }) ? "drop" : ""}`}
                            onDragOver={onDragOver({ kind: "doc", group: groupIdx, doc: group.docs.length })} onDrop={onDrop({ kind: "doc", group: groupIdx, doc: group.docs.length })}>
                            {adding === groupIdx ? (
                              <input className="mm-new-doc" value={newDoc} autoFocus placeholder="Nome do documento — Enter para adicionar, Esc para fechar"
                                onChange={(event) => setNewDoc(event.target.value)} onBlur={commitDoc}
                                onKeyDown={(event) => { if (event.key === "Enter") commitDoc(); if (event.key === "Escape") { setNewDoc(""); setAdding(null); } }} />
                            ) : (
                              <button type="button" className="mm-dashed small" onClick={() => startAddDoc(groupIdx)}><IconPlus /> Adicionar documento</button>
                            )}
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>

      {confirm && <ConfirmModal {...confirm} onCancel={() => setConfirm(null)} onConfirm={() => { const run = confirm.onConfirm; setConfirm(null); run(); }} />}
    </div>
  );
}

