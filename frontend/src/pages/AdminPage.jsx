import { useState, useEffect, useCallback, useRef } from "react";
import { IconTrash, IconEdit, IconClose, IconPlus, IconUsers, IconShield, IconGrid, IconClipboard, IconFileText, IconCheck, IconEye, IconLock, IconLogout } from "../icons";
import { authFetch, API_URL } from "../authFetch";
import { formatDateTime } from "../preferences";
import { DEFAULT_SETTINGS, useAppSettings } from "../appSettings";
import "./AdminPage.css";
import ModelsManager from "./ModelsManager";
import { orderedTemplateTypeNames } from "../utils";
import { attentionItems } from "../adminAttention";
import SelectMenu from "../components/SelectMenu";
import { Toast, useToast } from "../components/Toast";


// ── Seção Usuários ────────────────────────────────────────────────────────────

// intent (ações rápidas do painel): { type: "new" } abre o cadastro de usuário; { type: "reset", userId } abre a senha temporária.
function UsersSection({ currentUserId, onUnauthorized, onSelfDemoted, intent }) {
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
  const intentDone = useRef(false);
  useEffect(() => {
    if (!intent || intentDone.current) return;
    if (intent.type === "new") { intentDone.current = true; setShowModal(true); return; }
    const target = users.find((u) => u.id === intent.userId);
    if (target) { intentDone.current = true; setResetUser(target); setResetPassword(""); setResetPasswordConfirm(""); setResetErr(""); }
  }, [intent, users]);

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

  const fmtDate    = d => formatDateTime(d);
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
const ACCESS_LABEL = { total: "Total", edit: "Editar", read: "Leitura", none: "Sem acesso" };
const ACCESS_ICON = { total: <IconCheck />, edit: <IconEdit />, read: <IconEye /> };
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

// ── Painel: atividade de acesso e ações rápidas ──────────────────────────────

const EVENT_LABELS = {
  success: ["entrou", "ok"], first_access: ["primeiro acesso", "ok"], wrong_password: ["errou a senha", "warn"],
  locked: ["conta bloqueada", "bad"], password_changed: ["trocou a senha", "info"], sessions_revoked: ["encerrou outras sessões", "info"],
  unlocked: ["conta desbloqueada pelo admin", "info"], admin_sessions_revoked: ["sessões encerradas pelo admin", "info"],
};

// "agora", "há 12 min", "há 3 h", "ontem, 18:40" ou "12/11, 09:05".
function relativeTime(value, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const minutes = Math.round((now - date) / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 6 * 60) return `há ${Math.round(minutes / 60)} h`;
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return `hoje, ${time}`;
  if (date.toDateString() === yesterday.toDateString()) return `ontem, ${time}`;
  return `${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}, ${time}`;
}

// Escolha do usuário para "Senha temporária" e "Encerrar sessões" (ações rápidas do topo).
function UserActionModal({ mode, users, currentUserId, busy, error, onClose, onConfirm }) {
  const options = users.filter((u) => mode !== "revoke" || u.id !== currentUserId);
  const [userId, setUserId] = useState("");
  const revoke = mode === "revoke";
  return (
    <div className="contract-modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <form className="contract-delete-modal ct-close-modal adm-action-modal" role="dialog" aria-modal="true" aria-labelledby="adm-action-title"
        onSubmit={(event) => { event.preventDefault(); const user = options.find((u) => u.id === userId); if (user) onConfirm(user); }}>
        <div className={`contract-delete-icon ${revoke ? "" : "reopen"}`}>{revoke ? <IconLogout /> : <IconLock />}</div>
        <h2 id="adm-action-title">{revoke ? "Encerrar sessões de um usuário" : "Emitir senha temporária"}</h2>
        <p>{revoke
          ? "O usuário sai do sistema em todos os aparelhos e precisa entrar de novo. A senha continua a mesma."
          : "Escolha o usuário. Na próxima tela você define a senha temporária, que ele troca no próximo acesso."}</p>
        {error && <div className="contract-form-error">{error}</div>}
        <div className="ct-close-fields">
          <SelectMenu label="Usuário *" fieldClassName="contract-field" value={userId} onChange={setUserId} placeholder="Selecione o usuário"
            options={options.map((u) => ({ value: u.id, label: u.username }))} />
        </div>
        <div className="contract-delete-actions">
          <button type="button" className="btn-cancel-lg" onClick={onClose} disabled={busy}>Cancelar</button>
          <button type="submit" className={revoke ? "btn-danger" : "btn-confirm"} disabled={busy || !userId}>
            {busy ? "Aguarde..." : revoke ? "Encerrar sessões" : "Continuar"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function AdminPage({ currentUserId, onUnauthorized, onSelfDemoted, sectors, onSectorsChange, templates, saveTemplates, onOpenMenu, onNavigate }) {
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
  // Quantidade de modalidades, para o cartão (recarrega quando o painel de modalidades fecha).
  const [modalityCount, setModalityCount] = useState(null);
  const loadModalities = useCallback(() => {
    authFetch(`${API_URL}/api/contract-modalities`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (Array.isArray(data)) setModalityCount(data.length); })
      .catch(() => {});
  }, []);
  useEffect(() => { loadModalities(); }, [loadModalities]);

  // Dados do "Precisa de atenção" (contratos e colaboradores) e da atividade de acesso.
  const [contracts, setContracts] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [events, setEvents] = useState(null);
  const loadEvents = useCallback(() => {
    authFetch(`${API_URL}/api/admin/login-events?limit=10`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setEvents(Array.isArray(data) ? data : []))
      .catch(() => setEvents([]));
  }, []);
  useEffect(() => {
    loadEvents();
    authFetch(`${API_URL}/api/contracts`).then((res) => (res.ok ? res.json() : null)).then((data) => { if (Array.isArray(data)) setContracts(data); }).catch(() => {});
    authFetch(`${API_URL}/api/admin/collaborators`).then((res) => (res.ok ? res.json() : null)).then((data) => { if (Array.isArray(data)) setCollaborators(data); }).catch(() => {});
  }, [loadEvents]);

  const { toast, notify, closeToast } = useToast();
  const [usersIntent, setUsersIntent] = useState(null);
  const [actionModal, setActionModal] = useState(null); // "password" | "revoke"
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const openUsers = (intent = null) => { setUsersIntent(intent); setDrawer("users"); };
  const postUserAction = async (user, path) => {
    const res = await authFetch(`${API_URL}/api/admin/users/${user.id}/${path}`, { method: "POST" });
    if (res.status === 401) { onUnauthorized(); return false; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Não foi possível concluir.");
    return true;
  };
  const unlockUser = async (user) => {
    try {
      if (await postUserAction(user, "unlock")) { notify("ok", "Conta desbloqueada", user.username); loadUsers(); loadEvents(); }
    } catch (error) { notify("error", "Não foi possível desbloquear", error.message); }
  };
  const confirmAction = async (user) => {
    if (actionModal === "password") { setActionModal(null); openUsers({ type: "reset", userId: user.id }); return; }
    setActionBusy(true); setActionError("");
    try {
      if (await postUserAction(user, "revoke-sessions")) {
        setActionModal(null);
        notify("ok", "Sessões encerradas", `${user.username} precisa entrar de novo.`);
        loadEvents();
      }
    } catch (error) { setActionError(error.message); } finally { setActionBusy(false); }
  };

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
    <AdminDrawer title="Modalidades de contrato" subtitle="Modalidades disponíveis ao cadastrar um contrato." onClose={() => { setDrawer(null); loadModalities(); }}>
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

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const adminCount = roleCount("admin");
  const templateCount = orderedTemplateTypeNames(templates || {}).length;
  const openModels = () => { setView("models"); window.scrollTo({ top: 0 }); };
  // Cartões em dois grupos; cada um mostra um número que resume a área e é inteiro clicável.
  const groups = [
    { title: "Acesso e segurança", tiles: [
      { key: "users", tone: "blue", icon: <IconUsers />, title: "Usuários e perfis", text: "Quem acessa o sistema e o nível de acesso de cada um.",
        stat: users.length ? plural(users.length, "usuário", "usuários") : "—", note: users.length ? plural(adminCount, "administrador", "administradores") : "", onClick: () => setDrawer("users") },
      { key: "security", tone: "green", icon: <IconShield />, title: "Segurança", text: "Senha, sessões, bloqueio de login e troca periódica de senha.",
        stat: settings.lockoutEnabled ? `Bloqueio após ${settings.lockoutAttempts}` : "Sem bloqueio", note: settings.sessionTimeoutEnabled ? `Sessão de ${settings.sessionTimeoutMinutes} min` : "Sessão sem limite", onClick: goToSecurity },
    ] },
    { title: "Cadastros", tiles: [
      { key: "sectors", tone: "purple", icon: <IconGrid />, title: "Setores", text: "Setores responsáveis pelos processos.",
        stat: plural((sectors || []).length, "setor", "setores"), onClick: () => setDrawer("sectors") },
      { key: "models", tone: "lilac", icon: <IconClipboard />, title: "Modelos", text: "Tipos de processo, fases e documentos padrão.",
        stat: plural(templateCount, "modelo", "modelos"), onClick: openModels },
      { key: "modalities", tone: "amber", icon: <IconFileText />, title: "Modalidades", text: "Dispensa, Pregão, Leilão e outras modalidades de contrato.",
        stat: modalityCount === null ? "—" : plural(modalityCount, "modalidade", "modalidades"), onClick: () => setDrawer("modalities") },
    ] },
  ];

  const attention = attentionItems({ contracts, collaborators, users, settings, today: new Date() });
  const lastLoginByUser = new Map(users.map((u) => [u.id, u.lastLoginAt]));
  const dormantUsers = users.filter((u) => !u.firstAccess && (!u.lastLoginAt || (Date.now() - new Date(u.lastLoginAt)) / 86400000 >= 30));
  const runAttention = (item) => (item.action === "contracts" ? onNavigate?.("contratos") : openUsers());

  return (
    // Reaproveita o visual das páginas novas (lk-contracts): cabeçalho, painel lateral e modais.
    <div className="lk-contracts adm-page">
      <header className="ct-header adm-header">
        <button className="lk-menu" aria-label="Abrir navegação" onClick={onOpenMenu}>☰</button>
        <div className="ct-header-text">
          <h1>Administração</h1>
          <p>Gerencie acessos, cadastros e regras do sistema.</p>
        </div>
        {/* Ações rápidas. */}
        <div className="adm-quick">
          <button type="button" className="ct-header-export" onClick={() => { setActionError(""); setActionModal("password"); }}><IconLock /> Senha temporária</button>
          <button type="button" className="ct-header-export" onClick={() => { setActionError(""); setActionModal("revoke"); }}><IconLogout /> Encerrar sessões</button>
          <button type="button" className="ct-new-button" onClick={() => openUsers({ type: "new" })}><IconPlus /> Novo usuário</button>
        </div>
      </header>

      <div className="adm-groups">
        {groups.map((group) => (
          <section className="adm-group" key={group.title} aria-label={group.title}>
            <h2 className="adm-group-title">{group.title}</h2>
            <div className="adm-tiles" style={{ "--adm-cols": group.tiles.length }}>
              {group.tiles.map((tile) => (
                <button type="button" className={`adm-tile ${tile.tone}`} key={tile.key} onClick={tile.onClick}>
                  <span className="adm-tile-top">
                    <span className="adm-tile-icon" aria-hidden="true">{tile.icon}</span>
                    <svg className="adm-tile-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>
                  </span>
                  <strong className="adm-tile-title">{tile.title}</strong>
                  <span className="adm-tile-text">{tile.text}</span>
                  <span className="adm-tile-stat"><b>{tile.stat}</b>{tile.note && <small>{tile.note}</small>}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="adm-grid adm-grid-even">
        <section className="adm-panel adm-attention" aria-labelledby="adm-attention-title">
          <header className="adm-panel-head">
            <div>
              <h2 id="adm-attention-title">Precisa de atenção</h2>
              <p>Pendências de cadastro e de acesso, para resolver.</p>
            </div>
          </header>
          {attention.length === 0 ? (
            <p className="adm-all-good"><IconCheck /> Nada pendente. Está tudo em dia.</p>
          ) : (
            <ul className="adm-attention-list">
              {attention.map((item) => (
                <li key={item.key} className={item.action === "unlock" ? "is-alert" : ""}>
                  <div className="adm-attention-row">
                    <b>{item.count}</b>
                    <span>{item.label}</span>
                    {item.action !== "unlock" && <button type="button" className="adm-link" onClick={() => runAttention(item)}>Ver</button>}
                  </div>
                  {item.action === "unlock" && (
                    <ul className="adm-locked">
                      {item.users.map((u) => (
                        <li key={u.id}>
                          <span><strong>{u.username}</strong> · libera sozinha em {u.lockedMinutes} min</span>
                          <button type="button" className="adm-link" onClick={() => unlockUser(u)}>Desbloquear</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="adm-panel adm-activity" aria-labelledby="adm-activity-title">
          <header className="adm-panel-head">
            <div>
              <h2 id="adm-activity-title">Atividade de acesso</h2>
              <p>Últimos acessos e tentativas de todos os usuários.</p>
            </div>
          </header>
          {events === null ? <p className="adm-muted-line">Carregando…</p>
            : events.length === 0 ? <p className="adm-muted-line">Nenhum acesso registrado ainda.</p>
            : (
              <ul className="adm-events">
                {events.map((event) => {
                  const [label, tone] = EVENT_LABELS[event.event] || [event.event, "info"];
                  return (
                    <li key={event.id}>
                      <i className={`adm-event-dot ${tone}`} aria-hidden="true" />
                      <strong>{event.username}</strong>
                      <span className={`adm-event-label ${tone}`}>{label}</span>
                      <time dateTime={event.createdAt} title={new Date(event.createdAt).toLocaleString("pt-BR")}>{relativeTime(event.createdAt)}</time>
                    </li>
                  );
                })}
              </ul>
            )}
          {dormantUsers.length > 0 && (
            <p className="adm-dormant">
              <b>Sem entrar há 30+ dias:</b>{" "}
              {dormantUsers.slice(0, 6).map((u) => `${u.username}${lastLoginByUser.get(u.id) ? "" : " (nunca entrou)"}`).join(", ")}
              {dormantUsers.length > 6 && ` e mais ${dormantUsers.length - 6}`}
            </p>
          )}
        </section>
      </div>

      <div className="adm-grid">
        <section className="adm-panel adm-permissions" aria-labelledby="adm-perm-title">
          <header className="adm-panel-head">
            <div>
              <h2 id="adm-perm-title">Permissões de acesso</h2>
              <p>O que cada perfil pode visualizar e alterar.</p>
            </div>
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
                        <span className={`adm-access ${level}`}>{ACCESS_ICON[level]}{ACCESS_LABEL[level]}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="adm-legend">
            <li><span className="adm-access total">{ACCESS_ICON.total}Total</span> criar, alterar e excluir</li>
            <li><span className="adm-access read">{ACCESS_ICON.read}Leitura</span> só visualizar</li>
            <li><span className="adm-access none">Sem acesso</span> não aparece no menu</li>
          </ul>
        </section>

        <section className="adm-panel adm-settings" aria-labelledby="adm-settings-title">
          <header className="adm-panel-head">
            <div>
              <h2 id="adm-settings-title">Configurações gerais</h2>
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
            <p className={`adm-save-msg ${saveMessage && !changed ? saveMessage.type : changed ? "pending" : ""}`} role="status">
              {changed ? "Há alterações não salvas." : saveMessage ? saveMessage.text : "Tudo salvo."}
            </p>
            <button type="button" className="ct-new-button adm-save" onClick={saveSettings} disabled={!changed || saving}>
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </footer>
        </section>
      </div>

      {drawer === "users" && (
        <AdminDrawer title="Usuários e perfis" subtitle="Crie usuários, defina o perfil de acesso e redefina senhas." onClose={() => { setDrawer(null); setUsersIntent(null); loadUsers(); loadEvents(); }}>
          <UsersSection currentUserId={currentUserId} onUnauthorized={onUnauthorized} onSelfDemoted={onSelfDemoted} intent={usersIntent} />
        </AdminDrawer>
      )}
      {drawer === "sectors" && (
        <AdminDrawer title="Setores" subtitle="Setores disponíveis para classificar os processos." onClose={() => setDrawer(null)}>
          <SetoresSection sectors={sectors} onSectorsChange={onSectorsChange} />
        </AdminDrawer>
      )}
      {modalitiesDrawer}
      {actionModal && <UserActionModal mode={actionModal} users={users} currentUserId={currentUserId} busy={actionBusy} error={actionError}
        onClose={() => setActionModal(null)} onConfirm={confirmAction} />}
      <Toast toast={toast} onClose={closeToast} />
    </div>
  );
}
