import { IconClipboard, IconFileText, IconUsers, IconShield, IconSettings, IconLogout } from "../icons";

export default function AppSidebar({ user, activeSection, menuOpen, onNavigate, onLogout }) {
  const nav = [["dashboard", "Dashboard", IconClipboard], ["processos", "Processos", IconClipboard], ["contratos", "Contratos", IconFileText], ["colaboradores", "Colaboradores", IconUsers], ...(user?.role === "admin" ? [["admin", "Administração", IconShield]] : [])];
  const go = onNavigate;
  return (
    <aside className={`lk-sidebar ${menuOpen ? "is-open" : ""}`}>
      <div className="lk-brand"><span className="lk-mark">LK</span><div><strong>LicitKanban</strong><small>Gestão de Licitações</small></div></div>
      <nav aria-label="Navegação principal"><p className="lk-nav-label">NAVEGAÇÃO</p>{nav.map(([id, label, Icon]) => <button key={id} className={id === activeSection ? "selected" : ""} aria-current={id === activeSection ? "page" : undefined} onClick={() => go(id)}><Icon />{label}</button>)}</nav>
      <div className="lk-sidebar-bottom">
        <button className={`lk-settings ${activeSection === "perfil" ? "selected" : ""}`} aria-current={activeSection === "perfil" ? "page" : undefined} onClick={() => go("perfil")}><IconSettings />Configurações</button>
        <button type="button" className="lk-signout" onClick={onLogout}><IconLogout />Sair</button>
      </div>
    </aside>
  );
}
