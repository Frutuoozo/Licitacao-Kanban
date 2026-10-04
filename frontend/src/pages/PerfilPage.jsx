import { useEffect, useState } from "react";
import { IconClose, IconEdit, IconLogout, IconShield, IconTrash } from "../icons";
import { authFetch } from "../authFetch";
import { useAppSettings } from "../appSettings";
import "./PerfilPage.css";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3001";
const ROLE_LABEL = { admin: "Administrador", editor: "Editor", viewer: "Visualizador" };
// O que cada perfil pode fazer (o mesmo quadro da Administração).
const ROLE_ACCESS = {
  admin: ["Total", "Total", "Total", "Total"],
  editor: ["Total", "Total", "Leitura", "—"],
  viewer: ["Leitura", "Leitura", "Leitura", "—"],
};
const MODULES = ["Processos", "Contratos", "Colaboradores", "Administração"];
// Páginas que podem abrir logo após o login (mesma lista do backend).
const START_PAGES = [
  { value: "dashboard", label: "Dashboard", hint: "Visão geral de processos e contratos" },
  { value: "processos:board", label: "Processos", hint: "Quadro com o checklist de cada processo" },
  { value: "processos:calendar", label: "Calendário", hint: "Prazos de vencimento dos processos" },
  { value: "processos:reports", label: "Relatórios", hint: "Indicadores e relatório detalhado" },
  { value: "contratos", label: "Contratos", hint: "Vigências, aditivos e documentos" },
  { value: "colaboradores", label: "Colaboradores", hint: "Cadastro de colaboradores" },
  { value: "admin", label: "Administração", hint: "Usuários, segurança e modelos", adminOnly: true },
];
// Política de senha (a mesma validada no backend).
const PASSWORD_RULES = [
  { label: "Mínimo de 8 caracteres", test: (pw) => pw.length >= 8 },
  { label: "Uma letra maiúscula", test: (pw) => /[A-Z]/.test(pw) },
  { label: "Um número", test: (pw) => /[0-9]/.test(pw) },
  { label: "Um caractere especial", test: (pw) => /[^a-zA-Z0-9]/.test(pw) },
];

const formatDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : "—";
};
const daysSince = (value) => {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? Math.floor((Date.now() - date.getTime()) / 86400000) : null;
};

