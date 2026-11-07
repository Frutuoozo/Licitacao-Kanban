import { useEffect, useRef, useState } from "react";
import { authFetch, API_URL } from "../authFetch";
import { Toast, useToast } from "../components/Toast";
import { IconEye, IconEyeOff } from "../icons";
import "./LoginPage.css";

// Tela de entrada em duas metades: ilustração (branca) e formulário (azul). "Sou um novo usuário"
// desliza o formulário para a esquerda e a ilustração para a direita, onde fica o primeiro acesso.
// O primeiro acesso segue o fluxo de sempre: o administrador cria o usuário com uma senha temporária;
// a pessoa entra com ela (etapa "credenciais") e o servidor pede uma senha nova (etapa "senha").

// Mesma política do backend. A lista da tela e a validação do envio usam estas regras.
const PASSWORD_RULES = [
  { label: "8 caracteres ou mais", test: (p) => p.length >= 8, missing: "Use no mínimo 8 caracteres." },
  { label: "Uma letra maiúscula", test: (p) => /[A-Z]/.test(p), missing: "Inclua pelo menos uma letra maiúscula." },
  { label: "Um número", test: (p) => /[0-9]/.test(p), missing: "Inclua pelo menos um número." },
  { label: "Um caractere especial", test: (p) => /[^a-zA-Z0-9]/.test(p), missing: "Inclua pelo menos um caractere especial, como ! @ # $." },
];

// Devolve o que falta na nova senha, ou null se ela atende a tudo.
function newPasswordProblem(password) {
  return PASSWORD_RULES.find((rule) => !rule.test(password))?.missing || null;
}

// Tamanho do cartão proporcional à tela: 1280×800 é a referência (1), comparando o lado maior com 1280
// e o menor com 800 (um tablet em pé não é tratado como tela estreita). Vai até 1,6 (telas grandes/TVs)
// e desce até 0,85 só com mouse — em telas de toque não fica menor que 1. No celular o CSS ignora a escala.
function loginScale() {
  const { innerWidth: w, innerHeight: h } = window;
  const scale = Math.min(Math.max(w, h) / 1280, Math.min(w, h) / 800);
  const min = window.matchMedia("(pointer: coarse)").matches ? 1 : 0.85;
  return Math.min(1.6, Math.max(min, scale)).toFixed(3);
}

