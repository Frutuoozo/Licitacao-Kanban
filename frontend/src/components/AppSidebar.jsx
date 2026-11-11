import { Fragment, useState } from "react";
import { IconDashboard, IconInbox, IconKanban, IconFileText, IconUsers, IconShield, IconSettings, IconLogout, IconMoon, IconSun, IconChevron } from "../icons";

// Abas de Processos: no celular ficam no menu, como subitens de "Processos" (o CSS só as mostra com o menu recolhido).
const PROCESS_TABS = [["board", "Quadro"], ["calendar", "Calendário"], ["reports", "Relatórios"], ["archive", "Arquivados"]];

export default function AppSidebar({ user, activeSection, processTab, menuOpen, onNavigate, onLogout, darkMode = false, onToggleDarkMode }) {
  const nav = [["dashboard", "Dashboard", IconDashboard], ["demandas", "Demandas", IconInbox], ["processos", "Processos", IconKanban], ["contratos", "Contratos", IconFileText], ["colaboradores", "Colaboradores", IconUsers], ...(user?.role === "admin" ? [["admin", "Administração", IconShield]] : [])];
  const go = onNavigate;
  // Subitens de Processos: começam abertos só dentro de Processos; a setinha abre e fecha.
  const [subnavOpen, setSubnavOpen] = useState(activeSection === "processos");
  return (
    <aside className={`lk-sidebar ${menuOpen ? "is-open" : ""}`}>
      <div className="lk-brand"><span className="lk-mark">LK</span><div><strong>LicitKanban</strong><small>Gestão de Licitações</small></div></div>
      <nav aria-label="Navegação principal"><p className="lk-nav-label">NAVEGAÇÃO</p>{nav.map(([id, label, Icon]) => (
        <Fragment key={id}>
          {id === "processos" ? (
            <div className="lk-nav-group">
              <button className={id === activeSection ? "selected" : ""} aria-current={id === activeSection ? "page" : undefined} onClick={() => go(id)}><Icon />{label}</button>
              <button type="button" className="lk-subnav-toggle" aria-expanded={subnavOpen} aria-controls="lk-subnav-processos" aria-label={subnavOpen ? "Fechar abas de Processos" : "Abrir abas de Processos"} onClick={() => setSubnavOpen(open => !open)}><IconChevron down /></button>
            </div>
          ) : (
            <button className={id === activeSection ? "selected" : ""} aria-current={id === activeSection ? "page" : undefined} onClick={() => go(id)}><Icon />{label}</button>
          )}
          {id === "processos" && (
            <div className="lk-subnav" id="lk-subnav-processos" hidden={!subnavOpen}>
              {PROCESS_TABS.map(([tab, tabLabel]) => {
                const current = activeSection === "processos" && processTab === tab;
                return <button key={tab} className={current ? "selected" : ""} aria-current={current ? "true" : undefined} onClick={() => go("processos", tab)}>{tabLabel}</button>;
              })}
            </div>
          )}
        </Fragment>
      ))}</nav>
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
