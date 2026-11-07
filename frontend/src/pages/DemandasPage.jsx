import { useCallback, useEffect, useMemo, useState } from "react";
import { IconClipboard, IconClose, IconEdit, IconPlus, IconTrash } from "../icons";
import { PHASE_COLORS, generateId, orderedTemplateTypeNames, tmplColor, tmplItems } from "../utils";
import { formatDate } from "../preferences";
import { useAppSettings } from "../appSettings";
import { Toast, useToast } from "../components/Toast";
import DatePicker from "../components/DatePicker";
import { RowMenu } from "./ContratosPage";

// Demandas: todo processo nasce aqui, pendente (ainda não iniciado) ou já iniciado. Só os iniciados
// aparecem em Processos. Depois de iniciada, a demanda não volta a ser pendente.

const EXIT_MS = 220;
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
  if (!form.processNumber.trim()) return "Informe o número do processo.";
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
                  <span>Número do processo *</span>
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

// Só aparece quando a demanda não tem gestor: sem ele, ela não pode ser iniciada.
function StartDialog({ demand, collaborators, busy, onCancel, onConfirm, notify }) {
  const [setor, setSetor] = useState("");
  const confirm = () => {
    if (!setor) { notify("error", "Falta o gestor principal", "Selecione o gestor para iniciar a demanda."); return; }
    onConfirm(setor);
  };
  return (
    <div className="contract-modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && !busy && onCancel()}>
      <div className="contract-delete-modal dm-start-modal" role="dialog" aria-modal="true" aria-labelledby="dm-start-title">
        <h2 id="dm-start-title">Quem é o gestor principal?</h2>
        <p><strong>{demand.title}</strong> precisa de um gestor principal para ser iniciada.</p>
        <label className="contract-field dm-start-field">
          <span>Gestor principal *</span>
          <select value={setor} onChange={(event) => setSetor(event.target.value)} autoFocus>
            <option value="">{collaborators.length ? "Selecione o gestor" : "Nenhum colaborador cadastrado"}</option>
            {collaborators.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
          </select>
        </label>
        <div className="contract-delete-actions">
          <button type="button" className="btn-cancel-lg" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={confirm} disabled={busy}>{busy ? "Iniciando..." : "Iniciar demanda"}</button>
        </div>
      </div>
    </div>
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

  const start = async (demand, setor) => {
    setStarting(true);
    try {
      await onStart(demand.id, setor);
      setStartTarget(null);
      notify("ok", "Demanda iniciada", "Ela já aparece em Processos.");
    } catch (startError) {
      notify("error", "Não foi possível iniciar", startError.message);
    } finally {
      setStarting(false);
    }
  };
  const requestStart = (demand) => (demand.setor?.trim() ? start(demand) : setStartTarget(demand));

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
  const today = localToday();
  const hasTemplates = orderedTemplateTypeNames(templates).length > 0;

  return (
    <div className="lk-contracts cb-page dm-page">
      <h1 className="lk-sr">Demandas</h1>
      <header className="ct-header lk-menu-bar">
        <button className="lk-menu" aria-label="Abrir navegação" onClick={onOpenMenu}>☰</button>
      </header>

      {error && <div className="ct-message" role="alert"><span>{error}</span></div>}

      <section className="ct-toolbar cb-toolbar" aria-label="Filtros de demandas">
        <label className="ct-field cb-field-search">
          <span>Buscar demanda</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Título, número, tipo, gestor..." />
        </label>
        <label className="ct-field">
          <span>Situação</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">Todas as situações</option>
            <option value="pending">Pendentes</option>
            <option value="active">Iniciadas</option>
          </select>
        </label>
        {!isViewer && <button type="button" className="ct-new-button cb-new" onClick={openNew} disabled={!hasTemplates} title={hasTemplates ? undefined : "Cadastre os modelos de processo em Administração"}><IconPlus /> Nova demanda</button>}
      </section>

      <section className="cb-card" aria-label="Lista de demandas">
        <header className="cb-card-head">
          <h2>Lista de demandas</h2>
          <p>{pendingCount === 1 ? "1 pendente" : `${pendingCount} pendentes`} de {demands.length} {demands.length === 1 ? "demanda" : "demandas"}</p>
        </header>

        {loading ? (
          <div className="cb-state"><span className="contracts-spinner" /><p>Carregando demandas…</p></div>
        ) : filtered.length === 0 ? (
          <div className="cb-state">
            <div className="contracts-state-icon"><IconClipboard /></div>
            <h3>{demands.length === 0 ? "Nenhuma demanda cadastrada" : "Nenhuma demanda encontrada"}</h3>
            <p>{demands.length === 0 ? (isViewer ? "As demandas cadastradas aparecem aqui." : "Cadastre a primeira demanda, pendente ou já iniciada.") : "Ajuste a busca ou o filtro de situação."}</p>
            {!isViewer && demands.length === 0 && hasTemplates && <button type="button" className="ct-new-button" onClick={openNew}><IconPlus /> Criar primeira demanda</button>}
          </div>
        ) : (
          <div className="cb-table-wrap">
            <table className="cb-table dm-table">
              <thead>
                <tr>
                  <th className="cb-col-name">Demanda</th>
                  <th>Prioridade</th>
                  <th>Tipo</th>
                  <th>Gestor principal</th>
                  <th>Vencimento</th>
                  <th>Situação</th>
                  {!isViewer && <th className="cb-col-action">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => {
                  const overdue = d.dueDate && String(d.dueDate).slice(0, 10) < today;
                  return (
                    <tr key={d.id}>
                      <td className="cb-col-name">
                        <strong>{d.title}</strong>
                        <small>Nº {d.processNumber || "—"}</small>
                        <span className="dm-type dm-name-type"><i style={{ background: d.typeColor || "var(--lk-muted)" }} aria-hidden="true" />{d.type || "—"}</span>
                        {d.notes &&<span className="dm-notes" title={d.notes}>{d.notes}</span>}
                      </td>
                      <td data-label="Prioridade"><span className={`dm-priority ${d.priority || "routine"}`}>{priorityLabel(d.priority)}</span></td>
                      <td data-label="Tipo"><span className="dm-type"><i style={{ background: d.typeColor || "var(--lk-muted)" }} aria-hidden="true" />{d.type || "—"}</span></td>
                      <td data-label="Gestor principal">{d.setor || <span className="dm-empty">Sem gestor</span>}</td>
                      <td data-label="Vencimento" className="dm-due">{formatDate(d.dueDate)}{overdue && <small className="dm-overdue">Vencida</small>}</td>
                      <td data-label="Situação">
                        <span className="dm-situation">
                          <span className={`ct-badge ${d.status === "pending" ? "amber" : "green"} cb-badge`}>{d.status === "pending" ? "Pendente" : "Iniciada"}</span>
                          {!isViewer && d.status === "pending" && <button type="button" className="dm-start" onClick={() => requestStart(d)} disabled={starting}>Iniciar</button>}
                        </span>
                      </td>
                      {!isViewer && (
                        <td className="cb-col-action">
                          <RowMenu contract={d} label={`Ações da demanda ${d.title}`} actions={[
                            { key: "edit", label: "Editar", icon: <IconEdit />, run: openEdit },
                            { key: "delete", label: "Excluir", icon: <IconTrash />, run: requestDelete, danger: true },
                          ]} />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <footer className="cb-card-foot">
            {filtered.length === demands.length
              ? `Mostrando ${demands.length} ${demands.length === 1 ? "demanda" : "demandas"}`
              : `Mostrando ${filtered.length} de ${demands.length} demandas`}
          </footer>
        )}
      </section>

      {formOpen && (
        <DemandForm key={editing?.id || "nova"} editing={editing} templates={templates} collaborators={collaborators} saving={saving}
          closing={formClosing} onClose={closeForm} onSubmit={handleSubmit} notify={notify} />
      )}

      {startTarget && (
        <StartDialog demand={startTarget} collaborators={collaborators} busy={starting} onCancel={() => setStartTarget(null)}
          onConfirm={(setor) => start(startTarget, setor)} notify={notify} />
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
