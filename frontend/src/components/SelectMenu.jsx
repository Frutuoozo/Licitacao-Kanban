import { useEffect, useId, useRef, useState } from "react";
import { nextOptionIndex, toggleSelection } from "./selectMenuKeys";
import "./SelectMenu.css";

// Seletor com lista própria (no lugar do <select> nativo, cuja lista é desenhada pelo navegador).
// options: [{ value, label, color?, count? }] — `color` mostra uma bolinha antes do texto; `count`, uma
// etiqueta à direita. Teclado como num seletor nativo: setas, Home/End, Enter/Espaço, Esc e Tab.
// placeholder: texto (em cinza) quando o valor não é nenhuma opção; fieldClassName: classe do campo
// (ct-field nos filtros, contract-field nos formulários); disabled: campo travado.
// multiple: várias opções ao mesmo tempo. `value` vira uma lista (vazia = a opção `allValue`, "Todas"); clicar marca ou
// desmarca e a lista continua aberta; o campo mostra os nomes escolhidos.
export default function SelectMenu({ label, value, onChange, options, placeholder, fieldClassName = "ct-field", disabled = false, multiple = false, allValue = "all" }) {
  const id = useId();
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const optionRefs = useRef([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const isSelected = (option) => (multiple
    ? (option.value === allValue ? value.length === 0 : value.includes(option.value))
    : option.value === value);
  const selectedIndex = options.findIndex(isSelected);
  const current = selectedIndex >= 0 ? options[selectedIndex] : placeholder === undefined ? options[0] : null;
  const chosen = multiple ? options.filter((option) => option.value !== allValue && value.includes(option.value)) : [];
  // Se alguma opção tem bolinha de cor, as sem cor ganham um espaço do mesmo tamanho, para os textos alinharem.
  const hasColors = options.some((option) => option.color);

  const openMenu = (index = selectedIndex) => { setActive(index < 0 ? 0 : index); setOpen(true); };
  const close = (returnFocus = true) => { setOpen(false); if (returnFocus) triggerRef.current?.focus(); };
  const choose = (option) => {
    if (!multiple) { onChange(option.value); close(); return; }
    onChange(toggleSelection(value, option.value, allValue, options.map((item) => item.value)));
    if (option.value === allValue) close();
  };

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => { if (!wrapRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // A opção ativa recebe o foco (e entra na área visível, se a lista rolar).
  useEffect(() => { if (open && active >= 0) optionRefs.current[active]?.focus(); }, [open, active]);

  const onTriggerKey = (event) => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      openMenu(event.key === "ArrowUp" && selectedIndex < 0 ? options.length - 1 : selectedIndex);
    }
  };
  const onMenuKey = (event) => {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key === "Tab") { close(false); return; }
    const next = nextOptionIndex(event.key, active, options.length);
    if (next !== active) { event.preventDefault(); setActive(next); }
  };

  return (
    <div className={`${fieldClassName} sm-field`} ref={wrapRef}>
      <span id={`${id}-label`}>{label}</span>
      <button type="button" ref={triggerRef} className={`sm-trigger ${open ? "open" : ""}`} disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${id}-label ${id}-value`}
        onClick={() => (open ? close() : openMenu())} onKeyDown={onTriggerKey}>
        <span id={`${id}-value`} className="sm-value">
          {chosen.length > 1 ? (
            <span className="sm-value-list">{chosen.map((option) => option.label).join(", ")}</span>
          ) : (
            <>
              {current?.color && <i className="sm-dot" style={{ background: current.color }} aria-hidden="true" />}
              {current ? current.label : <span className="sm-placeholder">{placeholder}</span>}
            </>
          )}
        </span>
        {chosen.length > 1 && <span className="sm-badge" aria-hidden="true">{chosen.length}</span>}
        <svg className="sm-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="sm-menu" role="listbox" aria-labelledby={`${id}-label`} aria-multiselectable={multiple || undefined} onKeyDown={onMenuKey}>
          {options.map((option, index) => {
            const selected = isSelected(option);
            return (
              <button type="button" role="option" aria-selected={selected} key={option.value} tabIndex={index === active ? 0 : -1}
                ref={(element) => { optionRefs.current[index] = element; }}
                className={`sm-option ${selected ? "selected" : ""}`}
                onMouseEnter={() => setActive(index)} onClick={() => choose(option)}>
                {option.color ? <i className="sm-dot" style={{ background: option.color }} aria-hidden="true" /> : hasColors && <i className="sm-dot sm-dot-empty" aria-hidden="true" />}
                <span className="sm-option-label">{option.label}</span>
                {option.count !== undefined && <span className="sm-count">{option.count}</span>}
                <svg className="sm-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