function PasswordDrawer({ onClose, onChanged }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const allRules = PASSWORD_RULES.every((rule) => rule.test(next));
  const matches = next && next === confirm;

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape" && !saving) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    if (!allRules) { setError("A nova senha não atende à política de senha."); return; }
    if (!matches) { setError("A confirmação não confere com a nova senha."); return; }
    if (next === current) { setError("A nova senha precisa ser diferente da atual."); return; }
    setSaving(true);
    try {
      const res = await authFetch(`${API_URL}/api/auth/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || "Não foi possível alterar a senha."); return; }
      onChanged();
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const type = show ? "text" : "password";
  return (
    <div className="ct-detail-overlay ct-form-overlay" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <div className="contract-form-modal ct-form-drawer pf-drawer" role="dialog" aria-modal="true" aria-labelledby="pf-pw-title">
        <div className="contract-form-header">
          <div>
            <span className="contract-form-eyebrow">Segurança da conta</span>
            <h2 id="pf-pw-title">Alterar senha</h2>
            <p>Por segurança, você vai precisar entrar novamente depois de alterar.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} disabled={saving} aria-label="Fechar"><IconClose /></button>
        </div>
        <form className="contract-form" onSubmit={submit}>
          <div className="contract-form-body">
            {error && <div className="contract-form-error">{error}</div>}
            <section className="contract-form-section">
              <div className="contract-form-grid">
                <label className="contract-field contract-field-wide">
                  <span>Senha atual *</span>
                  <input type={type} value={current} onChange={(event) => setCurrent(event.target.value)} required autoFocus autoComplete="current-password" />
                </label>
                <label className="contract-field contract-field-wide">
                  <span>Nova senha *</span>
                  <input type={type} value={next} onChange={(event) => setNext(event.target.value)} required autoComplete="new-password" />
                </label>
                <label className="contract-field contract-field-wide">
                  <span>Confirmar nova senha *</span>
                  <input type={type} value={confirm} onChange={(event) => setConfirm(event.target.value)} required autoComplete="new-password" />
                  {confirm && <small className={`pf-match ${matches ? "ok" : "bad"}`}>{matches ? "As senhas conferem" : "As senhas não conferem"}</small>}
                </label>
                <label className="ct-checkbox contract-field-wide">
                  <input type="checkbox" checked={show} onChange={(event) => setShow(event.target.checked)} />
                  <span>Mostrar senhas</span>
                </label>
              </div>
            </section>
            <section className="contract-form-section">
              <div className="contract-form-section-title"><div><strong>Política de senha</strong></div></div>
              <ul className="pf-rules">
                {PASSWORD_RULES.map((rule) => {
                  const ok = rule.test(next);
                  return (
                    <li key={rule.label} className={ok ? "ok" : ""}>
                      <span aria-hidden="true">{ok ? "✓" : "•"}</span> {rule.label}
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
          <div className="contract-form-footer">
            <button type="button" className="btn-cancel-lg" onClick={onClose} disabled={saving}><IconClose /> Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving || !allRules || !matches}><IconEdit /> {saving ? "Salvando..." : "Alterar senha"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PerfilPage({ onLogout, onPasswordChanged, sessionUser, onOpenMenu, onStartPageChange }) {
  const { settings } = useAppSettings();
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deletePw, setDeletePw] = useState("");
  const [deleteErr, setDeleteErr] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [startPage, setStartPage] = useState(sessionUser?.startPage || "dashboard");
  const [startStatus, setStartStatus] = useState(null);

  useEffect(() => { if (me?.startPage) setStartPage(me.startPage); }, [me]);

  // Salva na hora ao escolher; em caso de erro, volta para a opção anterior.
  const chooseStartPage = async (value) => {
    const previous = startPage;
    setStartPage(value);
    setStartStatus({ type: "saving", text: "Salvando…" });
    try {
      const res = await authFetch(`${API_URL}/api/auth/preferences`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startPage: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Não foi possível salvar.");
      onStartPageChange?.(value);
      setStartStatus({ type: "ok", text: "Página inicial salva. Vale a partir do próximo login." });
    } catch (error) {
      setStartPage(previous);
      setStartStatus({ type: "error", text: error.message });
    }
  };

  useEffect(() => {
    authFetch(`${API_URL}/api/auth/me`)
      .then((res) => {
        if (res.status === 401 || res.status === 403) { onLogout(); throw new Error("Unauthorized"); }
        return res.json();
      })
      .then((data) => setMe(data))
      .catch(() => setMe(null))
      .finally(() => setLoading(false));
  }, [onLogout]);

  const username = me?.username ?? sessionUser?.username ?? "—";
  const role = me?.role ?? sessionUser?.role ?? "viewer";
  const roleLabel = ROLE_LABEL[role] || "Usuário";
  const passwordAge = daysSince(me?.passwordChangedAt);
  const passwordDaysLeft = settings.passwordExpiryEnabled && passwordAge !== null ? settings.passwordExpiryDays - passwordAge : null;

  const deleteAccount = async (event) => {
    event.preventDefault();
    setDeleteErr(""); setDeleting(true);
    try {
      const res = await authFetch(`${API_URL}/api/auth/account`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setDeleteErr(data.error || "Não foi possível apagar a conta."); return; }
      onLogout();
    } catch {
      setDeleteErr("Erro de conexão. Tente novamente.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="lk-contracts pf-page">
      <header className="ct-header">
        <button className="lk-menu" aria-label="Abrir navegação" onClick={onOpenMenu}>☰</button>
        <div className="ct-header-text">
          <h1>Meu perfil</h1>
          <p>Seus dados de acesso e a segurança da sua conta</p>
        </div>
      </header>

      <section className="pf-hero" aria-label="Resumo da conta">
        <span className="pf-avatar" aria-hidden="true">{username !== "—" ? username[0].toUpperCase() : "?"}</span>
        <div className="pf-hero-text">
          <h2>{username}</h2>
          <span className={`pf-role ${role}`}><IconShield /> {roleLabel}</span>
        </div>
        <button type="button" className="ct-header-export pf-logout" onClick={onLogout}><IconLogout /> Sair</button>
      </section>

      {loading ? (
        <div className="ct-state"><span className="contracts-spinner" /><p>Carregando seu perfil…</p></div>
      ) : (
        <div className="pf-grid">
          <section className="adm-panel" aria-labelledby="pf-info-title">
            <header className="adm-panel-head"><div><h2 id="pf-info-title">Informações da conta</h2><p>Dados do seu usuário no sistema.</p></div></header>
            <dl className="pf-info">
              <div><dt>Usuário</dt><dd>{username}</dd></div>
              <div><dt>Perfil de acesso</dt><dd>{roleLabel}</dd></div>
              <div><dt>Membro desde</dt><dd>{formatDate(me?.createdAt)}</dd></div>
              <div><dt>Última troca de senha</dt><dd>{formatDate(me?.passwordChangedAt)}{passwordAge !== null && <small> · há {passwordAge} {passwordAge === 1 ? "dia" : "dias"}</small>}</dd></div>
            </dl>

            <h3 className="pf-subtitle">O que o seu perfil pode fazer</h3>
            <ul className="pf-access">
              {MODULES.map((module, i) => {
                const level = (ROLE_ACCESS[role] || ROLE_ACCESS.viewer)[i];
                return (
                  <li key={module}>
                    <span>{module}</span>
                    <strong className={`adm-access ${level === "Total" ? "total" : level === "Leitura" ? "read" : "none"}`}>{level === "—" ? "Sem acesso" : level}</strong>
                  </li>
                );
              })}
            </ul>
            <p className="pf-hint">Para mudar o seu perfil de acesso, fale com um administrador.</p>
          </section>

          <section className="adm-panel" aria-labelledby="pf-sec-title">
            <header className="adm-panel-head"><div><h2 id="pf-sec-title">Segurança</h2><p>Senha e acesso da sua conta.</p></div></header>
            <ul className="adm-settings-list pf-security">
              <li>
                <div>
                  <strong>Senha</strong>
                  <small>
                    {passwordDaysLeft === null ? "Use uma senha forte e não a compartilhe."
                      : passwordDaysLeft > 0 ? `Pela política, sua senha vence em ${passwordDaysLeft} ${passwordDaysLeft === 1 ? "dia" : "dias"}.`
                      : "Sua senha venceu: você vai precisar trocá-la no próximo login."}
                  </small>
                </div>
                <button type="button" className="mm-btn outline" onClick={() => setShowPassword(true)}>Alterar senha</button>
              </li>
            </ul>

            <div className="pf-danger">
              <div>
                <strong>Apagar conta</strong>
                <small>Remove o seu usuário do sistema. Essa ação não pode ser desfeita.</small>
              </div>
              <button type="button" className="mm-btn danger" onClick={() => { setShowDelete(true); setDeletePw(""); setDeleteErr(""); }}><IconTrash /> Apagar conta</button>
            </div>
          </section>

          <section className="adm-panel pf-start" aria-labelledby="pf-start-title">
            <header className="adm-panel-head">
              <div>
                <h2 id="pf-start-title">Página inicial</h2>
                <p>Escolha qual página abrir assim que você entrar no sistema.</p>
              </div>
              {startStatus && <span className={`pf-start-status ${startStatus.type}`} role="status">{startStatus.text}</span>}
            </header>
            <div className="pf-start-options" role="radiogroup" aria-labelledby="pf-start-title">
              {START_PAGES.filter((page) => !page.adminOnly || role === "admin").map((page) => (
                <label key={page.value} className={`pf-start-option ${startPage === page.value ? "active" : ""}`}>
                  <input type="radio" name="pf-start-page" value={page.value} checked={startPage === page.value} onChange={() => chooseStartPage(page.value)} />
                  <span className="pf-start-radio" aria-hidden="true" />
                  <span>
                    <strong>{page.label}</strong>
                    <small>{page.hint}</small>
                  </span>
                </label>
              ))}
            </div>
          </section>
        </div>
      )}

      {showPassword && <PasswordDrawer onClose={() => setShowPassword(false)} onChanged={onPasswordChanged} />}

      {showDelete && (
        <div className="contract-modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && !deleting && setShowDelete(false)}>
          <form className="contract-delete-modal ct-close-modal" role="alertdialog" aria-modal="true" aria-labelledby="pf-del-title" onSubmit={deleteAccount}>
            <div className="contract-delete-icon"><IconTrash /></div>
            <h2 id="pf-del-title">Apagar a sua conta?</h2>
            <p>O usuário <strong>{username}</strong> será removido permanentemente. Digite sua senha para confirmar.</p>
            {deleteErr && <div className="contract-form-error">{deleteErr}</div>}
            <div className="ct-close-fields">
              <label className="contract-field">
                <span>Sua senha *</span>
                <input className="pf-input" type="password" value={deletePw} onChange={(event) => setDeletePw(event.target.value)} required autoFocus autoComplete="current-password" />
              </label>
            </div>
            <div className="contract-delete-actions">
              <button type="button" className="btn-cancel-lg" onClick={() => setShowDelete(false)} disabled={deleting}>Cancelar</button>
              <button type="submit" className="btn-danger pf-delete-confirm" disabled={deleting || !deletePw}>{deleting ? "Apagando..." : "Apagar definitivamente"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
