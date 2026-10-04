import { useState, useEffect, useCallback, useRef } from "react";
import { IconTrash, IconEdit, IconClose, IconPlus } from "../icons";
import { authFetch } from "../authFetch";
import { DEFAULT_SETTINGS, useAppSettings } from "../appSettings";
import "./AdminPage.css";
import ModelsManager from "./ModelsManager";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";

// ── Seção Usuários ────────────────────────────────────────────────────────────

function UsersSection({ currentUserId, onUnauthorized, onSelfDemoted }) {
  const { settings: { confirmBeforeDelete: confirmDelete } } = useAppSettings();
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState("");

  // Estados para criação de novo usuário
  const [showModal, setShowModal]     = useState(false);
  const [formUsername, setFormUsername] = useState("");
  const [formRole, setFormRole]         = useState("viewer");
  const [formErr, setFormErr]           = useState("");
  const [formLoading, setFormLoading]   = useState(false);
  const [createdCredential, setCreatedCredential] = useState(null);
  const [resetUser, setResetUser]       = useState(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");
  const [resetErr, setResetErr]         = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  const load = useCallback(() => {
    setErr(""); setLoading(true);
    authFetch(`${API_URL}/api/admin/users`)
      .then(r => {
        if (r.status === 401) throw new Error("401");
        if (r.status === 403) { setErr("Sem permissão para acessar o painel."); setUsers([]); return null; }
        if (!r.ok) throw new Error("fail");
        return r.json();
      })
      .then(data => { if (data) setUsers(data); })
      .catch(e => {
        if (e.message === "401") onUnauthorized();
        else if (e.message !== "fail") setErr("Não foi possível carregar a lista.");
      })
      .finally(() => setLoading(false));
  }, [onUnauthorized]);

  useEffect(() => { load(); }, [load]);

  const patchRole = (id, role) => {
    authFetch(`${API_URL}/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    })
      .then(r => r.json().then(data => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) { setErr(data.error || "Falha ao atualizar"); load(); return; }
        if (id === currentUserId && role !== "admin") { onSelfDemoted(); return; }
        load();
      })
      .catch(() => { setErr("Erro de conexão"); load(); });
  };

  const deleteUser = (id) => {
    if (confirmDelete && !window.confirm("Remover este usuário permanentemente?")) return;
    authFetch(`${API_URL}/api/admin/users/${id}`, { method: "DELETE" })
      .then(r => r.json().then(data => ({ ok: r.ok, data })))
      .then(({ ok, data }) => { if (!ok) { setErr(data.error || "Falha ao remover"); return; } load(); })
      .catch(() => setErr("Erro de conexão"));
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setResetErr("");
    if (resetPassword.length < 8) {
      setResetErr("A senha deve conter no mínimo 8 caracteres");
      return;
    }
    if (!/[^a-zA-Z0-9]/.test(resetPassword)) {
      setResetErr("A senha deve conter pelo menos um caractere especial");
      return;
    }
    if (resetPassword !== resetPasswordConfirm) {
      setResetErr("As senhas não coincidem");
      return;
    }
    setResetLoading(true);
    try {
      const res = await authFetch(`${API_URL}/api/admin/users/${resetUser.id}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: resetPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResetErr(data.error || "Falha ao redefinir senha");
        return;
      }
      setResetUser(null);
      setResetPassword("");
      setResetPasswordConfirm("");
    } catch {
      setResetErr("Erro de conexão");
    } finally {
      setResetLoading(false);
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setFormErr("");
    if (!formUsername.trim()) {
      setFormErr("O nome de usuário é obrigatório");
      return;
    }
    setFormLoading(true);
    try {
      const res = await authFetch(`${API_URL}/api/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: formUsername.trim(), role: formRole })
      });
      const data = await res.json();
      if (!res.ok) {
        setFormErr(data.error || "Falha ao criar usuário");
        return;
      }
      setCreatedCredential({ username: data.username, temporaryPassword: data.temporaryPassword });
      setFormUsername("");
      setFormRole("viewer");
      load();
    } catch {
      setFormErr("Erro de conexão");
    } finally {
      setFormLoading(false);
    }
  };

  const fmtDate    = d => { try { return new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); } catch { return "—"; } };
  const adminCount = users.filter(u => u.role === "admin").length;

  return (
    <div className="admin-section">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <h2 className="admin-section-title" style={{ marginBottom: 0 }}>Usuários</h2>
        <button className="btn-primary" onClick={() => { setShowModal(true); setFormUsername(""); setFormRole("viewer"); setFormErr(""); setCreatedCredential(null); }} style={{ gap: 5 }}>
          <IconPlus /> Adicionar Usuário
        </button>
      </div>
      <p className="admin-lead">Gerencie contas: papel (visualizar, editor ou administrador) e exclusão de cadastros.</p>
      {err && <div className="profile-err admin-alert">{err}</div>}
      {loading ? (
        <div className="empty-board admin-empty" style={{ padding: "36px 20px" }}>
          <h2>Carregando usuários</h2>
          <p>Estamos buscando as contas e permissões para atualizar a tabela.</p>
          <div className="admin-muted">Isso leva só um instante.</div>
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Usuário</th><th>Papel</th><th>Cadastro</th><th /></tr></thead>
            <tbody>
              {users.map(u => {
                const onlyAdmin = u.role === "admin" && adminCount <= 1;
                return (
                  <tr key={u.id}>
                    <td className="admin-td-user">
                      {u.username}{u.id === currentUserId && <span className="admin-you"> (você)</span>}
                    </td>
                    <td>
                      <select className="admin-select doc-input" value={u.role}
                        onChange={e => patchRole(u.id, e.target.value)} disabled={onlyAdmin}
                        title={onlyAdmin ? "É necessário haver outro administrador antes de rebaixar este perfil" : ""}>
                        <option value="viewer">Visualizar</option>
                        <option value="editor">Editor</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </td>
                    <td className="admin-muted">{fmtDate(u.created_at)}</td>
                    <td className="admin-td-actions">
                      <button type="button" className="icon-btn" title="Redefinir senha"
                        onClick={() => { setResetUser(u); setResetPassword(""); setResetPasswordConfirm(""); setResetErr(""); }}>
                        <IconEdit />
                      </button>
                      <button type="button" className="icon-btn danger" title="Remover usuário"
                        disabled={u.id === currentUserId} onClick={() => deleteUser(u.id)}>
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

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal sm-modal">
            <div className="modal-header">
              <h2>Novo Usuário</h2>
              <button type="button" className="icon-btn" onClick={() => setShowModal(false)} aria-label="Fechar"><IconClose /></button>
            </div>
            <form className="modal-body col" onSubmit={handleAddSubmit}>
              {createdCredential ? (
                <>
                  <div className="perfil-success" style={{ display: "block", lineHeight: 1.6 }}>
                    <strong>Usuário criado.</strong><br />
                    Usuário: <code>{createdCredential.username}</code><br />
                    Senha temporária: <code>{createdCredential.temporaryPassword}</code>
                  </div>
                  <p className="admin-muted">Copie e envie essa senha por um canal seguro. Ela não será exibida novamente e deverá ser trocada no primeiro acesso.</p>
                  <div className="modal-footer profile-modal-footer">
                    <button type="button" className="btn-confirm" onClick={() => setShowModal(false)}>Concluir</button>
                  </div>
                </>
              ) : (
                <>
              <label className="profile-form-label">Nome de Usuário (Nick) *</label>
              <input className="doc-input" type="text" value={formUsername} onChange={e => setFormUsername(e.target.value)} required placeholder="Ex: joao_silva" autoFocus />
              
              <label className="profile-form-label" style={{ marginTop: 12 }}>Papel *</label>
              <select className="doc-input" value={formRole} onChange={e => setFormRole(e.target.value)} required>
                <option value="viewer">Visualizar</option>
                <option value="editor">Editor</option>
                <option value="admin">Administrador</option>
              </select>
              
              {formErr && <div className="profile-err">{formErr}</div>}
              <div className="modal-footer profile-modal-footer">
                <button type="button" className="btn-cancel-lg" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn-confirm" disabled={formLoading} style={{ padding: "6px 18px" }}>
                  {formLoading ? "Criando..." : "Adicionar"}
                </button>
              </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}

      {resetUser && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setResetUser(null)}>
          <div className="modal sm-modal">
            <div className="modal-header">
              <h2>Emitir senha temporária</h2>
              <button type="button" className="icon-btn" onClick={() => setResetUser(null)} aria-label="Fechar"><IconClose /></button>
            </div>
            <form className="modal-body col" onSubmit={handleResetPassword}>
              <p className="admin-muted" style={{ lineHeight: 1.5 }}>Defina uma senha temporária para <strong>{resetUser.username}</strong>. O usuário será obrigado a trocá-la no próximo acesso.</p>
              <label className="profile-form-label">Senha temporária *</label>
              <input className="doc-input" type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)} required autoFocus />
              <label className="profile-form-label" style={{ marginTop: 12 }}>Confirmar senha temporária *</label>
              <input className="doc-input" type="password" value={resetPasswordConfirm} onChange={e => setResetPasswordConfirm(e.target.value)} required />
              <p className="admin-muted" style={{ fontSize: "0.75rem", lineHeight: 1.4 }}>Use no mínimo 8 caracteres, incluindo um caractere especial.</p>
              {resetErr && <div className="profile-err">{resetErr}</div>}
              <div className="modal-footer profile-modal-footer">
                <button type="button" className="btn-cancel-lg" onClick={() => setResetUser(null)}>Cancelar</button>
                <button type="submit" className="btn-confirm" disabled={resetLoading} style={{ padding: "6px 18px" }}>
                  {resetLoading ? "Salvando..." : "Emitir senha temporária"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Listas simples de nomes (Setores, Modalidades de contrato) ────────────────

function NamedListSection({ items, onItemsChange, endpoint, text }) {
  const { settings: { confirmBeforeDelete: confirmDelete } } = useAppSettings();
  const [newName, setNewName]       = useState("");
  const [err, setErr]               = useState("");
  const [editingId, setEditingId]   = useState(null);
  const [editingName, setEditingName] = useState("");
  const [loading, setLoading]       = useState(false);
  const editInputRef = useRef();

  useEffect(() => {
    if (editingId !== null) editInputRef.current?.focus();
  }, [editingId]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setErr(""); setLoading(true);
    try {
      const res  = await authFetch(`${API_URL}${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Falha ao criar"); return; }
      onItemsChange(data);
      setNewName("");
    } catch { setErr("Erro de conexão"); } finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (confirmDelete && !window.confirm(text.confirmDelete)) return;
    setErr("");
    try {
      const res  = await authFetch(`${API_URL}${endpoint}/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Falha ao remover"); return; }
      onItemsChange(data);
    } catch { setErr("Erro de conexão"); }
  };

  const startEdit = (sector) => {
    setEditingId(sector.id);
    setEditingName(sector.name);
  };

  const handleSaveEdit = async () => {
    const name = editingName.trim();
    if (!name) { setEditingId(null); return; }
    setErr("");
    try {
      const res  = await authFetch(`${API_URL}${endpoint}/${editingId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Falha ao atualizar"); return; }
      onItemsChange(data);
      setEditingId(null);
    } catch { setErr("Erro de conexão"); }
  };

  const cancelEdit = () => { setEditingId(null); setEditingName(""); };

  return (
    <div className="admin-section">
      <h2 className="admin-section-title">{text.title}</h2>
      <p className="admin-lead">{text.lead}</p>
      {err && <div className="profile-err admin-alert">{err}</div>}

      {items.length === 0 ? (
        <div className="empty-board" style={{ padding: "28px 0" }}>
          <h2>{text.emptyTitle}</h2>
          <p>{text.emptyHint}</p>
        </div>
      ) : (
        <div className="admin-table-wrap" style={{ marginBottom: 16 }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: "100%" }}>{text.column}</th>
                <th style={{ whiteSpace: "nowrap" }} />
              </tr>
            </thead>
            <tbody>
              {items.map(s => (
                <tr key={s.id}>
                  <td className="admin-td-user" style={{ width: "100%" }}>
                    {editingId === s.id ? (
                      <input
                        ref={editInputRef}
                        className="doc-input"
                        style={{ padding: "5px 8px", fontSize: "0.85rem", width: "100%" }}
                        value={editingName}
                        onChange={e => setEditingName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleSaveEdit(); if (e.key === "Escape") cancelEdit(); }}
                      />
                    ) : (
                      s.name
                    )}
                  </td>
                  <td className="admin-td-actions" style={{ whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      {editingId === s.id ? (
                        <>
                          <button type="button" className="btn-confirm" style={{ padding: "4px 10px", fontSize: "0.78rem" }} onClick={handleSaveEdit}>Salvar</button>
                          <button type="button" className="icon-btn" onClick={cancelEdit}><IconClose /></button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="icon-btn" title="Editar" onClick={() => startEdit(s)}><IconEdit /></button>
                          <button type="button" className="icon-btn danger" title="Remover" onClick={() => handleDelete(s.id)}><IconTrash /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="admin-add-row">
        <input
          className="doc-input"
          placeholder={text.placeholder}
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleAdd()}
          style={{ flex: 1 }}
        />
        <button className="btn-primary" onClick={handleAdd} disabled={!newName.trim() || loading}
          style={{ gap: 5, whiteSpace: "nowrap" }}>
          <IconPlus /> Adicionar
        </button>
      </div>
    </div>
  );
}

const SECTOR_TEXT = {
  title: "Setores / Órgãos",
  lead: "Defina os setores disponíveis para seleção ao criar um processo.",
  column: "Nome do setor",
  placeholder: "Nome do novo setor...",
  emptyTitle: "Nenhum setor cadastrado",
  emptyHint: "Adicione um setor para que novos processos possam ser classificados corretamente.",
  confirmDelete: "Remover este setor?",
};

function SetoresSection({ sectors, onSectorsChange }) {
  return <NamedListSection items={sectors} onItemsChange={onSectorsChange} endpoint="/api/sectors" text={SECTOR_TEXT} />;
}

const MODALITY_TEXT = {
  title: "Modalidades de contrato",
  lead: "Defina as modalidades disponíveis ao cadastrar um contrato. São independentes dos modelos de processo.",
  column: "Modalidade",
  placeholder: "Nome da nova modalidade...",
  emptyTitle: "Nenhuma modalidade cadastrada",
  emptyHint: "Adicione modalidades (ex.: Pregão Eletrônico) para classificar os contratos.",
  confirmDelete: "Remover esta modalidade? Contratos que já a usam continuam com o nome salvo.",
};

function ModalidadesSection({ onUnauthorized }) {
  const [items, setItems] = useState([]);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    authFetch(`${API_URL}/api/contract-modalities`)
      .then(res => {
        if (res.status === 401) { onUnauthorized?.(); return null; }
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then(data => { if (Array.isArray(data)) setItems(data); })
      .catch(() => setLoadError("Não foi possível carregar as modalidades."));
  }, [onUnauthorized]);
  return (
    <>
      {loadError && <div className="profile-err admin-alert">{loadError}</div>}
      <NamedListSection items={items} onItemsChange={setItems} endpoint="/api/contract-modalities" text={MODALITY_TEXT} />
    </>
  );
}

// ── Modelos ───────────────────────────────────────────────────────────────────

const PERMISSIONS = [
  { role: "admin", label: "Administrador", access: ["total", "total", "total", "total"] },
  // Conforme o backend: o editor cria, altera e exclui processos e contratos; colaboradores e admin só o administrador.
  { role: "editor", label: "Editor", access: ["total", "total", "read", "none"] },
  { role: "viewer", label: "Visualizador", access: ["read", "read", "read", "none"] },
];
const ACCESS_LABEL = { total: "Total", edit: "Editar", read: "Leitura", none: "—" };
const SESSION_OPTIONS = [15, 30, 60, 120];
const LOCKOUT_ATTEMPTS = [3, 5, 10];
const LOCKOUT_MINUTES = [5, 15, 30, 60];
const PASSWORD_DAYS = [30, 60, 90, 180];
const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS);
const DRAWER_EXIT_MS = 220;

function Switch({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`adm-switch ${checked ? "on" : ""}`} onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

// Painel lateral (mesmo do detalhe de contratos) para as gestões abertas pelos cards.
function AdminDrawer({ title, subtitle, onClose, children }) {
  const [closing, setClosing] = useState(false);
  const close = useCallback(() => { setClosing(true); setTimeout(onClose, DRAWER_EXIT_MS); }, [onClose]);
  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape" && !document.querySelector(".modal-overlay")) close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);
  return (
    <div className={`ct-detail-overlay ${closing ? "closing" : ""}`} onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <aside className="ct-detail adm-drawer" role="dialog" aria-modal="true" aria-labelledby="adm-drawer-title">
        <header className="ct-detail-header">
          <div>
            <span className="ct-detail-number">Administração</span>
            <h2 id="adm-drawer-title">{title}</h2>
            {subtitle && <p className="adm-drawer-subtitle">{subtitle}</p>}
          </div>
          <button type="button" className="ct-detail-close" onClick={close} aria-label="Fechar"><IconClose /></button>
        </header>
        <div className="ct-detail-body adm-drawer-body">{children}</div>
      </aside>
    </div>
  );
}

function SelectField({ label, value, options, format, disabled, onChange }) {
  return (
    <label className="ct-field adm-param">
      <span>{label}</span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))}>
        {options.map((option) => <option key={option} value={option}>{format(option)}</option>)}
      </select>
    </label>
  );
}

// Tela "Configuração de segurança" (aberta pelo card Segurança).
function SecurityView({ draft, setDraft, changed, saving, saveMessage, onSave, onBack }) {
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const kpis = [
    { tone: "blue", label: "Política de senha", value: "Forte", note: "Mínimo de 8 caracteres" },
    { tone: "amber", label: "Tempo de sessão", value: draft.sessionTimeoutEnabled ? `${draft.sessionTimeoutMinutes} min` : "Sem limite", note: "Encerramento por inatividade" },
    { tone: "red", label: "Tentativas de login", value: draft.lockoutEnabled ? String(draft.lockoutAttempts) : "Sem bloqueio", note: "Antes do bloqueio temporário" },
    { tone: "green", label: "Validade da senha", value: draft.passwordExpiryEnabled ? `${draft.passwordExpiryDays} dias` : "Sem validade", note: "Troca periódica obrigatória" },
  ];
  const rules = [
    { key: "lockoutEnabled", title: "Bloqueio por tentativas inválidas", text: `Bloquear o login por ${draft.lockoutMinutes} minutos após ${draft.lockoutAttempts} tentativas sem sucesso` },
    { key: "sessionTimeoutEnabled", title: "Expiração de sessão", text: `Encerrar a sessão após ${draft.sessionTimeoutMinutes} minutos sem atividade` },
    { key: "confirmBeforeDelete", title: "Confirmação para ações críticas", text: "Pedir confirmação antes de excluir contratos, colaboradores, documentos e cadastros" },
    { key: "passwordExpiryEnabled", title: "Forçar troca periódica de senha", text: `Solicitar nova senha a cada ${draft.passwordExpiryDays} dias` },
  ];
  return (
    <div className="lk-contracts adm-page">
      <header className="ct-header">
        <div className="ct-header-text">
          <h1>Configuração de segurança</h1>
          <p>Defina regras de acesso, autenticação e proteção da conta</p>
        </div>
        <button type="button" className="ct-header-export adm-back" onClick={onBack}>‹ Voltar para Administração</button>
      </header>

      <section className="adm-sec-kpis" aria-label="Resumo de segurança">
        {kpis.map((kpi) => (
          <article className="adm-sec-kpi" key={kpi.label}>
            <span className={`adm-card-icon ${kpi.tone}`} aria-hidden="true"><i /></span>
            <div>
              <small>{kpi.label}</small>
              <strong>{kpi.value}</strong>
              <p>{kpi.note}</p>
            </div>
          </article>
        ))}
      </section>

      <div className="adm-grid">
        <section className="adm-panel" aria-labelledby="adm-rules-title">
          <header className="adm-panel-head">
            <div>
              <h2 id="adm-rules-title">Regras de segurança</h2>
              <p>Configure as políticas aplicadas aos usuários do sistema.</p>
            </div>
          </header>
          <ul className="adm-settings-list">
            {rules.map((rule) => (
              <li key={rule.key}>
                <div><strong>{rule.title}</strong><small>{rule.text}</small></div>
                <Switch checked={draft[rule.key]} onChange={set(rule.key)} label={rule.title} />
              </li>
            ))}
          </ul>
          <p className="adm-policy">Política atual: 8+ caracteres • 1 maiúscula • 1 número • 1 caractere especial</p>
        </section>

        <section className="adm-panel" aria-labelledby="adm-params-title">
          <header className="adm-panel-head">
            <div>
              <h2 id="adm-params-title">Parâmetros de acesso</h2>
              <p>Valores usados nas regras automáticas.</p>
            </div>
          </header>
          <div className="adm-params">
            <SelectField label="Tentativas antes do bloqueio" value={draft.lockoutAttempts} options={LOCKOUT_ATTEMPTS} format={(n) => `${n} tentativas`} disabled={!draft.lockoutEnabled} onChange={set("lockoutAttempts")} />
            <SelectField label="Duração do bloqueio" value={draft.lockoutMinutes} options={LOCKOUT_MINUTES} format={(n) => `${n} minutos`} disabled={!draft.lockoutEnabled} onChange={set("lockoutMinutes")} />
            <SelectField label="Tempo máximo de sessão (sem atividade)" value={draft.sessionTimeoutMinutes} options={SESSION_OPTIONS} format={(n) => `${n} minutos`} disabled={!draft.sessionTimeoutEnabled} onChange={set("sessionTimeoutMinutes")} />
            <SelectField label="Validade da senha" value={draft.passwordExpiryDays} options={PASSWORD_DAYS} format={(n) => `${n} dias`} disabled={!draft.passwordExpiryEnabled} onChange={set("passwordExpiryDays")} />
          </div>
          <footer className="adm-settings-foot">
            {saveMessage && <p className={`adm-save-msg ${saveMessage.type}`} role="status">{saveMessage.text}</p>}
            <button type="button" className="ct-new-button adm-save" onClick={onSave} disabled={!changed || saving}>
              {saving ? "Salvando..." : changed ? "Salvar configurações" : "Configurações salvas"}
            </button>
          </footer>
        </section>
      </div>
    </div>
  );
}

export default function AdminPage({ currentUserId, onUnauthorized, onSelfDemoted, sectors, onSectorsChange, templates, saveTemplates, onOpenMenu }) {
  const { settings, setSettings } = useAppSettings();
  const [drawer, setDrawer] = useState(null);
  const [users, setUsers] = useState([]);
  const [draft, setDraft] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);

  useEffect(() => { setDraft(settings); }, [settings]);

  const loadUsers = useCallback(() => {
    authFetch(`${API_URL}/api/admin/users`)
      .then((res) => {
        if (res.status === 401) { onUnauthorized(); return null; }
        return res.ok ? res.json() : null;
      })
      .then((data) => { if (Array.isArray(data)) setUsers(data); })
      .catch(() => {});
  }, [onUnauthorized]);
  useEffect(() => { loadUsers(); }, [loadUsers]);

  const roleCount = (role) => users.filter((user) => user.role === role).length;
  const [view, setView] = useState("main");
  const changed = SETTING_KEYS.some((key) => draft[key] !== settings[key]);

  const saveSettings = async () => {
    setSaving(true); setSaveMessage(null);
    try {
      const res = await authFetch(`${API_URL}/api/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(SETTING_KEYS.map((key) => [key, draft[key]]))),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar.");
      setSettings((current) => ({ ...current, ...data }));
      setSaveMessage({ type: "ok", text: "Configurações salvas." });
    } catch (saveError) {
      setSaveMessage({ type: "error", text: saveError.message });
    } finally {
      setSaving(false);
    }
  };

  const goToSecurity = () => { setSaveMessage(null); setView("security"); window.scrollTo({ top: 0 }); };

  const modalitiesDrawer = drawer === "modalities" && (
    <AdminDrawer title="Modalidades de contrato" subtitle="Modalidades disponíveis ao cadastrar um contrato." onClose={() => setDrawer(null)}>
      <ModalidadesSection onUnauthorized={onUnauthorized} />
    </AdminDrawer>
  );

  if (view === "models") {
    return (
      <ModelsManager templates={templates} onSave={saveTemplates} onBack={() => setView("main")} confirmBeforeDelete={settings.confirmBeforeDelete} />
    );
  }

  if (view === "security") {
    return (
      <SecurityView draft={draft} setDraft={setDraft} changed={changed} saving={saving} saveMessage={saveMessage}
        onSave={saveSettings} onBack={() => { setSaveMessage(null); setDraft(settings); setView("main"); }} />
    );
  }

  const cards = [
    { key: "users", tone: "blue", title: "Perfis de acesso", text: "Usuários e o nível de acesso de cada um.", action: "Gerenciar usuários", onClick: () => setDrawer("users") },
    { key: "sectors", tone: "purple", title: "Setores", text: "Organize setores responsáveis.", action: "Gerenciar setores", onClick: () => setDrawer("sectors") },
    { key: "security", tone: "green", title: "Segurança", text: "Senha, sessões, bloqueio e autenticação.", action: "Configurar segurança", onClick: goToSecurity },
    { key: "models", tone: "lilac", title: "Modelos", text: "Tipos de processo, fases e documentos padrão.", action: "Gerenciar modelos", onClick: () => { setView("models"); window.scrollTo({ top: 0 }); } },
    { key: "modalities", tone: "amber", title: "Modalidades de contrato", text: "Dispensa, Pregão, Leilão e outras modalidades.", action: "Gerenciar modalidades", onClick: () => setDrawer("modalities") },
  ];

  return (
    // Reaproveita o visual das páginas novas (lk-contracts): cabeçalho, painel lateral e modais.
    <div className="lk-contracts adm-page">
      <header className="ct-header">
        <button className="lk-menu" aria-label="Abrir navegação" onClick={onOpenMenu}>☰</button>
        <div className="ct-header-text">
          <h1>Administração</h1>
          <p>Gerencie acessos, permissões e configurações administrativas do sistema</p>
        </div>
      </header>

      <section className="adm-cards" aria-label="Áreas de administração">
        {cards.map((card) => (
          <article className="adm-card" key={card.key}>
            <div className="adm-card-head">
              <span className={`adm-card-icon ${card.tone}`} aria-hidden="true"><i /></span>
              <h2>{card.title}</h2>
            </div>
            <p>{card.text}</p>
            <button type="button" className="adm-card-action" onClick={card.onClick}>{card.action}</button>
          </article>
        ))}
      </section>

      <div className="adm-grid">
        <section className="adm-panel adm-permissions" aria-labelledby="adm-perm-title">
          <header className="adm-panel-head">
            <div>
              <h2 id="adm-perm-title">Permissões de acesso</h2>
              <p>O que cada perfil pode visualizar e alterar.</p>
            </div>
            <button type="button" className="ct-new-button adm-panel-btn" onClick={() => setDrawer("users")}><IconPlus /> Novo usuário</button>
          </header>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr><th>Perfil</th><th>Processos</th><th>Contratos</th><th>Colaboradores</th><th>Admin</th></tr>
              </thead>
              <tbody>
                {PERMISSIONS.map((perm) => (
                  <tr key={perm.role}>
                    <td className="adm-role">
                      <strong>{perm.label}</strong>
                      <small>{roleCount(perm.role)} {roleCount(perm.role) === 1 ? "usuário" : "usuários"}</small>
                    </td>
                    {perm.access.map((level, i) => (
                      <td key={i} data-label={["Processos", "Contratos", "Colaboradores", "Admin"][i]}>
                        <span className={`adm-access ${level}`}>{ACCESS_LABEL[level]}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="adm-legend">
            <span className="adm-access total">Total</span> criar, alterar e excluir ·
            <span className="adm-access read">Leitura</span> só visualizar ·
            <span className="adm-access none">—</span> sem acesso
          </p>
        </section>

        <section className="adm-panel adm-settings" aria-labelledby="adm-settings-title">
          <header className="adm-panel-head">
            <div>
              <h2 id="adm-settings-title">Configurações administrativas</h2>
              <p>Ajustes gerais que afetam todo o sistema.</p>
            </div>
          </header>
          <ul className="adm-settings-list">
            <li>
              <div>
                <strong>Sessão automática</strong>
                <small>
                  Encerrar após{" "}
                  <select value={draft.sessionTimeoutMinutes} disabled={!draft.sessionTimeoutEnabled}
                    onChange={(event) => setDraft((d) => ({ ...d, sessionTimeoutMinutes: Number(event.target.value) }))} aria-label="Minutos sem atividade">
                    {SESSION_OPTIONS.map((minutes) => <option key={minutes} value={minutes}>{minutes} minutos</option>)}
                  </select>{" "}
                  sem atividade
                </small>
              </div>
              <Switch checked={draft.sessionTimeoutEnabled} onChange={(value) => setDraft((d) => ({ ...d, sessionTimeoutEnabled: value }))} label="Sessão automática" />
            </li>
            <li>
              <div>
                <strong>Confirmação ao excluir</strong>
                <small>Pedir confirmação antes de excluir contratos, colaboradores, documentos e cadastros</small>
              </div>
              <Switch checked={draft.confirmBeforeDelete} onChange={(value) => setDraft((d) => ({ ...d, confirmBeforeDelete: value }))} label="Confirmação ao excluir" />
            </li>
          </ul>
          <footer className="adm-settings-foot">
            {saveMessage && <p className={`adm-save-msg ${saveMessage.type}`} role="status">{saveMessage.text}</p>}
            <button type="button" className="ct-new-button adm-save" onClick={saveSettings} disabled={!changed || saving}>
              {saving ? "Salvando..." : changed ? "Salvar configurações" : "Configurações salvas"}
            </button>
          </footer>
        </section>
      </div>

      {drawer === "users" && (
        <AdminDrawer title="Usuários e perfis" subtitle="Crie usuários, defina o perfil de acesso e redefina senhas." onClose={() => { setDrawer(null); loadUsers(); }}>
          <UsersSection currentUserId={currentUserId} onUnauthorized={onUnauthorized} onSelfDemoted={onSelfDemoted} />
        </AdminDrawer>
      )}
      {drawer === "sectors" && (
        <AdminDrawer title="Setores" subtitle="Setores disponíveis para classificar os processos." onClose={() => setDrawer(null)}>
          <SetoresSection sectors={sectors} onSectorsChange={onSectorsChange} />
        </AdminDrawer>
      )}
      {modalitiesDrawer}
    </div>
  );
}
