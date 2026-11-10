import { useCallback, useEffect, useMemo, useState } from "react";
import { IconClipboard, IconClose, IconEdit, IconGrid, IconList, IconPlus, IconTrash } from "../icons";
import { PHASE_COLORS, generateId, orderedTemplateTypeNames, tmplColor, tmplItems } from "../utils";
import { formatDate } from "../preferences";
import { useAppSettings } from "../appSettings";
import { Toast, useToast } from "../components/Toast";
import DatePicker from "../components/DatePicker";
import { RowMenu } from "./ContratosPage";

// Demandas: todo processo nasce aqui, pendente (ainda não iniciado) ou já iniciado. Só os iniciados
// aparecem em Processos. Depois de iniciada, a demanda não volta a ser pendente.

const EXIT_MS = 220;
const VIEW_KEY = "lk-demands-view";
const EMPTY_FORM = { status: "pending", priority: "routine", type: "", processNumber: "", dueDate: "", setor: "", title: "", notes: "" };
const PRIORITIES = [["urgent", "Urgente"], ["high", "Prioritária"], ["moderate", "Moderada"], ["routine", "Rotina"]];
const priorityLabel = (priority) => (PRIORITIES.find(([value]) => value === priority) || PRIORITIES[3])[1];

function docsFromTemplate(template) {
  return (template ? tmplItems(template) : []).map((item) => {
    if (typeof item === "string") return { id: generateId(), type: "doc", name: item, done: false, bgColor: null };
    if (item.type === "phase") return { id: generateId(), type: "phase", name: item.name, bgColor: item.bgColor || PHASE_COLORS[0] };
    return { id: generateId(), type: "doc", name: item.name, done: false, bgColor: item.bgColor || null };
  });
}

// Dia atual no fuso do navegador, no formato AAAA-MM-DD.
const localToday = () => new Date().toLocaleDateString("en-CA");

// O que falta para salvar; as mesmas regras são exigidas pelo servidor.
function formProblem(form, editing) {
  if (!form.type) return "Selecione o tipo de processo.";
  // Pendente pode ficar sem número; ele é pedido quando a demanda for iniciada.
  if (form.status === "active" && !form.processNumber.trim()) return "Uma demanda iniciada precisa do número do processo.";
  if (!form.dueDate) return "Informe a data de vencimento.";
  // Demanda não nasce vencida. Pendente que venceu com o tempo só não pode receber outra data passada.
  const checksPast = !editing || (form.status === "pending" && form.dueDate !== editing.dueDate);
  if (checksPast && form.dueDate < localToday()) return "A data de vencimento não pode estar no passado.";
  if (form.status === "active" && !form.setor.trim()) return "Uma demanda iniciada precisa de gestor principal.";
  if (!form.title.trim()) return "Informe o título da demanda.";
  return null;
}

// Gestor salvo que saiu da lista de colaboradores ativos continua disponível na seleção.
function managerOptions(collaborators, current) {
  const names = collaborators.map((c) => c.nome);
  return current && !names.includes(current) ? [current, ...names] : names;
}

