import { useState, useEffect } from "react";
import { IconClose, IconUser, IconShield, IconPalette, IconCheck } from "../icons";
import { authFetch } from "../authFetch";

const THEMES = [
  {
    id: "dark",
    name: "Dark (Escuro)",
    desc: "Tema escuro padrão elegante",
    icon: "🌙",
    bg: "#0d1117",
    surface: "#161b22",
    accent: "#f0883e",
  },
  {
    id: "white",
    name: "White (Claro)",
    desc: "Tema claro, limpo e minimalista",
    icon: "☀️",
    bg: "#f4f6f8",
    surface: "#ffffff",
    accent: "#2563eb",
  },
  {
    id: "creme",
    name: "Creme (Warm)",
    desc: "Tema suave com tons amadeirados",
    icon: "🌾",
    bg: "#f5efe6",
    surface: "#fcf9f2",
    accent: "#c2410c",
  },
  {
    id: "royal",
    name: "Azul Royal",
    desc: "Tema azul meia-noite vibrante",
    icon: "👑",
    bg: "#0b132b",
    surface: "#1c2541",
    accent: "#38bdf8",
  },
];

export default function PerfilPage({ onLogout, sessionUser }) {
  const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";
  const [me, setMe] = useState(null);
  const [meLoading, setMeLoading] = useState(false);
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
  const [successMsg, setSuccessMsg] = useState("");
  const [activeTheme, setActiveTheme] = useState(() => {
    return localStorage.getItem("licit_theme") || "dark";
  });

  useEffect(() => {
    setMeLoading(true);
    authFetch(`${API_URL}/api/auth/me`)
      .then((r) => {
        if (r.status === 401 || r.status === 403) { onLogout(); throw new Error("Unauthorized"); }
        return r.json();
      })
      .then((data) => setMe(data))
      .catch(() => setMe(null))
      .finally(() => setMeLoading(false));
  }, [API_URL, onLogout]);

  const displayUser = me?.username ?? sessionUser?.username ?? "—";
  const displayRole = me?.role ?? sessionUser?.role ?? "—";

  const handleSelectTheme = (themeId) => {
    setActiveTheme(themeId);
    try {
      localStorage.setItem("licit_theme", themeId);
      document.documentElement.removeAttribute("style");
      document.documentElement.setAttribute("data-theme", themeId);
    } catch { /* ignore */ }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault(); setResetErr(""); setSuccessMsg("");
    if (newPw.length < 8) { setResetErr("A nova senha deve ter no mínimo 8 caracteres"); return; }
    if (!/[A-Z]/.test(newPw)) { setResetErr("A nova senha deve conter pelo menos uma letra maiúscula"); return; }
    if (!/[0-9]/.test(newPw)) { setResetErr("A nova senha deve conter pelo menos um número"); return; }
    if (!/[^a-zA-Z0-9]/.test(newPw)) { setResetErr("A nova senha deve conter pelo menos um caractere especial"); return; }
    if (newPw !== newPw2) { setResetErr("Confirmação não confere"); return; }
    setResetLoading(true);
    try {
      const res = await authFetch(`${API_URL}/api/auth/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setResetErr(data.error || "Não foi possível alterar"); return; }
      setShowResetModal(false); setCurrentPw(""); setNewPw(""); setNewPw2("");
      setSuccessMsg("Senha redefinida com sucesso!");
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch { setResetErr("Erro de conexão"); } finally { setResetLoading(false); }
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault(); setDeleteErr(""); setDeleteLoading(true);
    try {
      const res = await authFetch(`${API_URL}/api/auth/account`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePw })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setDeleteErr(data.error || "Falha ao apagar"); return; }
      onLogout();
    } catch { setDeleteErr("Erro de conexão"); } finally { setDeleteLoading(false); }
  };

  return (
    <div className="perfil-page">
      <div className="perfil-container">
        {/* Header Hero Card */}
        <div className="perfil-header-card">
          <div className="perfil-avatar">
            {displayUser !== "—" ? displayUser[0].toUpperCase() : <IconUser />}
          </div>
          <div className="perfil-header-info">
            <h1 className="perfil-title">{displayUser}</h1>
            <div className="perfil-role-badge" data-role={displayRole}>
              {displayRole === "admin" ? <IconShield /> : <IconUser />}
              {displayRole === "admin" ? "Administrador" : displayRole === "editor" ? "Editor" : displayRole === "viewer" ? "Visualizador" : "Usuário"}
            </div>
          </div>
        </div>

        {meLoading ? (
          <div className="perfil-loading">Carregando informações do perfil...</div>
        ) : (
          <>
            {successMsg && (
              <div className="perfil-success">
                <IconCheck />
                <span>{successMsg}</span>
              </div>
            )}

            <div className="perfil-grid">
              {/* Seção de Dados do Usuário */}
              <div className="perfil-section">
                <div className="perfil-section-title-wrap">
                  <span className="perfil-section-icon"><IconUser /></span>
                  <h2 className="perfil-section-title">Informações Pessoais</h2>
                </div>
                <div className="perfil-fields">
                  <div className="perfil-field">
                    <label className="perfil-label">Nome de Usuário</label>
                    <div className="perfil-value-display">{displayUser}</div>
                  </div>
                  <div className="perfil-field">
                    <label className="perfil-label">Nível de Acesso (Cargo)</label>
                    <div className="perfil-value-display">
                      <span className="perfil-role-badge" data-role={displayRole}>
                        {displayRole === "admin" ? "Administrador" : displayRole === "editor" ? "Editor" : displayRole === "viewer" ? "Visualizador" : "Usuário"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Seção de Segurança */}
              <div className="perfil-section">
                <div className="perfil-section-title-wrap">
                  <span className="perfil-section-icon"><IconShield /></span>
                  <h2 className="perfil-section-title">Segurança da Conta</h2>
                </div>
                <p className="profile-muted">Gerencie suas credenciais de acesso e a segurança da sua conta.</p>
                <div className="perfil-actions">
                  <button type="button" className="btn-outline perfil-action-btn" onClick={() => { setShowResetModal(true); setResetErr(""); setCurrentPw(""); setNewPw(""); setNewPw2(""); }}>
                    Redefinir Senha
                  </button>
                  <button type="button" className="btn-outline perfil-action-btn perfil-danger-btn" onClick={() => { setShowDeleteModal(true); setDeleteErr(""); setDeletePw(""); }}>
                    Apagar Conta
                  </button>
                </div>
              </div>
            </div>

            {/* Seção de Temas / Aparência */}
            <div className="perfil-section">
              <div className="perfil-section-title-wrap">
                <span className="perfil-section-icon"><IconPalette /></span>
                <h2 className="perfil-section-title">Aparência do Sistema</h2>
              </div>
              <p className="profile-muted">Escolha o tema visual que melhor se adapta às suas preferências.</p>
              
              <div className="perfil-themes-container">
                {THEMES.map((t) => {
                  const isActive = activeTheme === t.id;
                  return (
                    <div
                      key={t.id}
                      className={`perfil-theme-box ${isActive ? "active" : ""}`}
                      onClick={() => handleSelectTheme(t.id)}
                    >
                      <div className="perfil-theme-preview" style={{ backgroundColor: t.bg }}>
                        <div className="perfil-theme-preview-header" style={{ backgroundColor: t.surface }}>
                          <div className="perfil-theme-preview-dot" style={{ backgroundColor: t.accent }} />
                          <div className="perfil-theme-preview-bar" style={{ backgroundColor: t.accent }} />
                        </div>
                        <div className="perfil-theme-preview-body">
                          <div className="perfil-theme-preview-card" style={{ backgroundColor: t.surface }}>
                            <div className="perfil-theme-preview-line" style={{ backgroundColor: t.accent }} />
                            <div className="perfil-theme-preview-subline" />
                          </div>
                        </div>
                      </div>
                      <div className="perfil-theme-details">
                        <div className="perfil-theme-header-row">
                          <span className="perfil-theme-emoji">{t.icon}</span>
                          <span className="perfil-theme-name">{t.name}</span>
                          {isActive && (
                            <span className="perfil-theme-badge">
                              <IconCheck /> Ativo
                            </span>
                          )}
                        </div>
                        <p className="perfil-theme-desc">{t.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal Redefinir Senha */}
      {showResetModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowResetModal(false)}>
          <div className="modal sm-modal">
            <div className="modal-header">
              <h2>Redefinir Senha</h2>
              <button type="button" className="icon-btn" onClick={() => setShowResetModal(false)} aria-label="Fechar"><IconClose /></button>
            </div>
            <form className="modal-body col" onSubmit={handleResetPassword}>
              <label className="profile-form-label">Senha Atual</label>
              <input className="doc-input" type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required autoComplete="current-password" />
              <label className="profile-form-label">Nova Senha</label>
              <input className="doc-input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} required autoComplete="new-password" />
              <label className="profile-form-label">Confirmar Nova Senha</label>
              <input className="doc-input" type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} required autoComplete="new-password" />
              {resetErr ? <div className="profile-err">{resetErr}</div> : null}
              <div className="modal-footer profile-modal-footer">
                <button type="button" className="btn-cancel" onClick={() => setShowResetModal(false)}>Cancelar</button>
                <button type="submit" className="btn-confirm" disabled={resetLoading}>{resetLoading ? "Salvando..." : "Salvar"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Apagar Conta */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowDeleteModal(false)}>
          <div className="modal sm-modal">
            <div className="modal-header">
              <h2>Apagar Conta</h2>
              <button type="button" className="icon-btn" onClick={() => setShowDeleteModal(false)} aria-label="Fechar"><IconClose /></button>
            </div>
            <form className="modal-body col" onSubmit={handleDeleteAccount}>
              <p className="profile-muted profile-delete-lead">Esta ação não pode ser desfeita. Digite sua senha para confirmar.</p>
              <label className="profile-form-label">Senha</label>
              <input className="doc-input" type="password" value={deletePw} onChange={(e) => setDeletePw(e.target.value)} required autoComplete="current-password" />
              {deleteErr ? <div className="profile-err">{deleteErr}</div> : null}
              <div className="modal-footer profile-modal-footer">
                <button type="button" className="btn-cancel" onClick={() => setShowDeleteModal(false)}>Cancelar</button>
                <button type="submit" className="btn-confirm profile-delete-submit" disabled={deleteLoading}>{deleteLoading ? "Removendo..." : "Apagar Definitivamente"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