function useLoginScale() {
  const [scale, setScale] = useState(loginScale);
  useEffect(() => {
    const onResize = () => setScale(loginScale());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return scale;
}

function PasswordChecklist({ password }) {
  return (
    <ul className="lg-rules" aria-label="Requisitos da senha">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(password);
        return (
          <li key={rule.label} className={ok ? "ok" : undefined}>
            <span className="lg-dot" aria-hidden="true">
              {ok && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
            </span>
            {rule.label}
            <span className="lg-sr">{ok ? " (atendido)" : " (pendente)"}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Field({ id, label, value, onChange, type = "text", autoComplete, placeholder, reveal }) {
  const [visible, setVisible] = useState(false);
  const isPassword = type === "password";
  return (
    <div className="lg-field">
      <label htmlFor={id}>{label}</label>
      <div className="lg-input">
        <input
          id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          type={isPassword && visible ? "text" : type} autoComplete={autoComplete}
          autoCapitalize="off" autoCorrect="off" spellCheck={false} className={reveal ? "has-eye" : undefined}
        />
        {reveal && (
          <button type="button" className="lg-eye" onClick={() => setVisible((v) => !v)} aria-label={visible ? "Ocultar senha" : "Mostrar senha"}>
            {visible ? <IconEyeOff /> : <IconEye />}
          </button>
        )}
      </div>
    </div>
  );
}

// Quadro Kanban de processos, edital e selo de concluído (estático).
function Illustration() {
  return (
    <svg viewBox="0 0 440 360" role="img" aria-label="Quadro com processos de licitação organizados em colunas">
      <defs><clipPath id="lg-board"><rect x="78" y="70" width="290" height="210" rx="18" /></clipPath></defs>
      <path d="M70 190c-30-80 30-150 120-158 70-6 120 10 168 50 52 44 70 110 30 166-38 54-120 74-200 62C108 300 92 248 70 190Z" fill="#e3ecff" />
      <circle cx="384" cy="74" r="20" fill="#dbe7ff" /><circle cx="58" cy="292" r="12" fill="#dbe7ff" /><circle cx="404" cy="268" r="8" fill="#c7d8ff" />
      <rect x="78" y="70" width="290" height="210" rx="18" fill="#fff" stroke="#c9d6f5" strokeWidth="2" />
      <g clipPath="url(#lg-board)"><rect x="78" y="70" width="290" height="34" fill="#1a1a6e" /></g>
      <circle cx="98" cy="87" r="4" fill="#93c5fd" /><circle cx="111" cy="87" r="4" fill="#5b8def" /><circle cx="124" cy="87" r="4" fill="#ffffff66" />
      <g fontFamily="Nunito Sans, sans-serif" fontSize="9" fontWeight="700" fill="#5f6a8a">
        <text x="92" y="124">PLANEJAMENTO</text><text x="187" y="124">EM DISPUTA</text><text x="282" y="124">CONCLUÍDO</text>
      </g>
      <line x1="180" y1="114" x2="180" y2="266" stroke="#e5ebf8" strokeWidth="2" /><line x1="275" y1="114" x2="275" y2="266" stroke="#e5ebf8" strokeWidth="2" />
      <rect x="90" y="134" width="80" height="40" rx="8" fill="#f3f6fd" /><rect x="90" y="134" width="5" height="40" rx="2.5" fill="#2563eb" />
      <rect x="101" y="144" width="50" height="6" rx="3" fill="#1a1a6e" /><rect x="101" y="157" width="34" height="5" rx="2.5" fill="#b8c4e6" />
      <rect x="90" y="182" width="80" height="40" rx="8" fill="#f3f6fd" /><rect x="90" y="182" width="5" height="40" rx="2.5" fill="#93c5fd" />
      <rect x="101" y="192" width="44" height="6" rx="3" fill="#1a1a6e" /><rect x="101" y="205" width="52" height="5" rx="2.5" fill="#b8c4e6" />
      <rect x="185" y="134" width="82" height="52" rx="8" fill="#fff" stroke="#2563eb" strokeWidth="2" /><rect x="185" y="134" width="5" height="52" rx="2.5" fill="#2563eb" />
      <rect x="197" y="145" width="54" height="6" rx="3" fill="#1a1a6e" /><rect x="197" y="158" width="40" height="5" rx="2.5" fill="#b8c4e6" />
      <rect x="197" y="170" width="58" height="5" rx="2.5" fill="#e3ecff" /><rect x="197" y="170" width="36" height="5" rx="2.5" fill="#2563eb" />
      <rect x="185" y="194" width="80" height="40" rx="8" fill="#f3f6fd" /><rect x="185" y="194" width="5" height="40" rx="2.5" fill="#5b8def" />
      <rect x="196" y="204" width="46" height="6" rx="3" fill="#1a1a6e" /><rect x="196" y="217" width="30" height="5" rx="2.5" fill="#b8c4e6" />
      <rect x="282" y="134" width="76" height="40" rx="8" fill="#f3f6fd" /><rect x="282" y="134" width="5" height="40" rx="2.5" fill="#16a34a" />
      <rect x="293" y="144" width="44" height="6" rx="3" fill="#1a1a6e" /><rect x="293" y="157" width="28" height="5" rx="2.5" fill="#b8c4e6" />
      <g transform="rotate(-8 74 250)">
        <rect x="34" y="200" width="78" height="100" rx="8" fill="#fff" stroke="#c9d6f5" strokeWidth="2" />
        <rect x="46" y="214" width="40" height="7" rx="3.5" fill="#1a1a6e" />
        <rect x="46" y="230" width="54" height="4" rx="2" fill="#c9d6f5" /><rect x="46" y="240" width="48" height="4" rx="2" fill="#c9d6f5" />
        <rect x="46" y="250" width="54" height="4" rx="2" fill="#c9d6f5" /><rect x="46" y="260" width="34" height="4" rx="2" fill="#c9d6f5" />
        <circle cx="88" cy="282" r="9" fill="none" stroke="#2563eb" strokeWidth="2" /><path d="M84 282l3 3 5-6" stroke="#2563eb" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <circle cx="356" cy="262" r="30" fill="#2563eb" /><circle cx="356" cy="262" r="30" fill="none" stroke="#fff" strokeWidth="4" />
      <path d="M343 262l9 9 17-19" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <g transform="translate(330 30)"><circle cx="18" cy="18" r="14" fill="#fff" stroke="#1a1a6e" strokeWidth="4" /><path d="M28 28l12 12" stroke="#1a1a6e" strokeWidth="5" strokeLinecap="round" /></g>
    </svg>
  );
}

// Borda curva do painel azul. O painel tem uma de cada lado: a que fica para fora do cartão é cortada
// por ele, então a troca de lados é só um deslizamento (nada é espelhado no meio do caminho).
const WAVE_PATH = "M90 0H62C30 70 4 150 26 250c20 92 74 150 44 250-14 48-36 96-60 140h80Z";

export default function LoginPage({ onLogin, notice }) {
  const scale = useLoginScale();
  const { toast, notify, closeToast } = useToast();
  const [mode, setMode] = useState("login"); // login | novo
  const [firstStep, setFirstStep] = useState("credenciais"); // credenciais | senha (dentro do primeiro acesso)
  const [loading, setLoading] = useState(false);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const focusAfterSlide = useRef(null);

  // Avisos vindos do app ao sair (sessão expirada, inatividade, senha alterada).
  useEffect(() => {
    if (notice) notify(notice.type, notice.title, notice.text);
  }, [notice, notify]);

  // Depois do deslizamento, o foco vai para o primeiro campo do formulário que apareceu.
  useEffect(() => {
    const id = focusAfterSlide.current;
    if (!id) return undefined;
    const timer = setTimeout(() => document.getElementById(id)?.focus({ preventScroll: true }), 500);
    focusAfterSlide.current = null;
    return () => clearTimeout(timer);
  }, [mode, firstStep]);

  const goToFirstAccess = () => { focusAfterSlide.current = "lg-new-user"; setFirstStep("credenciais"); setMode("novo"); };
  const backToLogin = () => {
    focusAfterSlide.current = "lg-user";
    setMode("login"); setFirstStep("credenciais");
    setTemporaryPassword(""); setNewPassword(""); setConfirmPassword("");
  };

  // Login de sempre (formulário "Entrar" e etapa 1 do primeiro acesso). Se o servidor responder que é
  // primeiro acesso ou senha expirada, vai para a etapa de criar a senha (deslizando, se preciso).
  const signIn = async (user, pass) => {
    setLoading(true);
    closeToast();
    try {
      const res = await authFetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password: pass }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 423: conta bloqueada por tentativas inválidas (o texto do servidor diz por quanto tempo).
        notify("error", res.status === 423 ? "Conta bloqueada" : "Não foi possível entrar", data.error);
        return;
      }
      if (!data.firstAccess) { onLogin(data); return; }
      setNewUsername(user);
      setTemporaryPassword(pass);
      setPassword("");
      focusAfterSlide.current = "lg-new-password";
      setFirstStep("senha");
      setMode("novo");
      if (data.passwordExpired) notify("warning", "Sua senha expirou", "Pela política de segurança, crie uma senha nova para continuar.");
      else notify("info", "Crie sua senha", "É seu primeiro acesso: defina uma senha nova para entrar.");
    } catch {
      notify("error", "Sem conexão com o servidor", "Verifique sua internet e tente de novo em instantes.");
    } finally {
      setLoading(false);
    }
  };

  const createPassword = async () => {
    const problem = newPasswordProblem(newPassword);
    if (problem) return notify("error", "A senha não atende aos requisitos", problem);
    if (newPassword !== confirmPassword) return notify("error", "As senhas não coincidem", "Digite a mesma senha nos dois campos.");
    setLoading(true);
    closeToast();
    try {
      const res = await authFetch(`${API_URL}/api/auth/first-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: newUsername, currentPassword: temporaryPassword, password: newPassword }),
      });
      const data = await res.json();
      if (res.ok) onLogin(data);
      else notify("error", "Não foi possível definir a senha", data.error);
    } catch {
      notify("error", "Sem conexão com o servidor", "Verifique sua internet e tente de novo em instantes.");
    } finally {
      setLoading(false);
    }
    return undefined;
  };

  const onLoginSubmit = (e) => { e.preventDefault(); signIn(username, password); };
  const onFirstAccessSubmit = (e) => {
    e.preventDefault();
    if (firstStep === "credenciais") signIn(newUsername, temporaryPassword);
    else createPassword();
  };

  const isNew = mode === "novo";
  // O formulário escondido fica fora do Tab e dos leitores de tela.
  const hiddenProps = (hidden) => (hidden ? { inert: "", "aria-hidden": true } : {});

  return (
    <div className="lg-page">
      <div className={`lg-card${isNew ? " is-new" : ""}`} style={{ "--lg-scale": scale }}>
        <header className="lg-topbar">
          <div className="lg-topbar-brand">Licit<span>Kanban</span></div>
          <button type="button" className="lg-top-action" onClick={isNew ? backToLogin : goToFirstAccess}>{isNew ? "Fazer login" : "Primeiro acesso"}</button>
        </header>
        <section className="lg-art">
          <div className="lg-brand">Licit<span>Kanban</span><small>Acompanhamento de licitações e contratos</small></div>
          <div className="lg-illustration"><Illustration /></div>
        </section>

        <section className="lg-panel">
          <svg className="lg-wave left" viewBox="0 0 90 640" preserveAspectRatio="none" aria-hidden="true"><path d={WAVE_PATH} /></svg>
          <svg className="lg-wave right" viewBox="0 0 90 640" preserveAspectRatio="none" aria-hidden="true"><path d={WAVE_PATH} /></svg>
          <div className="lg-forms">
            <form className="lg-form is-login" onSubmit={onLoginSubmit} noValidate {...hiddenProps(isNew)}>
              <h1>Login</h1>
              <p className="lg-sub lg-sub-login">Use seu usuário e senha do LicitKanban.</p>
              <div className="lg-fields">
                <Field id="lg-user" label="Usuário" value={username} onChange={setUsername} autoComplete="username" placeholder="Usuário" />
                <Field id="lg-password" label="Senha" type="password" value={password} onChange={setPassword} autoComplete="current-password" placeholder="Senha" reveal />
              </div>
              <button type="button" className="lg-forgot" onClick={() => notify("info", "Esqueceu a senha?", "Peça ao administrador do sistema para redefinir sua senha.")}>Esqueceu a senha?</button>
              <button type="submit" className="lg-primary" disabled={loading}>{loading && !isNew ? "Entrando…" : "Entrar"}</button>
              <p className="lg-help">Esqueceu a senha? Peça ao administrador para redefini-la.</p>
              <div className="lg-switch"><span>Primeira vez aqui?</span><button type="button" className="lg-secondary" onClick={goToFirstAccess}>Sou um novo usuário</button></div>
            </form>

            <form className="lg-form is-first" onSubmit={onFirstAccessSubmit} noValidate {...hiddenProps(!isNew)}>
              {firstStep === "credenciais" ? (
                <>
                  <h1>Primeiro acesso</h1>
                  <p className="lg-sub">Entre com o usuário e a senha temporária que o administrador enviou.</p>
                  <div className="lg-fields">
                    <Field id="lg-new-user" label="Usuário" value={newUsername} onChange={setNewUsername} autoComplete="username" placeholder="Usuário" />
                    <Field id="lg-temp-password" label="Senha temporária" type="password" value={temporaryPassword} onChange={setTemporaryPassword} autoComplete="current-password" placeholder="Senha temporária" reveal />
                  </div>
                  <button type="submit" className="lg-primary" disabled={loading}>{loading && isNew ? "Verificando…" : "Continuar"}</button>
                </>
              ) : (
                <>
                  <h1>Crie sua senha</h1>
                  <p className="lg-sub">Defina uma senha nova para entrar como <strong>{newUsername}</strong>.</p>
                  <div className="lg-fields">
                    <Field id="lg-new-password" label="Nova senha" type="password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" placeholder="Nova senha" reveal />
                    <PasswordChecklist password={newPassword} />
                    <Field id="lg-confirm-password" label="Confirme a nova senha" type="password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" placeholder="Confirme a nova senha" />
                  </div>
                  <button type="submit" className="lg-primary" disabled={loading}>{loading && isNew ? "Salvando…" : "Definir senha e entrar"}</button>
                </>
              )}
              <div className="lg-switch"><span>Já tem sua senha?</span><button type="button" className="lg-secondary" onClick={backToLogin}>Voltar para entrar</button></div>
            </form>
          </div>
        </section>
      </div>
      <Toast toast={toast} onClose={closeToast} />
    </div>
  );
}
