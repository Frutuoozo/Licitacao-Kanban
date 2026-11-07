import { useState } from "react";

// Gráfico de colunas com uma contagem por mês (12 meses), feito em HTML/CSS (estilos em DashboardPage.css).
// Segue o padrão de visualização do sistema: colunas finas com ponta arredondada, número só nos meses
// com valor, marca discreta nos meses zerados, mês atual em negrito no eixo, dica ao passar o mouse ou
// focar pelo teclado, e uma tabela oculta para leitores de tela.
// Cada mês: { key, label, year, showYear, isCurrent, fullLabel, count, names: [] }.

const monthFormat = new Intl.DateTimeFormat("pt-BR", { month: "short" });
const fullMonthFormat = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

// 12 meses a partir de `start` (primeiro dia do mês). `pick` devolve a data de cada item (ou null).
export function monthlyCounts(start, items, pick, nameOf) {
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const date = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const inMonth = items.filter((item) => {
      const d = pick(item);
      return d && d.getFullYear() === date.getFullYear() && d.getMonth() === date.getMonth();
    });
    return {
      key: `${date.getFullYear()}-${date.getMonth()}`,
      label: monthFormat.format(date).replace(".", ""),
      year: date.getFullYear(),
      // Ano embaixo do mês: em janeiro e no primeiro mês (este só se janeiro não vier logo depois, para os
      // dois anos não ficarem colados num gráfico estreito).
      showYear: date.getMonth() === 0 || (i === 0 && date.getMonth() < 10),
      isCurrent: date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth(),
      fullLabel: fullMonthFormat.format(date),
      count: inMonth.length,
      names: inMonth.map(nameOf).filter(Boolean),
    };
  });
}

export default function MonthColumnChart({ months, describe, title, onSelect }) {
  const [active, setActive] = useState(null);
  const max = Math.max(1, ...months.map((m) => m.count));
  const current = months.find((m) => m.key === active);
  const currentIndex = months.findIndex((m) => m.key === active);

  return (
    <div className="lk-mchart">
      <div className="lk-mchart-plot" onPointerLeave={() => setActive(null)}>
        {months.map((m) => (
          <button
            type="button"
            key={m.key}
            className={`lk-mchart-col${m.key === active ? " is-active" : ""}`}
            onPointerEnter={() => setActive(m.key)}
            onFocus={() => setActive(m.key)}
            onBlur={() => setActive(null)}
            onClick={onSelect}
            aria-label={`${m.fullLabel}: ${describe(m.count)}`}
          >
            <span className="lk-mchart-value" aria-hidden="true">{m.count > 0 ? m.count : ""}</span>
            <span className={`lk-mchart-bar${m.count ? "" : " is-zero"}`} style={m.count ? { height: `calc((100% - 18px) * ${m.count / max})` } : undefined} aria-hidden="true" />
          </button>
        ))}
        {current && (
          <div className={`lk-mchart-tip${currentIndex >= months.length / 2 ? " is-left" : ""}`} role="presentation" style={{ "--col": currentIndex }}>
            <strong>{describe(current.count)}</strong>
            <small>{current.fullLabel}</small>
            {current.names.length > 0 && (
              <ul>
                {current.names.slice(0, 3).map((name, i) => <li key={i}>{name}</li>)}
                {current.names.length > 3 && <li>e mais {current.names.length - 3}</li>}
              </ul>
            )}
          </div>
        )}
      </div>
      <div className="lk-mchart-axis" aria-hidden="true">
        {months.map((m) => <span key={m.key} className={m.isCurrent ? "is-current" : undefined}>{m.label}{m.showYear && <small>{m.year}</small>}</span>)}
      </div>
      {/* Tabela só para leitores de tela. Fica dentro de uma div escondida: tabelas ignoram height:1px
          e, escondidas direto, esticariam a página para baixo do painel. */}
      <div className="lk-sr">
        <table>
          <caption>{title}</caption>
          <thead><tr><th scope="col">Mês</th><th scope="col">Quantidade</th></tr></thead>
          <tbody>{months.map((m) => <tr key={m.key}><th scope="row">{m.fullLabel}</th><td>{m.count}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}
