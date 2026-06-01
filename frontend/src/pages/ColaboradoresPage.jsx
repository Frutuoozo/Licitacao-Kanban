import { useState, useEffect, useCallback } from "react";
import { IconTrash, IconEdit, IconClose, IconPlus, IconUsers, IconCopy, IconCheck } from "../icons";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  const handle = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  };
  return (
    <button
      type="button"
      className={`icon-btn colab-copy-btn${copied ? " colab-copy-done" : ""}`}
      title={copied ? "Copiado!" : "Copiar"}
      onClick={handle}
    >
      {copied ? <IconCheck /> : <IconCopy />}
    </button>
  );
}

function formatCpf(val) {
  const d = val.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}

export default function ColaboradoresPage({ token, isAdmin, onUnauthorized }) {
  const [collabs, setCollabs]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [err, setErr]                 = useState("");
  const [showModal, setShowModal]     = useState(false);
  const [editing, setEditing]         = useState(null);
  const [formNome, setFormNome]       = useState("");
  const [formCpf, setFormCpf]         = useState("");
  const [formEmail, setFormEmail]     = useState("");
  const [formErr, setFormErr]         = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [search, setSearch]           = useState("");

  const load = useCallback(() => {
    setErr(""); setLoading(true);
    fetch(`${API_URL}/api/collaborators`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        if (r.status === 401) throw new Error("401");
        if (!r.ok) throw new Error("fail");
        return r.json();
      })
      .then(data => setCollabs(data))
      .catch(e => {
        if (e.message === "401") onUnauthorized();
        else setErr("Não foi possível carregar os colaboradores.");
      })
      .finally(() => setLoading(false));
  }, [token, onUnauthorized]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditing(null); setFormNome(""); setFormCpf(""); setFormEmail(""); setFormErr(""); setShowModal(true);
  };
  const openEdit = (c) => {
    setEditing(c); setFormNome(c.nome); setFormCpf(c.cpf); setFormEmail(c.email); setFormErr(""); setShowModal(true);
  };
  const closeModal = () => { setShowModal(false); setEditing(null); setFormErr(""); };

  const handleSubmit = async (e) => {
    e.preventDefault(); setFormErr(""); setFormLoading(true);
    const body = { nome: formNome.trim(), cpf: formCpf.trim(), email: formEmail.trim() };
    try {
      const url    = editing
        ? `${API_URL}/api/admin/collaborators/${editing.id}`
        : `${API_URL}/api/admin/collaborators`;
      const method = editing ? "PUT" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setFormErr(data.error || "Falha ao salvar"); return; }
      closeModal(); load();
    } catch { setFormErr("Erro de conexão"); } finally { setFormLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Remover este colaborador permanentemente?")) return;
    setErr("");
    try {
      const res  = await fetch(`${API_URL}/api/admin/collaborators/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Falha ao remover"); return; }
      load();
    } catch { setErr("Erro de conexão"); }
  };

  const filtered = collabs.filter(c => {
    const q = search.toLowerCase();
    return !q || c.nome.toLowerCase().includes(q) || c.cpf.includes(q) || c.email.toLowerCase().includes(q);
  });

  return (
    <div className="colab-page">
      <div className="colab-inner">
        <div className="colab-header-row">
          <div>
            <h1 className="admin-title" style={{ marginBottom: 4 }}>Colaboradores</h1>
            <p className="admin-lead" style={{ marginBottom: 0 }}>
              Informações de colaboradores cadastradas pelo administrador.
            </p>
          </div>
          {isAdmin && (
            <button className="btn-primary" onClick={openAdd} style={{ flexShrink: 0 }}>
              <IconPlus /> Adicionar
            </button>
          )}
        </div>

        {err && <div className="profile-err" style={{ marginBottom: 12 }}>{err}</div>}

        <div className="colab-search-wrap">
          <svg className="colab-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            className="colab-search"
            type="text"
            placeholder="Buscar por nome, CPF ou e-mail..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="admin-muted" style={{ padding: "28px 0", textAlign: "center" }}>Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="colab-empty">
            <IconUsers />
            <p>{search ? "Nenhum resultado encontrado." : "Nenhum colaborador cadastrado ainda."}</p>
            {isAdmin && !search && (
              <button className="btn-primary" onClick={openAdd}><IconPlus /> Adicionar primeiro</button>
            )}
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>CPF</th>
                  <th className="collab-col-email">E-mail</th>
                  {isAdmin && <th />}
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id}>
                    <td className="admin-td-user">
                      <div className="colab-cell">
                        <span>{c.nome}</span>
                        <CopyBtn text={c.nome} />
                      </div>
                    </td>
                    <td>
                      <div className="colab-cell">
                        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.82rem", color: "var(--muted)" }}>{c.cpf}</span>
                        <CopyBtn text={c.cpf} />
                      </div>
                    </td>
                    <td className="collab-col-email">
                      <div className="colab-cell">
                        <span className="admin-muted">{c.email}</span>
                        <CopyBtn text={c.email} />
                      </div>
                    </td>
                    {isAdmin && (
                      <td className="admin-td-actions">
                        <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                          <button type="button" className="icon-btn" title="Editar" onClick={() => openEdit(c)}><IconEdit /></button>
                          <button type="button" className="icon-btn danger" title="Remover" onClick={() => handleDelete(c.id)}><IconTrash /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="modal sm-modal">
            <div className="modal-header">
              <h2>{editing ? "Editar Colaborador" : "Novo Colaborador"}</h2>
              <button type="button" className="icon-btn" onClick={closeModal} aria-label="Fechar"><IconClose /></button>
            </div>
            <form className="modal-body col" onSubmit={handleSubmit}>
              <label className="profile-form-label">Nome *</label>
              <input
                className="doc-input"
                type="text"
                value={formNome}
                onChange={e => setFormNome(e.target.value)}
                required
                placeholder="Nome completo"
                autoFocus
              />
              <label className="profile-form-label">CPF *</label>
              <input
                className="doc-input"
                type="text"
                value={formCpf}
                onChange={e => setFormCpf(formatCpf(e.target.value))}
                required
                placeholder="000.000.000-00"
                inputMode="numeric"
              />
              <label className="profile-form-label">E-mail *</label>
              <input
                className="doc-input"
                type="email"
                value={formEmail}
                onChange={e => setFormEmail(e.target.value)}
                required
                placeholder="email@exemplo.com"
              />
              {formErr && <div className="profile-err">{formErr}</div>}
              <div className="modal-footer profile-modal-footer">
                <button type="button" className="btn-cancel-lg" onClick={closeModal}>Cancelar</button>
                <button type="submit" className="btn-confirm" disabled={formLoading} style={{ padding: "6px 18px" }}>
                  {formLoading ? "Salvando..." : (editing ? "Salvar alterações" : "Adicionar")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