function DemandForm({ editing, templates, collaborators, saving, closing, onClose, onSubmit, notify }) {
  const types = useMemo(() => orderedTemplateTypeNames(templates), [templates]);
  const [form, setForm] = useState(() => (editing
    ? { status: editing.status, priority: editing.priority || "routine", type: editing.type || "", processNumber: editing.processNumber || "", dueDate: editing.dueDate || "", setor: editing.setor || "", title: editing.title || "", notes: editing.notes || "" }
    : { ...EMPTY_FORM, type: types[0] || "" }));
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const isStarted = form.status === "active";
  const locked = Boolean(editing);

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape" && !saving) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const submit = (event) => {
    event.preventDefault();
    const problem = formProblem(form, editing);
    if (problem) { notify("error", "Faltam dados da demanda", problem); return; }
    onSubmit(form);
  };

  const typeOptions = form.type && !types.includes(form.type) ? [form.type, ...types] : types;
  return (
    <div className={`ct-detail-overlay ct-form-overlay ${closing ? "closing" : ""}`} onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <div className="contract-form-modal ct-form-drawer dm-form" role="dialog" aria-modal="true" aria-labelledby="dm-form-title">
        <div className="contract-form-header">
          <div>
            <span className="contract-form-eyebrow">{editing ? (isStarted ? "Demanda iniciada" : "Demanda pendente") : "Novo cadastro"}</span>
            <h2 id="dm-form-title">{editing ? editing.title : "Nova demanda"}</h2>
            <p>{editing ? "Altere os campos e salve." : "Preencha os dados da demanda."}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} disabled={saving} aria-label="Fechar"><IconClose /></button>
        </div>
        <form className="contract-form" onSubmit={submit} noValidate>
          <div className="contract-form-body">
            <section className="contract-form-section">
              <div className="contract-form-section-title"><div><strong>Situação</strong></div></div>
              <div className="dm-status" role="radiogroup" aria-label="Situação da demanda">
                {[["pending", "Pendente", "Ainda não foi iniciada"], ["active", "Iniciada", "Já aparece em Processos"]].map(([value, label, hint]) => (
                  <label key={value} className={`dm-status-option ${form.status === value ? "selected" : ""} ${locked ? "locked" : ""}`}>
                    <input type="radio" name="dm-status" value={value} checked={form.status === value} disabled={locked} onChange={update("status")} />
                    <span><strong>{label}</strong><small>{hint}</small></span>
                  </label>
                ))}
              </div>
              {locked && !isStarted && <p className="dm-hint">Para iniciar, use o botão Iniciar na lista de demandas.</p>}
            </section>
            <section className="contract-form-section">
              <div className="contract-form-section-title"><div><strong>Prioridade *</strong></div></div>
              <div className="dm-priority-options" role="radiogroup" aria-label="Prioridade da demanda">
                {PRIORITIES.map(([value, label]) => (
                  <label key={value} className={`dm-priority-option ${value} ${form.priority === value ? "selected" : ""}`}>
                    <input type="radio" name="dm-priority" value={value} checked={form.priority === value} onChange={update("priority")} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </section>
            <section className="contract-form-section">
              <div className="contract-form-section-title"><div><strong>Dados da demanda</strong></div></div>
              <div className="contract-form-grid">
                <label className="contract-field contract-field-wide">
                  <span>Título da demanda *</span>
                  <input value={form.title} onChange={update("title")} maxLength={255} placeholder="Ex.: Compra de cadeiras" />
                </label>
                <label className="contract-field">
                  <span>Tipo de processo *</span>
                  <select value={form.type} onChange={update("type")} disabled={locked && isStarted}>
                    {typeOptions.length === 0 && <option value="">Cadastre os modelos em Administração</option>}
                    {typeOptions.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>
                <label className="contract-field">
                  <span>Número do processo {isStarted ? "*" : "(opcional)"}</span>
                  <input value={form.processNumber} onChange={(event) => setForm((current) => ({ ...current, processNumber: event.target.value.replace(/[^0-9./-]/g, "") }))} maxLength={100} placeholder="Ex.: 001/2026" />
                </label>
                <label className="contract-field">
                  <span>Data de vencimento *</span>
                  <DatePicker value={form.dueDate} onChange={(dueDate) => setForm((current) => ({ ...current, dueDate }))} required min={isStarted && editing ? undefined : localToday()} />
                </label>
                <label className="contract-field">
                  <span>Gestor principal {isStarted ? "*" : "(opcional)"}</span>
                  <select value={form.setor} onChange={update("setor")}>
                    <option value="">{collaborators.length ? "Selecione o gestor" : "Nenhum colaborador cadastrado"}</option>
                    {managerOptions(collaborators, form.setor).map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>
                <label className="contract-field contract-field-wide">
                  <span>Observação</span>
                  <textarea value={form.notes} onChange={update("notes")} maxLength={2000} rows={4} placeholder="Informações úteis sobre a demanda" />
                </label>
              </div>
            </section>
          </div>
          <div className="contract-form-footer">
            <button type="button" className="btn-cancel-lg" onClick={onClose} disabled={saving}><IconClose /> Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {editing ? <IconEdit /> : <IconPlus />} {saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar demanda"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Só aparece quando falta gestor ou número do processo: sem eles, a demanda não pode ser iniciada.
const missingToStart = (demand) => ({ setor: !demand.setor?.trim(), processNumber: !demand.processNumber?.trim() });

function StartDialog({ demand, collaborators, busy, onCancel, onConfirm, notify }) {
  const missing = missingToStart(demand);
  const [setor, setSetor] = useState("");
  const [processNumber, setProcessNumber] = useState("");
  const confirm = () => {
    if (missing.processNumber && !processNumber.trim()) { notify("error", "Falta o número do processo", "Informe o número para iniciar a demanda."); return; }
    if (missing.setor && !setor) { notify("error", "Falta o gestor principal", "Selecione o gestor para iniciar a demanda."); return; }
    onConfirm({ ...(missing.setor ? { setor } : {}), ...(missing.processNumber ? { processNumber: processNumber.trim() } : {}) });
  };
  const needs = [missing.processNumber && "do número do processo", missing.setor && "de um gestor principal"].filter(Boolean).join(" e ");
  return (
    <div className="contract-modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && !busy && onCancel()}>
      <div className="contract-delete-modal dm-start-modal" role="dialog" aria-modal="true" aria-labelledby="dm-start-title">
        <h2 id="dm-start-title">Faltam dados para iniciar</h2>
        <p><strong>{demand.title}</strong> precisa {needs} para ser iniciada.</p>
        {missing.processNumber && (
          <label className="contract-field dm-start-field">
            <span>Número do processo *</span>
            <input value={processNumber} onChange={(event) => setProcessNumber(event.target.value.replace(/[^0-9./-]/g, ""))} maxLength={100} placeholder="Ex.: 001/2026" autoFocus />
          </label>
        )}
        {missing.setor && (
          <label className="contract-field dm-start-field">
            <span>Gestor principal *</span>
            <select value={setor} onChange={(event) => setSetor(event.target.value)} autoFocus={!missing.processNumber}>
              <option value="">{collaborators.length ? "Selecione o gestor" : "Nenhum colaborador cadastrado"}</option>
              {collaborators.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
            </select>
          </label>
        )}
        <div className="contract-delete-actions">
          <button type="button" className="btn-cancel-lg" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={confirm} disabled={busy}>{busy ? "Iniciando..." : "Iniciar demanda"}</button>
        </div>
      </div>
    </div>
  );
}

const demandActions = (handlers) => [
  { key: "edit", label: "Editar", icon: <IconEdit />, run: handlers.onEdit },
  { key: "delete", label: "Excluir", icon: <IconTrash />, run: handlers.onDelete, danger: true },
];
const SituationBadge = ({ demand }) => <span className={`ct-badge ${demand.status === "pending" ? "amber" : "green"} dm-badge`}>{demand.status === "pending" ? "Pendente" : "Iniciada"}</span>;
const PriorityBadge = ({ demand }) => <span className={`dm-priority ${demand.priority || "routine"}`}>{priorityLabel(demand.priority)}</span>;
const TypeLabel = ({ demand, className = "" }) => <span className={`dm-type ${className}`}><i style={{ background: demand.typeColor || "var(--lk-muted)" }} aria-hidden="true" />{demand.type || "—"}</span>;
const DueDate = ({ demand, today }) => <>{formatDate(demand.dueDate)}{demand.dueDate && String(demand.dueDate).slice(0, 10) < today && <small className="dm-overdue">Vencida</small>}</>;

function DemandsTable({ demands, today, isViewer, starting, handlers }) {
  return (
    <div className="ct-table-wrap">
      <table className="ct-table dm-table">
        <thead>
          <tr>
            <th>Processo</th><th>Demanda</th><th>Prioridade</th><th>Tipo</th><th>Gestor principal</th><th>Vencimento</th><th>Situação</th>
            {!isViewer && <th className="ct-col-action">Ação</th>}
          </tr>
        </thead>
        <tbody>
          {demands.map((d) => (
            <tr key={d.id}>
              <td className="ct-col-number">{d.processNumber || "—"}</td>
              <td data-label="Demanda" className="ct-col-object">
                <strong>{d.title}</strong>
                <TypeLabel demand={d} className="dm-name-type" />
                {d.notes && <span title={d.notes}>{d.notes}</span>}
              </td>
              <td data-label="Prioridade"><PriorityBadge demand={d} /></td>
              <td data-label="Tipo"><TypeLabel demand={d} /></td>
              <td data-label="Gestor principal">{d.setor || <span className="dm-empty">Sem gestor</span>}</td>
              <td data-label="Vencimento" className="dm-due"><DueDate demand={d} today={today} /></td>
              <td data-label="Situação">
                <span className="dm-situation">
                  <SituationBadge demand={d} />
                  {!isViewer && d.status === "pending" && <button type="button" className="dm-start" onClick={() => handlers.onStart(d)} disabled={starting}>Iniciar</button>}
                </span>
              </td>
              {!isViewer && <td className="ct-col-action"><RowMenu contract={d} label={`Ações da demanda ${d.title}`} actions={demandActions(handlers)} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DemandCard({ demand, today, isViewer, starting, handlers }) {
  return (
    <article className={`contract-card dm-card ${demand.priority || "routine"}`}>
      <div className="contract-card-top">
        <div className="contract-card-badges">
          <PriorityBadge demand={demand} />
          <SituationBadge demand={demand} />
        </div>
        {!isViewer && (
          <div className="contract-card-actions">
            {demandActions(handlers).map((action) => (
              <button type="button" key={action.key} className={`icon-btn ${action.danger ? "danger" : ""}`} title={action.label} aria-label={`${action.label} a demanda ${demand.title}`} onClick={() => action.run(demand)}>
                {action.icon}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="contract-card-title-wrap">
        <p className="contract-card-kicker">Demanda</p>
        <h2 className="contract-card-title" title={demand.title}>{demand.title}</h2>
        {demand.notes && <p className="contract-card-object" title={demand.notes}>{demand.notes}</p>}
      </div>
      <div className="contract-info-grid">
        <div className="contract-info-item"><span>Nº do processo</span><strong title={demand.processNumber || undefined}>{demand.processNumber || "—"}</strong></div>
        <div className="contract-info-item"><span>Tipo</span><strong title={demand.type || undefined}>{demand.type || "—"}</strong></div>
        <div className="contract-info-item"><span>Gestor principal</span><strong title={demand.setor || undefined}>{demand.setor || "Sem gestor"}</strong></div>
        <div className="contract-info-item"><span>Vencimento</span><strong><DueDate demand={demand} today={today} /></strong></div>
      </div>
      {!isViewer && demand.status === "pending" && (
        <div className="dm-card-foot"><button type="button" className="dm-start" onClick={() => handlers.onStart(demand)} disabled={starting}>Iniciar demanda</button></div>
      )}
    </article>
  );
}

export default function DemandasPage({ demands, templates, collaborators, loading, error, isViewer, onCreate, onUpdate, onStart, onDelete, onOpenMenu }) {
  const { toast, notify, closeToast } = useToast();
  const { settings } = useAppSettings();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [formClosing, setFormClosing] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [startTarget, setStartTarget] = useState(null);
  const [starting, setStarting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [view, setView] = useState(() => {
    try { return localStorage.getItem(VIEW_KEY) === "cards" ? "cards" : "list"; } catch { return "list"; }
  });
  const changeView = (next) => {
    setView(next);
    try { localStorage.setItem(VIEW_KEY, next); } catch { /* preferência só desta sessão */ }
  };


  const openNew = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (demand) => { setEditing(demand); setFormOpen(true); };
  const finishClosing = useCallback(() => {
    setFormClosing(true);
    setTimeout(() => { setFormOpen(false); setEditing(null); setFormClosing(false); }, EXIT_MS);
  }, []);
  const closeForm = useCallback(() => { if (!saving && !formClosing) finishClosing(); }, [saving, formClosing, finishClosing]);

  const handleSubmit = async (form) => {
    const fields = { priority: form.priority, title: form.title.trim(), processNumber: form.processNumber.trim(), dueDate: form.dueDate, setor: form.setor.trim(), notes: form.notes.trim() };
    const typeChanged = !editing || editing.type !== form.type;
    const typeFields = { type: form.type, typeColor: tmplColor(form.type, templates[form.type]) };
    setSaving(true);
    try {
      if (editing) {
        // Trocar o tipo de uma pendente troca o checklist; nos demais casos os itens continuam como estão.
        await onUpdate(editing.id, { ...fields, ...(typeChanged ? typeFields : { type: editing.type, typeColor: editing.typeColor }), docs: typeChanged ? docsFromTemplate(templates[form.type]) : editing.docs });
        notify("ok", "Demanda salva", fields.title);
      } else {
        await onCreate({ id: generateId(), status: form.status, ...fields, ...typeFields, docs: docsFromTemplate(templates[form.type]) });
        notify("ok", "Demanda criada", form.status === "active" ? "Ela já aparece em Processos." : "Ela fica aqui até ser iniciada.");
      }
      finishClosing();
    } catch (saveError) {
      notify("error", "Não foi possível salvar", saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const start = async (demand, missingFields = {}) => {
    setStarting(true);
    try {
      await onStart(demand.id, missingFields);
      setStartTarget(null);
      notify("ok", "Demanda iniciada", "Ela já aparece em Processos.");
    } catch (startError) {
      notify("error", "Não foi possível iniciar", startError.message);
    } finally {
      setStarting(false);
    }
  };
  const requestStart = (demand) => (Object.values(missingToStart(demand)).some(Boolean) ? setStartTarget(demand) : start(demand));

  const remove = async (demand = deleteTarget) => {
    setDeleting(true);
    try {
      await onDelete(demand.id);
      setDeleteTarget(null);
      notify("ok", "Demanda excluída", demand.title);
    } catch (deleteError) {
      notify("error", "Não foi possível excluir", deleteError.message);
    } finally {
      setDeleting(false);
    }
  };
  const requestDelete = (demand) => (settings.confirmBeforeDelete ? setDeleteTarget(demand) : remove(demand));

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("pt-BR");
    return demands
      .filter((d) => statusFilter === "all" || d.status === statusFilter)
      .filter((d) => !q || [d.title, d.processNumber, d.type, d.setor, d.notes].some((value) => (value || "").toLocaleLowerCase("pt-BR").includes(q)))
      // Pendentes primeiro; dentro de cada situação, o vencimento mais próximo.
      .sort((a, b) => (a.status === b.status ? 0 : a.status === "pending" ? -1 : 1) || String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999")));
  }, [demands, search, statusFilter]);

  const pendingCount = demands.filter((d) => d.status === "pending").length;
  const handlers = { onEdit: openEdit, onDelete: requestDelete, onStart: requestStart };
  const today = localToday();
  const hasTemplates = orderedTemplateTypeNames(templates).length > 0;

  return (
    <div className="lk-contracts dm-page">
      <h1 className="lk-sr">Demandas</h1>
      <header className={`ct-header ${isViewer ? "lk-menu-bar" : ""}`}>
        <button className="lk-menu" aria-label="Abrir navegação" onClick={onOpenMenu}>☰</button>
        {!isViewer && (
          <div className="ct-header-actions">
            <button type="button" className="ct-new-button dm-new" onClick={openNew} disabled={!hasTemplates} title={hasTemplates ? undefined : "Cadastre os modelos em Administração"}><IconPlus /> Nova demanda</button>
          </div>
        )}
      </header>

      {error && <div className="ct-message" role="alert"><span>{error}</span></div>}

      <section className="lk-kpis ct-kpis" aria-label="Resumo das demandas">
        {[
          ["DEMANDAS", demands.length, "blue", "Pendentes e iniciadas"],
          ["PENDENTES", pendingCount, "amber", "Ainda não iniciadas"],
          ["INICIADAS", demands.length - pendingCount, "green", "Também aparecem em Processos"],
          ["URGENTES", demands.filter((d) => d.priority === "urgent").length, "red", "Com prioridade Urgente"],
        ].map(([label, value, tone, hint]) => (
          <article className={`lk-kpi ${tone}`} key={label} title={hint}>
            <h2><i aria-hidden="true" />{label}</h2>
            <strong>{loading ? "—" : value}</strong>
          </article>
        ))}
      </section>

      <section className="ct-toolbar dm-toolbar" aria-label="Filtros de demandas">
        <label className="ct-field ct-field-search">
          <span>Buscar demanda</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Título, número, tipo, gestor..." />
        </label>
        <div className="ct-toolbar-actions">
          <div className="ct-view-toggle ct-scope-toggle" role="group" aria-label="Situação das demandas">
            {[["all", "Todas", demands.length], ["pending", "Pendentes", pendingCount], ["active", "Iniciadas", demands.length - pendingCount]].map(([value, label, count]) => (
              <button type="button" key={value} className={statusFilter === value ? "active" : ""} aria-pressed={statusFilter === value} onClick={() => setStatusFilter(value)}>{label} <span className="ct-toggle-count">{loading ? "—" : count}</span></button>
            ))}
          </div>
          <div className="ct-view-toggle ct-icon-toggle" role="group" aria-label="Visualização">
            <button type="button" className={view === "list" ? "active" : ""} aria-pressed={view === "list"} aria-label="Lista" title="Lista" onClick={() => changeView("list")}><IconList /></button>
            <button type="button" className={view === "cards" ? "active" : ""} aria-pressed={view === "cards"} aria-label="Cards" title="Cards" onClick={() => changeView("cards")}><IconGrid /></button>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="ct-state">
          <span className="contracts-spinner" />
          <h2>Carregando demandas</h2>
          <p>Aguarde enquanto buscamos os dados cadastrados.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="ct-state">
          <div className="contracts-state-icon"><IconClipboard /></div>
          <h2>{demands.length === 0 ? "Nenhuma demanda cadastrada" : "Nenhuma demanda encontrada"}</h2>
          <p>{demands.length === 0 ? (isViewer ? "As demandas cadastradas aparecem aqui." : "Cadastre a primeira demanda, pendente ou já iniciada.") : "Ajuste os filtros ou use outro termo de busca."}</p>
          {!isViewer && demands.length === 0 && hasTemplates && <button type="button" className="ct-add" onClick={openNew}><IconPlus /> Criar primeira demanda</button>}
        </div>
      ) : (
        <section className={view === "list" ? "ct-list" : "ct-cards-section"} aria-label="Lista de demandas">
          {view === "list"
            ? <DemandsTable demands={filtered} today={today} isViewer={isViewer} starting={starting} handlers={handlers} />
            : <div className="contracts-grid dm-grid">{filtered.map((d) => <DemandCard key={d.id} demand={d} today={today} isViewer={isViewer} starting={starting} handlers={handlers} />)}</div>}
          <footer className="ct-pagination">
            <span>{filtered.length === demands.length
              ? `${demands.length} ${demands.length === 1 ? "demanda" : "demandas"}`
              : `${filtered.length} de ${demands.length} demandas`}</span>
          </footer>
        </section>
      )}

      {formOpen && (
        <DemandForm key={editing?.id || "nova"} editing={editing} templates={templates} collaborators={collaborators} saving={saving}
          closing={formClosing} onClose={closeForm} onSubmit={handleSubmit} notify={notify} />
      )}

      {startTarget && (
        <StartDialog demand={startTarget} collaborators={collaborators} busy={starting} onCancel={() => setStartTarget(null)}
          onConfirm={(fields) => start(startTarget, fields)} notify={notify} />
      )}

      {deleteTarget && (
        <div className="contract-modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && !deleting && setDeleteTarget(null)}>
          <div className="contract-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="dm-delete-title">
            <div className="contract-delete-icon"><IconTrash /></div>
            <h2 id="dm-delete-title">Excluir esta demanda?</h2>
            <p><strong>{deleteTarget.title}</strong> será removida permanentemente{deleteTarget.status === "active" ? ", inclusive de Processos, com o checklist" : ""}.</p>
            <div className="contract-delete-actions">
              <button type="button" className="btn-cancel-lg" onClick={() => setDeleteTarget(null)} disabled={deleting} autoFocus>Cancelar</button>
              <button type="button" className="btn-danger" onClick={() => remove()} disabled={deleting}>{deleting ? "Excluindo..." : "Excluir demanda"}</button>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} onClose={closeToast} />
    </div>
  );
}
