import { useEffect, useId, useRef, useState } from "react";
import "./DatePicker.css";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const POPOVER_WIDTH = 300;
const POPOVER_HEIGHT = 392;

const toIso = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const fromIso = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};
const toDisplay = (value) => {
  const date = fromIso(value);
  return date ? date.toLocaleDateString("pt-BR") : "";
};
// "31032026" ou "31/03/2026" -> "2026-03-31", apenas se a data existir de fato.
const parseTyped = (text) => {
  const digits = text.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const day = Number(digits.slice(0, 2)), month = Number(digits.slice(2, 4)), year = Number(digits.slice(4));
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? toIso(date) : null;
};
const maskTyped = (text) => {
  const digits = text.replace(/\D/g, "").slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join("/");
};
const addMonths = (date, months) => {
  const result = new Date(date.getFullYear(), date.getMonth() + months, 1, 12);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(date.getDate(), lastDay));
  return result;
};

const SHORTCUTS = [["+6 meses", 6], ["+1 ano", 12], ["+2 anos", 24]];

/** Campo de data com calendário próprio (valor no formato AAAA-MM-DD, como o input nativo). */
export default function DatePicker({ value, onChange, required, id, placeholder = "dd/mm/aaaa" }) {
  const autoId = useId();
  const inputId = id || autoId;
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const popoverRef = useRef(null);
  const [text, setText] = useState(toDisplay(value));
  const [position, setPosition] = useState(null);
  const [view, setView] = useState(() => fromIso(value) || new Date());
  const open = position !== null;
  const selected = fromIso(value);
  const today = new Date();

  useEffect(() => { setText(toDisplay(value)); }, [value]);

  const openPopover = () => {
    const rect = wrapRef.current.getBoundingClientRect();
    // Posição fixa: não é cortado pela rolagem do formulário; abre para cima se faltar espaço embaixo.
    const below = rect.bottom + 6 + POPOVER_HEIGHT <= window.innerHeight;
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - POPOVER_WIDTH - 8);
    setView(selected || new Date());
    setPosition({ left, top: below ? rect.bottom + 6 : Math.max(8, rect.top - 6 - POPOVER_HEIGHT) });
  };
  const close = () => setPosition(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event) => {
      if (!wrapRef.current?.contains(event.target) && !popoverRef.current?.contains(event.target)) close();
    };
    const onKey = (event) => { if (event.key === "Escape") { event.stopPropagation(); close(); inputRef.current?.focus(); } };
    const onScroll = (event) => { if (!popoverRef.current?.contains(event.target)) close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const choose = (date) => {
    onChange(date ? toIso(date) : "");
    inputRef.current?.setCustomValidity("");
    close();
    inputRef.current?.focus();
  };

  const handleType = (event) => {
    const masked = maskTyped(event.target.value);
    setText(masked);
    const iso = parseTyped(masked);
    event.target.setCustomValidity(masked && !iso && masked.length === 10 ? "Data inválida." : "");
    if (iso) { onChange(iso); setView(fromIso(iso)); }
    else if (!masked) onChange("");
  };
  const handleBlur = () => {
    if (text && !parseTyped(text)) inputRef.current?.setCustomValidity("Informe uma data válida no formato dd/mm/aaaa.");
  };

  const year = view.getFullYear();
  const month = view.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const cells = Array.from({ length: 42 }, (_, i) => new Date(year, month, i - firstWeekday + 1, 12));
  const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const base = selected || today;

  return (
    <div className="dp" ref={wrapRef}>
      <input
        id={inputId}
        ref={inputRef}
        className="dp-input"
        value={text}
        onChange={handleType}
        onBlur={handleBlur}
        onKeyDown={(event) => { if (event.key === "ArrowDown" || (event.altKey && event.key === "ArrowDown")) { event.preventDefault(); openPopover(); } }}
        placeholder={placeholder}
        inputMode="numeric"
        autoComplete="off"
        required={required}
      />
      <button type="button" className={`dp-toggle ${open ? "active" : ""}`} aria-label="Abrir calendário" aria-haspopup="dialog" aria-expanded={open} onClick={() => (open ? close() : openPopover())}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>
      </button>

      {open && (
        <div className="dp-popover" ref={popoverRef} role="dialog" aria-label="Escolher data" style={{ left: position.left, top: position.top }}>
          <div className="dp-head">
            <button type="button" className="dp-nav" aria-label="Mês anterior" onClick={() => setView(new Date(year, month - 1, 1, 12))}>‹</button>
            <div className="dp-title">
              <select aria-label="Mês" value={month} onChange={(event) => setView(new Date(year, Number(event.target.value), 1, 12))}>
                {MONTHS.map((name, i) => <option key={name} value={i}>{name}</option>)}
              </select>
              <select aria-label="Ano" value={year} onChange={(event) => setView(new Date(Number(event.target.value), month, 1, 12))}>
                {Array.from({ length: 21 }, (_, i) => today.getFullYear() - 10 + i).concat(year < today.getFullYear() - 10 || year > today.getFullYear() + 10 ? [year] : [])
                  .sort((a, b) => a - b).map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <button type="button" className="dp-nav" aria-label="Próximo mês" onClick={() => setView(new Date(year, month + 1, 1, 12))}>›</button>
          </div>

          <div className="dp-grid" role="grid">
            {WEEKDAYS.map((day, i) => <span key={i} className="dp-weekday" aria-hidden="true">{day}</span>)}
            {cells.map((date) => {
              const outside = date.getMonth() !== month;
              return (
                <button
                  type="button"
                  key={toIso(date)}
                  className={`dp-day ${outside ? "outside" : ""} ${sameDay(date, today) ? "today" : ""} ${sameDay(date, selected) ? "selected" : ""}`}
                  aria-label={date.toLocaleDateString("pt-BR", { dateStyle: "full" })}
                  aria-pressed={sameDay(date, selected)}
                  onClick={() => choose(date)}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="dp-shortcuts" aria-label="Atalhos a partir da data atual">
            {SHORTCUTS.map(([label, months]) => (
              <button type="button" key={label} title={`${label} a partir de ${base.toLocaleDateString("pt-BR")}`} onClick={() => choose(addMonths(base, months))}>{label}</button>
            ))}
          </div>

          <div className="dp-foot">
            <button type="button" className="dp-link" onClick={() => choose(null)}>Limpar</button>
            <button type="button" className="dp-link strong" onClick={() => choose(new Date())}>Hoje</button>
          </div>
        </div>
      )}
    </div>
  );
}
