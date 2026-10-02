import { IconClipboard, IconFileText, IconUsers, IconShield, IconUser } from "../icons";

export default function AppSidebar({ user, activeSection, menuOpen, onNavigate, onLogout }) {
  const nav = [["dashboard", "Dashboard", IconClipboard], ["processos", "Processos", IconClipboard], ["contratos", "Contratos", IconFileText], ["colaboradores", "Colaboradores", IconUsers], ...(user?.role === "admin" ? [["admin", "Administração", IconShield]] : [])];
  const name = user?.name || user?.username || "Usuário";
  const go = onNavigate;
  return (
    <aside className={`lk-sidebar ${menuOpen ? "is-open" : ""}`}>
      <div className="lk-brand"><span className="lk-mark">LK</span><div><strong>LicitKanban</strong><small>Gestão de Licitações</small></div></div>
      <nav aria-label="Navegação principal"><p className="lk-nav-label">NAVEGAÇÃO</p>{nav.map(([id, label, Icon]) => <button key={id} className={id === activeSection ? "selected" : ""} aria-current={id === activeSection ? "page" : undefined} onClick={() => go(id)}><Icon />{label}</button>)}</nav>
      <div className="lk-sidebar-bottom"><button onClick={() => go("perfil")}><IconUser />Configurações</button><button className="lk-profile" onClick={() => go("perfil")}><span className="lk-avatar">{name.slice(0, 1).toUpperCase()}</span><span><strong>{name}</strong><small>{{ admin: "Administrador", editor: "Editor", viewer: "Visualizador" }[user?.role] || user?.role}</small></span></button><button className="lk-logout" onClick={onLogout}>Sair</button></div>
    </aside>
  );
}
