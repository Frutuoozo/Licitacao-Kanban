import { IconDashboard, IconInbox, IconKanban, IconFileText, IconUsers, IconShield, IconSettings, IconLogout, IconMoon, IconSun } from "../icons";

export default function AppSidebar({ user, activeSection, menuOpen, onNavigate, onLogout, darkMode = false, onToggleDarkMode }) {
  const nav = [["dashboard", "Dashboard", IconDashboard], ["demandas", "Demandas", IconInbox], ["processos", "Processos", IconKanban], ["contratos", "Contratos", IconFileText], ["colaboradores", "Colaboradores", IconUsers], ...(user?.role === "admin" ? [["admin", "Administração", IconShield]] : [])];
  const go = onNavigate;
  return (
    <aside className={`lk-sidebar ${menuOpen ? "is-open" : ""}`}>
      <div className="lk-brand"><span className="lk-mark">LK</span><div><strong>LicitKanban</strong><small>Gestão de Licitações</small></div></div>
      <nav aria-label="Navegação principal"><p className="lk-nav-label">NAVEGAÇÃO</p>{nav.map(([id, label, Icon]) => <button key={id} className={id === activeSection ? "selected" : ""} aria-current={id === activeSection ? "page" : undefined} onClick={() => go(id)}><Icon />{label}</button>)}</nav>
      <div className="lk-sidebar-bottom">
        {onToggleDarkMode && (
          <button type="button" className="lk-theme-toggle" onClick={onToggleDarkMode} aria-pressed={darkMode}>
            {darkMode ? <IconSun /> : <IconMoon />}{darkMode ? "Tema claro" : "Tema escuro"}
          </button>
        )}
        <button className={`lk-settings ${activeSection === "perfil" ? "selected" : ""}`} aria-current={activeSection === "perfil" ? "page" : undefined} onClick={() => go("perfil")}><IconSettings />Configurações</button>
        <button type="button" className="lk-signout" onClick={onLogout}><IconLogout />Sair</button>
      </div>
    </aside>
  );
}
