import { useCallback, useEffect, useMemo, useState } from "react";
import { IconArchive, IconClose, IconEdit, IconPlus, IconTrash, IconUnarchive, IconUsers } from "../icons";
import { authFetch } from "../authFetch";
import { useAppSettings } from "../appSettings";
import { RowMenu } from "./ContratosPage";
import "./ColaboradoresPage.css";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";
const EMPTY_FORM = { nome: "", cpf: "", email: "", codigo: "", ativo: true };
const EXIT_MS = 220;

function formatCpf(val) {
  const d = val.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

// Formulário em painel lateral, no mesmo padrão do cadastro de contratos.
function CollaboratorForm({ editing, form, setForm, saving, error, closing, onClose, onSubmit }) {
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape" && !saving) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  return (
    <div className={`ct-detail-overlay ct-form-overlay ${closing ? "closing" : ""}`} onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <div className="contract-form-modal ct-form-drawer cb-form" role="dialog" aria-modal="true" aria-labelledby="cb-form-title">
        <div className="contract-form-header">
          <div>
            <span className="contract-form-eyebrow">{editing ? editing.codigo : "Novo cadastro"}</span>
            <h2 id="cb-form-title">{editing ? editing.nome : "Novo colaborador"}</h2>
            <p>{editing ? "Editando colaborador — altere os campos e salve." : "Preencha os dados do colaborador."}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} disabled={saving} aria-label="Fechar"><IconClose /></button>
        </div>
        <form className="contract-form" onSubmit={onSubmit}>
          <div className="contract-form-body">
            {error && <div className="contract-form-error">{error}</div>}
            <section className="contract-form-section">
              <div className="contract-form-section-title"><div><strong>Dados pessoais</strong></div></div>
              <div className="contract-form-grid">
                <label className="contract-field contract-field-wide">
                  <span>Nome completo *</span>
                  <input value={form.nome} onChange={update("nome")} maxLength={255} required autoFocus placeholder="Nome completo" />
                </label>
                <label className="contract-field">
                  <span>CPF *</span>
                  <input value={form.cpf} onChange={(event) => setForm((current) => ({ ...current, cpf: formatCpf(event.target.value) }))} required inputMode="numeric" placeholder="000.000.000-00" />
                </label>
                <label className="contract-field">
                  <span>E-mail *</span>
                  <input type="email" value={form.email} onChange={update("email")} maxLength={254} required placeholder="email@exemplo.com" />
                </label>
              </div>
            </section>
            <section className="contract-form-section">
              <div className="contract-form-section-title"><div><strong>Matrícula</strong></div></div>
              <div className="contract-form-grid">
                <label className="contract-field">
                  <span>COD</span>
                  <input value={form.codigo} onChange={(event) => setForm((current) => ({ ...current, codigo: event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") }))}
                    maxLength={20} placeholder={editing ? editing.codigo : "Gerado automaticamente"} />
                </label>
                <label className="ct-checkbox cb-status-check">
                  <input type="checkbox" checked={form.ativo} onChange={(event) => setForm((current) => ({ ...current, ativo: event.target.checked }))} />
                  <span>Colaborador ativo <em>— inativos não aparecem nas listas de seleção</em></span>
                </label>
              </div>
            </section>
          </div>
          <div className="contract-form-footer">
            <button type="button" className="btn-cancel-lg" onClick={onClose} disabled={saving}><IconClose /> Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {editing ? <IconEdit /> : <IconPlus />} {saving ? "Salvando..." : editing ? "Salvar alterações" : "Adicionar colaborador"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ColaboradoresPage({ isAdmin, onUnauthorized, onOpenMenu }) {
  const [collabs, setCollabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [formClosing, setFormClosing] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Admin usa a rota completa; os demais perfis, a de leitura.
  const listUrl = isAdmin ? `${API_URL}/api/admin/collaborators` : `${API_URL}/api/collaborators`;
  const load = useCallback(() => {
    setError(""); setLoading(true);
    authFetch(listUrl)
      .then((res) => {
        if (res.status === 401) throw new Error("401");
        if (!res.ok) throw new Error("fail");
        return res.json();
      })
      .then((data) => setCollabs(Array.isArray(data) ? data : []))
      .catch((e) => {
        if (e.message === "401") onUnauthorized();
        else setError("Não foi possível carregar os colaboradores.");
      })
      .finally(() => setLoading(false));
  }, [listUrl, onUnauthorized]);

  useEffect(() => { load(); }, [load]);

  // Rolagem discreta da página, como em Contratos.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("ct-scroll");
    return () => root.classList.remove("ct-scroll");
  }, []);

  const openAdd = () => { setEditing(null); setForm(EMPTY_FORM); setFormError(""); setShowForm(true); };
  const openEdit = (c) => {
    setEditing(c);
    setForm({ nome: c.nome, cpf: c.cpf, email: c.email, codigo: c.codigo || "", ativo: c.ativo !== false });
    setFormError("");
    setShowForm(true);
  };
  const closeForm = useCallback(() => {
    if (saving || formClosing) return;
    setFormClosing(true);
    setTimeout(() => { setShowForm(false); setEditing(null); setFormError(""); setFormClosing(false); }, EXIT_MS);
  }, [saving, formClosing]);

  const save = async (target, body) => {
    const res = await authFetch(target ? `${API_URL}/api/admin/collaborators/${target.id}` : `${API_URL}/api/admin/collaborators`, {
      method: target ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 401) { onUnauthorized(); return null; }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Falha ao salvar");
    setCollabs((current) => target ? current.map((c) => (c.id === data.id ? data : c)) : [...current, data]);
    return data;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError(""); setSaving(true);
    try {
      const saved = await save(editing, { ...form, nome: form.nome.trim(), cpf: form.cpf.trim(), email: form.email.trim(), codigo: form.codigo.trim() });
      if (saved) { setSaving(false); closeFormAfterSave(); }
    } catch (saveError) { setFormError(saveError.message); }
    finally { setSaving(false); }
  };
  // Depois de salvar, fecha com a mesma animação (sem a trava de "salvando").
  const closeFormAfterSave = () => {
    setFormClosing(true);
    setTimeout(() => { setShowForm(false); setEditing(null); setFormClosing(false); }, EXIT_MS);
  };

  const toggleStatus = async (c) => {
    setError("");
    try { await save(c, { nome: c.nome, cpf: c.cpf, email: c.email, codigo: c.codigo || "", ativo: !c.ativo }); }
    catch (toggleError) { setError(toggleError.message); }
  };

  const { settings } = useAppSettings();
  const requestDelete = (c) => (settings.confirmBeforeDelete ? setDeleteTarget(c) : handleDelete(c));
  const handleDelete = async (target = deleteTarget) => {
    if (!target) return;
    setDeleting(true); setError("");
    try {
      const res = await authFetch(`${API_URL}/api/admin/collaborators/${target.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao remover");
      setCollabs((current) => current.filter((c) => c.id !== target.id));
      setDeleteTarget(null);
    } catch (deleteError) { setError(deleteError.message); }
    finally { setDeleting(false); }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("pt-BR");
    const digits = q.replace(/\D/g, "");
    return collabs
      .filter((c) => statusFilter === "all" || (statusFilter === "active") === (c.ativo !== false))
      .filter((c) => !q
        || c.nome.toLocaleLowerCase("pt-BR").includes(q)
        || c.email.toLocaleLowerCase("pt-BR").includes(q)
        || (c.codigo || "").toLocaleLowerCase("pt-BR").includes(q)
        || (digits && c.cpf.replace(/\D/g, "").includes(digits)))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [collabs, search, statusFilter]);

  const actionsFor = (c) => [
    { key: "edit", label: "Editar", icon: <IconEdit />, run: openEdit },
    c.ativo !== false
      ? { key: "deactivate", label: "Inativar", icon: <IconArchive />, run: toggleStatus }
      : { key: "activate", label: "Ativar", icon: <IconUnarchive />, run: toggleStatus },
    { key: "delete", label: "Excluir", icon: <IconTrash />, run: requestDelete, danger: true },
  ];

  return (
    // Reaproveita o visual de Contratos (lk-contracts): barra, tabela, selos, menu, painel e modais.
    <div className="lk-contracts cb-page">
      <header className="ct-header">
        <button className="lk-menu" aria-label="Abrir navegação" onClick={onOpenMenu}>☰</button>
        <div className="ct-header-text">
          <h1>Colaboradores</h1>
          <p>Cadastre e consulte os dados dos colaboradores vinculados ao sistema</p>
        </div>
      </header>

      {error && (
        <div className="ct-message" role="alert">
          <span>{error}</span>
          <button type="button" onClick={load}>Tentar novamente</button>
        </div>
      )}

      <section className="ct-toolbar cb-toolbar" aria-label="Filtros de colaboradores">
        <label className="ct-field cb-field-search">
          <span>Buscar colaborador</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, CPF, e-mail ou COD..." />
        </label>
        <label className="ct-field">
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">Todos os status</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
        </label>
        {isAdmin && <button type="button" className="ct-new-button cb-new" onClick={openAdd}><IconPlus /> Novo colaborador</button>}
      </section>

      <section className="cb-card" aria-label="Cadastro de colaboradores">
        <header className="cb-card-head">
          <h2>Cadastro de colaboradores</h2>
          <p>Dados pessoais e código interno de matrícula</p>
        </header>

        {loading ? (
          <div className="cb-state"><span className="contracts-spinner" /><p>Carregando colaboradores…</p></div>
        ) : filtered.length === 0 ? (
          <div className="cb-state">
            <div className="contracts-state-icon"><IconUsers /></div>
            <h3>{collabs.length === 0 ? "Nenhum colaborador cadastrado" : "Nenhum colaborador encontrado"}</h3>
            <p>{collabs.length === 0 ? "Cadastre o primeiro colaborador para usá-lo nos processos e contratos." : "Ajuste a busca ou o filtro de status."}</p>
            {isAdmin && collabs.length === 0 && <button type="button" className="ct-new-button" onClick={openAdd}><IconPlus /> Adicionar primeiro colaborador</button>}
          </div>
        ) : (
          <div className="cb-table-wrap">
            <table className="cb-table">
              <thead>
                <tr>
                  <th>Nome completo</th>
                  <th>E-mail</th>
                  <th>COD</th>
                  <th className="cb-col-status">Status</th>
                  {isAdmin && <th className="cb-col-action">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className={c.ativo === false ? "inactive" : ""}>
                    <td className="cb-col-name"><strong>{c.nome}</strong><small>CPF {c.cpf}</small></td>
                    <td data-label="E-mail" className="cb-col-email">{c.email}</td>
                    <td data-label="COD"><span className="cb-cod">{c.codigo || "—"}</span></td>
                    <td data-label="Status" className="cb-col-status">
                      <span className={`ct-badge ${c.ativo === false ? "gray" : "green"} cb-badge`}>{c.ativo === false ? "Inativo" : "Ativo"}</span>
                    </td>
                    {isAdmin && (
                      <td className="cb-col-action">
                        <RowMenu contract={c} actions={actionsFor(c)} label={`Ações do colaborador ${c.nome}`} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <footer className="cb-card-foot">
            {filtered.length === collabs.length
              ? `Mostrando ${collabs.length} ${collabs.length === 1 ? "colaborador" : "colaboradores"}`
              : `Mostrando ${filtered.length} de ${collabs.length} colaboradores`}
          </footer>
        )}
      </section>

      {showForm && (
        <CollaboratorForm editing={editing} form={form} setForm={setForm} saving={saving} error={formError}
          closing={formClosing} onClose={closeForm} onSubmit={handleSubmit} />
      )}

      {deleteTarget && (
        <div className="contract-modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && !deleting && setDeleteTarget(null)}>
          <div className="contract-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="cb-delete-title">
            <div className="contract-delete-icon"><IconTrash /></div>
            <h2 id="cb-delete-title">Excluir este colaborador?</h2>
            <p>
              <strong>{deleteTarget.nome}</strong> será removido permanentemente. Processos e contratos que já o usam continuam com o nome salvo.
              Se for apenas um afastamento, prefira <strong>inativar</strong>.
            </p>
            <div className="contract-delete-actions">
              <button type="button" className="btn-cancel-lg" onClick={() => setDeleteTarget(null)} disabled={deleting} autoFocus>Cancelar</button>
              <button type="button" className="btn-danger" onClick={() => handleDelete()} disabled={deleting}>{deleting ? "Excluindo..." : "Excluir colaborador"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
