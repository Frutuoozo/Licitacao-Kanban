import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconArchive,
  IconCalendar,
  IconClose,
  IconEdit,
  IconFileText,
  IconGrid,
  IconViewCards,
  IconViewList,
  IconList,
  IconPlus,
  IconTrash,
  IconUnarchive,
  IconUser,
} from "../icons";
import { authFetch, API_URL } from "../authFetch";
import { useAppSettings } from "../appSettings";
import { formatDate as formatPreferredDate, formatDateTime, usePreferences } from "../preferences";
import DatePicker from "../components/DatePicker";
import { downloadCsv, printTable } from "../exportTable";
import "./ContratosPage.css";

// O leitor de PDF (PDF.js) só é baixado quando um documento é aberto.
const PdfViewer = lazy(() => import("../components/PdfViewer"));

const EMPTY_FORM = {
  processName: "",
  objectDescription: "",
  processNumber: "",
  contractValue: "",
  valueVariable: false,
  dueDate: "",
  fiscalEffective: "",
  fiscalSubstitute: "",
  modality: "",
  lawType: "new",
};

const LAW_INFO = {
  old: { short: "Lei antiga", label: "Lei 8.666/93" },
  new: { short: "Lei nova", label: "Lei 14.133/21" },
};

function parseLocalDate(value) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Datas na tela seguem a preferência (15/10/2026 ou 15 de out. de 2026); o CSV usa sempre o formato numérico.
function formatDate(value) {
  return parseLocalDate(value) ? formatPreferredDate(String(value).slice(0, 10)) : "—";
}
function formatNumericDate(value) {
  const date = parseLocalDate(value);
  return date ? date.toLocaleDateString("pt-BR") : "";
}

function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return number.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Valor exibido do contrato: "Variável" quando não há valor definido.
function formatContractValue(contract) {
  return contract.valueVariable ? "Variável" : formatMoney(contract.contractValue);
}

function moneyInputToNumber(value) {
  const clean = String(value).replace(/[^\d,.-]/g, "");
  if (!clean) return NaN;
  return Number(clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean);
}

// Regras de vigência (as mesmas do backend):
// - Ativo: faltam mais de 3 meses para vencer.
// - Perto do vencimento: faltam 3 meses ou menos. Entra em renovação se tiver menos de 4 aditivos;
//   com 4 aditivos, precisa de nova contratação.
// - Encerrado: passou do vencimento ou foi encerrado manualmente. Vencido (sem encerramento manual)
//   ainda aceita aditivo, para prorrogar ou registrar aditivos de contratos antigos.
const NEAR_DAYS = 90;
const MAX_AMENDMENTS = 4;

function daysUntil(value) {
  const dueDate = parseLocalDate(value);
  if (!dueDate) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((dueDate - today) / 86400000);
}

function getContractStatus(contract) {
  const days = daysUntil(contract.dueDate);
  const amendments = contract.amendmentCount || 0;
  const amendmentsLeft = MAX_AMENDMENTS - amendments;
  if (contract.closedAt) {
    return { key: "closed", manual: true, days, amendments, canAmend: false, label: "Encerrado", tone: "gray", css: "expired" };
  }
  if (days !== null && days < 0) {
    const canAmend = amendmentsLeft > 0;
    return { key: "closed", manual: false, days, amendments, canAmend, label: "Encerrado", tone: "gray", css: "expired" };
  }
  if (days !== null && days <= NEAR_DAYS) {
    const renewable = amendmentsLeft > 0;
    return {
      key: "near", days, amendments, renewable, canAmend: renewable,
      label: renewable ? "Para renovação" : "Nova contratação", tone: renewable ? "purple" : "amber", css: "soon",
    };
  }
  return { key: "regular", days, amendments, canAmend: amendmentsLeft > 0, label: "Ativo", tone: "green", css: "regular" };
}

// Data em que o contrato deixou de vigorar: encerramento manual ou vencimento.
const endedOn = (contract) => contract.closedAt || contract.dueDate || "";

function remainingText(status, contract) {
  const { days } = status;
  if (contract.closedAt) return `Encerrado manualmente em ${formatDate(contract.closedAt)}`;
  if (days === null) return "Sem data de vencimento";
  if (days < 0) {
    const ago = `Venceu há ${-days} ${-days === 1 ? "dia" : "dias"}`;
    return status.canAmend ? `${ago} · ainda é possível lançar aditivo` : ago;
  }
  if (days === 0) return "Vence hoje";
  return `Faltam ${days} ${days === 1 ? "dia" : "dias"}`;
}

// Opções de vigência dependem da aba: vigentes olham para frente, encerrados para trás.
const VIGENCIA_FILTERS = {
  active: [
    { value: "all", label: "Todas as vigências" },
    { value: "30", label: "Vencem em 30 dias" },
    { value: "90", label: "Vencem em 90 dias" },
    { value: "year", label: "Vencem este ano" },
    { value: "later", label: "Vencem após este ano" },
  ],
  closed: [
    { value: "all", label: "Todos os encerrados" },
    { value: "closed30", label: "Encerrados há até 30 dias" },
    { value: "closedYear", label: "Encerrados este ano" },
    { value: "closedBefore", label: "Encerrados em anos anteriores" },
  ],
  renewal: [
    { value: "all", label: "Todas as vigências" },
    { value: "30", label: "Vencem em 30 dias" },
    { value: "90", label: "Vencem em 90 dias" },
  ],
  all: [
    { value: "all", label: "Todas as vigências" },
    { value: "30", label: "Vencem em 30 dias" },
    { value: "90", label: "Vencem em 90 dias" },
    { value: "year", label: "Vencem este ano" },
    { value: "later", label: "Vencem após este ano" },
    { value: "closed30", label: "Encerrados há até 30 dias" },
    { value: "closedYear", label: "Encerrados este ano" },
    { value: "closedBefore", label: "Encerrados em anos anteriores" },
  ],
};
const VIEW_KEY = "lk-contracts-view";

function formatShortDate(value) {
  const date = parseLocalDate(value);
  if (!date) return "—";
  const long = formatPreferredDate(String(value).slice(0, 10));
  return long.includes("/") ? date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : long;
}

function matchesVigencia(contract, filter) {
  if (filter === "all") return true;
  const status = getContractStatus(contract);
  if (filter.startsWith("closed")) {
    if (status.key !== "closed") return false;
    const ended = parseLocalDate(endedOn(contract));
    if (!ended) return false;
    if (filter === "closed30") return daysUntil(endedOn(contract)) >= -30;
    return filter === "closedYear" ? ended.getFullYear() === new Date().getFullYear() : ended.getFullYear() < new Date().getFullYear();
  }
  if (status.key === "closed" || status.days === null) return false;
  if (filter === "30") return status.days <= 30;
  if (filter === "90") return status.days <= 90;
  const year = parseLocalDate(contract.dueDate).getFullYear();
  const thisYear = new Date().getFullYear();
  return filter === "year" ? year === thisYear : year > thisYear;
}

// Exporta os contratos exibidos no formato escolhido nas Preferências (CSV ou PDF).
function exportContracts(contracts, format) {
  const header = ["Nº do processo", "Processo", "Objeto", "Modalidade", "Lei", "Fiscal efetivo", "Fiscal substituto", "Vencimento", "Valor", "Aditivos", "Situação", "Encerrado em", "Motivo do encerramento"];
  const rows = contracts.map((c) => [
    c.processNumber, c.processName, c.objectDescription, c.modality, (LAW_INFO[c.lawType] || LAW_INFO.new).label,
    c.fiscalEffective, c.fiscalSubstitute || "", formatNumericDate(c.dueDate),
    c.valueVariable ? "Variável" : Number(c.contractValue).toLocaleString("pt-BR", { minimumFractionDigits: 2 }), `${c.amendmentCount || 0}/${MAX_AMENDMENTS}`,
    getContractStatus(c).label, c.closedAt ? formatNumericDate(c.closedAt) : "", c.closedReason || "",
  ]);
  if (format === "pdf") {
    // No PDF ficam as colunas que cabem numa folha deitada.
    const pick = [0, 1, 3, 5, 7, 8, 9, 10];
    const ok = printTable({ title: "Contratos", subtitle: "Contratos exibidos com os filtros atuais", header: pick.map((i) => header[i]), rows: rows.map((row) => pick.map((i) => row[i])) });
    if (!ok) window.alert("O navegador bloqueou a janela do PDF. Permita pop-ups para este site e tente de novo.");
    return;
  }
  downloadCsv(`contratos-${new Date().toISOString().slice(0, 10)}.csv`, header, rows);
}

export function RowMenu({ contract, actions, label }) {
  const [position, setPosition] = useState(null);
  const ref = useRef(null);
  const open = position !== null;
  const setOpen = (next) => {
    if (!next) { setPosition(null); return; }
    // Posição fixa calculada a partir do botão: o menu não é cortado pela rolagem horizontal da tabela.
    // Dividido pelo zoom da preferência de tamanho da letra (o menu fica dentro do conteúdo ampliado).
    const zoom = ref.current.currentCSSZoom || 1;
    const r = ref.current.getBoundingClientRect();
    const rect = { top: r.top / zoom, bottom: r.bottom / zoom, right: r.right / zoom };
    const menuHeight = 44 + actions.length * 36;
    const top = rect.bottom + 6 + menuHeight > window.innerHeight / zoom ? rect.top - 6 - menuHeight : rect.bottom + 6;
    setPosition({ top, right: window.innerWidth / zoom - rect.right });
  };
  useEffect(() => {
    if (!open) return;
    const close = (event) => { if (!ref.current?.contains(event.target)) setPosition(null); };
    const onKey = (event) => { if (event.key === "Escape") setPosition(null); };
    const dismiss = () => setPosition(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [open]);
  return (
    <div className="ct-row-menu" ref={ref}>
      <button type="button" className="ct-row-menu-trigger" aria-label={label || `Ações do contrato ${contract.processNumber}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>•••</button>
      {open && (
        <div className="ct-row-menu-list" role="menu" style={{ top: position.top, right: position.right }}>
          {actions.map((action) => (
            <button type="button" role="menuitem" key={action.key} className={action.danger ? "danger" : ""} onClick={() => { setOpen(false); action.run(contract); }}>
              {action.icon} {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Abre os detalhes ao clicar ou ao pressionar Enter/Espaço, sem disparar a partir de botões internos.
// Também usada pelas Demandas (cards e tabela).
export function openableProps(contract, onOpen, label) {
  const isInner = (event) => event.target.closest("button, a, input, select, textarea");
  return {
    tabIndex: 0,
    role: "button",
    "aria-label": label,
    onClick: (event) => { if (!isInner(event)) onOpen(contract); },
    onKeyDown: (event) => {
      if ((event.key === "Enter" || event.key === " ") && !isInner(event) && event.target === event.currentTarget) {
        event.preventDefault();
        onOpen(contract);
      }
    },
  };
}

// Ações disponíveis para um contrato, conforme a situação (usadas no menu •••, nos cards e no detalhe).
function contractActions(contract, handlers) {
  const status = getContractStatus(contract);
  return [
    { key: "edit", label: "Editar", icon: <IconEdit />, run: handlers.onEdit },
    contract.closedAt
      ? { key: "reopen", label: "Reabrir contrato", icon: <IconUnarchive />, run: handlers.onReopen }
      : { key: "close", label: "Encerrar contrato", icon: <IconArchive />, run: handlers.onClose },
    status.canAmend && { key: "amend", label: "Lançar aditivo", icon: <IconPlus />, run: handlers.onAmend },
    { key: "delete", label: "Excluir", icon: <IconTrash />, run: handlers.onDelete, danger: true },
  ].filter(Boolean);
}

function ContractsTable({ contracts, canEdit, handlers, onOpen }) {
  return (
    <div className="ct-table-wrap">
      <table className="ct-table">
        <thead>
          <tr>
            <th>Contrato</th><th>Objeto</th><th>Fiscal</th><th>Vigência</th><th>Valor</th><th>Situação</th>
            {canEdit && <th className="ct-col-action">Ação</th>}
          </tr>
        </thead>
        <tbody>
          {contracts.map((contract) => {
            const status = getContractStatus(contract);
            return (
              <tr key={contract.id} className="ct-row-clickable" {...openableProps(contract, onOpen, `Ver detalhes do contrato ${contract.processNumber}`)}>
                <td className="ct-col-number">
                  {contract.processNumber}
                  {contract.documentCount > 0 && <span className="ct-doc-flag" title={`${contract.documentCount} ${contract.documentCount === 1 ? "documento anexado" : "documentos anexados"}`}><IconFileText /></span>}
                </td>
                <td data-label="Objeto" className="ct-col-object"><strong>{contract.processName}</strong><span>{contract.objectDescription}</span></td>
                <td data-label="Fiscal">{contract.fiscalEffective}</td>
                <td data-label="Vigência" className="ct-col-date">{contract.dueDate ? <>até <time dateTime={contract.dueDate}>{formatShortDate(contract.dueDate)}</time></> : "—"}</td>
                <td data-label="Valor" className="ct-col-value">{formatContractValue(contract)}</td>
                <td data-label="Situação">
                  <span className={`ct-badge ${status.tone}`}>{status.label}</span>
                  <small className="ct-amend-count">{status.amendments}/{MAX_AMENDMENTS} aditivos</small>
                </td>
                {canEdit && <td className="ct-col-action"><RowMenu contract={contract} actions={contractActions(contract, handlers)} /></td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ContractCard({ contract, canEdit, handlers, onOpen }) {
  const status = getContractStatus(contract);
  const law = LAW_INFO[contract.lawType] || LAW_INFO.new;

  return (
    <article className={`contract-card contract-card-${status.css} ct-card-clickable`} {...openableProps(contract, onOpen, `Ver detalhes do contrato ${contract.processName}`)}>
      <div className="contract-card-top">
        <div className="contract-card-badges">
          <span className={`ct-badge ${status.tone}`}>{status.label}</span>
          <span className={`contract-law-badge contract-law-${contract.lawType}`}>{law.label}</span>
        </div>
        {canEdit && (
          <div className="contract-card-actions">
            {contractActions(contract, handlers).map((action) => (
              <button type="button" key={action.key} className={`icon-btn ${action.danger ? "danger" : ""}`} title={action.label} aria-label={action.label} onClick={() => action.run(contract)}>
                {action.icon}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="contract-card-title-wrap">
        <p className="contract-card-kicker">
          Processo
          {contract.documentCount > 0 && <span className="ct-doc-flag" title={`${contract.documentCount} ${contract.documentCount === 1 ? "documento anexado" : "documentos anexados"}`}><IconFileText /> {contract.documentCount}</span>}
        </p>
        <h2 className="contract-card-title" title={contract.processName}>{contract.processName}</h2>
        <p className="contract-card-object" title={contract.objectDescription}>{contract.objectDescription}</p>
      </div>

      <div className="contract-info-grid">
        <div className="contract-info-item">
          <span>Nº do processo</span>
          <strong>{contract.processNumber}</strong>
        </div>
        <div className="contract-info-item">
          <span>Modalidade</span>
          <strong>{contract.modality}</strong>
        </div>
        <div className="contract-info-item contract-value-item">
          <span>Valor do contrato</span>
          <strong>{formatContractValue(contract)}</strong>
        </div>
        <div className="contract-info-item">
          <span>Vencimento · Aditivos</span>
          <strong>{formatDate(contract.dueDate)} · {status.amendments}/{MAX_AMENDMENTS}</strong>
        </div>
      </div>

      <div className="contract-inspection">
        <div className="contract-inspection-title"><IconUser /> Fiscalização</div>
        <div className="contract-inspection-grid">
          <div>
            <span>Fiscal efetivo</span>
            <strong>{contract.fiscalEffective}</strong>
          </div>
          <div>
            <span>Fiscal substituto</span>
            <strong>{contract.fiscalSubstitute || "Não informado"}</strong>
          </div>
        </div>
      </div>
    </article>
  );
}

const DETAIL_EXIT_MS = 220;

// ── Documentos anexados (termo de contrato / termos de aditivo) ──
const DOCUMENT_TYPES = ["application/pdf", "image/png", "image/jpeg"];
const DOCUMENT_MAX_MB = 15;
const DOCUMENT_ACCEPT = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";

// Retorna a mensagem de erro, ou "" se o arquivo puder ser enviado.
function validateDocument(file) {
  if (!file) return "";
  if (!DOCUMENT_TYPES.includes(file.type)) return "Envie um arquivo PDF, PNG ou JPG.";
  if (file.size > DOCUMENT_MAX_MB * 1024 * 1024) return `O arquivo passa de ${DOCUMENT_MAX_MB} MB.`;
  return "";
}

async function uploadDocument(contractId, file, kind, eventId) {
  const headers = { "Content-Type": file.type, "X-Document-Kind": kind, "X-File-Name": encodeURIComponent(file.name) };
  if (eventId) headers["X-Event-Id"] = String(eventId);
  const response = await authFetch(`${API_URL}/api/contracts/${contractId}/documents`, { method: "POST", headers, body: file });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível anexar o documento.");
  return data;
}

const documentLabel = (doc) => doc.kind === "term" ? "Termo de contrato" : `${doc.amendmentNumber}º aditivo`;
const formatSize = (bytes) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

// Campo de arquivo no estilo do formulário (usado no cadastro e no aditivo).
function DocumentField({ label, file, onChange, current, error }) {
  const inputRef = useRef(null);
  return (
    <div className="contract-field contract-field-wide ct-file-field">
      <span>{label}</span>
      <div className={`ct-file-drop ${file ? "has-file" : ""}`}>
        <IconFileText />
        <div className="ct-file-text">
          {file ? <><strong>{file.name}</strong><small>{formatSize(file.size)}</small></>
            : current ? <><strong>{current}</strong><small>Já anexado — escolha outro arquivo para substituir</small></>
            : <><strong>Nenhum arquivo</strong><small>PDF, PNG ou JPG · até {DOCUMENT_MAX_MB} MB</small></>}
        </div>
        {file
          ? <button type="button" className="ct-file-btn" onClick={() => { onChange(null); if (inputRef.current) inputRef.current.value = ""; }}>Remover</button>
          : <button type="button" className="ct-file-btn" onClick={() => inputRef.current?.click()}>{current ? "Substituir" : "Escolher arquivo"}</button>}
        <input ref={inputRef} type="file" accept={DOCUMENT_ACCEPT} hidden onChange={(event) => onChange(event.target.files?.[0] || null)} />
      </div>
      {error && <small className="ct-file-error">{error}</small>}
    </div>
  );
}

// Carrega o arquivo autenticado e exibe via URL local (blob), sem depender de embutir o domínio da API.
function DocumentPreview({ contractId, doc }) {
  const [url, setUrl] = useState(null);
  const [blob, setBlob] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let objectUrl = null;
    let live = true;
    setUrl(null);
    setBlob(null);
    setError("");
    authFetch(`${API_URL}/api/contracts/${contractId}/documents/${doc.id}/file`)
      .then((res) => { if (!res.ok) throw new Error(); return res.blob(); })
      .then((file) => {
        objectUrl = URL.createObjectURL(file);
        if (live) { setUrl(objectUrl); setBlob(file); } else URL.revokeObjectURL(objectUrl);
      })
      .catch(() => { if (live) setError("Não foi possível abrir o documento."); });
    return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [contractId, doc.id]);

  return (
    <div className="ct-viewer-frame">
      {error ? <p className="ct-viewer-empty">{error}</p>
        : !url ? <p className="ct-viewer-empty"><span className="contracts-spinner" />Carregando documento…</p>
        : doc.mimeType === "application/pdf" ? (
          <Suspense fallback={<p className="ct-viewer-empty"><span className="contracts-spinner" />Carregando leitor…</p>}>
            <PdfViewer blob={blob} fileName={doc.fileName} fileUrl={url} />
          </Suspense>
        )
        : <div className="ct-viewer-image"><img src={url} alt={`${documentLabel(doc)} — ${doc.fileName}`} /></div>}
      {url && doc.mimeType !== "application/pdf" && (
        <div className="ct-viewer-links">
          <a href={url} target="_blank" rel="noreferrer">Abrir em nova aba</a>
          <a href={url} download={doc.fileName}>Baixar</a>
        </div>
      )}
    </div>
  );
}

// Visualizador com abas: termo de contrato + um termo por aditivo (anexar/substituir/remover para quem edita).
function DocumentViewer({ contract, documents, amendments, canEdit, onChanged, onCloseViewer }) {
  const termDoc = documents.find((doc) => doc.kind === "term");
  const tabs = [
    { key: "term", label: "Termo de contrato", doc: termDoc, kind: "term", eventId: null },
    ...amendments.map((event) => ({
      key: `a${event.id}`, label: `${event.amendmentNumber}º aditivo`, kind: "amendment", eventId: event.id,
      doc: documents.find((doc) => doc.kind === "amendment" && doc.eventId === event.id),
    })),
  ];
  const [active, setActive] = useState(tabs.find((tab) => tab.doc)?.key || "term");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const { settings } = useAppSettings();
  const inputRef = useRef(null);
  const tab = tabs.find((item) => item.key === active) || tabs[0];

  const send = async (file) => {
    const problem = validateDocument(file);
    if (problem) { setError(problem); return; }
    setBusy(true); setError("");
    try { onChanged(await uploadDocument(contract.id, file, tab.kind, tab.eventId)); }
    catch (uploadError) { setError(uploadError.message); }
    finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
  };
  const remove = async () => {
    if (!tab.doc) return;
    setBusy(true); setError("");
    try {
      const response = await authFetch(`${API_URL}/api/contracts/${contract.id}/documents/${tab.doc.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível remover o documento.");
      setConfirmRemove(false);
      onChanged(data);
    } catch (removeError) { setError(removeError.message); setConfirmRemove(false); }
    finally { setBusy(false); }
  };

  return (
    <section className="ct-viewer" aria-label="Documentos do contrato">
      <header className="ct-viewer-head">
        <div className="ct-viewer-tabs" role="tablist">
          {tabs.map((item) => (
            <button type="button" role="tab" key={item.key} aria-selected={item.key === active} className={item.key === active ? "active" : ""} onClick={() => { setActive(item.key); setError(""); }}>
              {item.label}{!item.doc && <span className="ct-viewer-missing" title="Sem documento anexado">•</span>}
            </button>
          ))}
        </div>
        {onCloseViewer && <button type="button" className="ct-detail-close" onClick={onCloseViewer} aria-label="Fechar documento"><IconClose /></button>}
      </header>
      {tab.doc && (
        <div className="ct-viewer-meta">
          <span title={tab.doc.fileName}><strong>{tab.doc.fileName}</strong> · {formatSize(tab.doc.sizeBytes)}{tab.doc.userName ? ` · enviado por ${tab.doc.userName}` : ""}</span>
          {canEdit && (
            <span className="ct-viewer-actions">
              <button type="button" onClick={() => inputRef.current?.click()} disabled={busy}>Substituir</button>
              <button type="button" className="danger" onClick={() => (settings.confirmBeforeDelete ? setConfirmRemove(true) : remove())} disabled={busy}>Remover</button>
            </span>
          )}
        </div>
      )}
      {error && <p className="ct-file-error ct-viewer-error">{error}</p>}
      {tab.doc ? <DocumentPreview key={tab.doc.id} contractId={contract.id} doc={tab.doc} /> : (
        <div className="ct-viewer-frame ct-viewer-placeholder">
          <IconFileText />
          <strong>{tab.label}: nenhum documento anexado</strong>
          <p>PDF, PNG ou JPG · até {DOCUMENT_MAX_MB} MB</p>
          {canEdit && <button type="button" className="ct-detail-edit" onClick={() => inputRef.current?.click()} disabled={busy}>{busy ? "Enviando…" : `Anexar ${tab.kind === "term" ? "termo de contrato" : `termo do ${tab.label}`}`}</button>}
        </div>
      )}
      <input ref={inputRef} type="file" accept={DOCUMENT_ACCEPT} hidden onChange={(event) => event.target.files?.[0] && send(event.target.files[0])} />

      {/* Mesma confirmação usada para excluir contrato. */}
      {confirmRemove && tab.doc && (
        <div className="contract-modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && !busy && setConfirmRemove(false)}
          onKeyDown={(event) => { if (event.key === "Escape" && !busy) { event.stopPropagation(); setConfirmRemove(false); } }}>
          <div className="contract-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="ct-doc-remove-title">
            <div className="contract-delete-icon"><IconTrash /></div>
            <h2 id="ct-doc-remove-title">Remover este documento?</h2>
            <p>O arquivo <strong>{tab.doc.fileName}</strong> ({tab.label}) será removido do contrato. A remoção fica registrada no histórico.</p>
            <div className="contract-delete-actions">
              <button type="button" className="btn-cancel-lg" onClick={() => setConfirmRemove(false)} disabled={busy} autoFocus>Cancelar</button>
              <button type="button" className="btn-danger" onClick={remove} disabled={busy}>{busy ? "Removendo..." : "Remover documento"}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// Largura mínima para mostrar o documento ao lado das informações.
function useWideScreen(query = "(min-width: 1100px)") {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setWide(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return wide;
}

const HISTORY_TITLES = {
  created: "Termo de contrato",
  edited: "Contrato editado",
  closed: "Contrato encerrado",
  reopened: "Contrato reaberto",
  document: "Documento",
};

// Formata valores do histórico de edição conforme o campo alterado.
function formatChangeValue(field, value) {
  if (field === "valueVariable") return value === true || value === "true" ? "Sim" : "Não";
  if (value === "" || value === null || value === undefined) return "—";
  if (field === "dueDate") return formatDate(value);
  if (field === "contractValue") return formatMoney(value);
  if (field === "lawType") return (LAW_INFO[value] || LAW_INFO.new).label;
  return String(value);
}

// Histórico e documentos do contrato, recarregados sempre que o contrato muda.
function useContractRecords(contract) {
  const [events, setEvents] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [error, setError] = useState("");
  const refreshKey = `${contract.updatedAt}-${contract.amendmentCount}-${contract.closedAt}-${contract.documentCount}`;
  useEffect(() => {
    let live = true;
    setError("");
    Promise.all([
      authFetch(`${API_URL}/api/contracts/${contract.id}/history`).then((res) => { if (!res.ok) throw new Error(); return res.json(); }),
      authFetch(`${API_URL}/api/contracts/${contract.id}/documents`).then((res) => (res.ok ? res.json() : [])),
    ])
      .then(([history, docs]) => {
        if (!live) return;
        setEvents(Array.isArray(history) ? history : []);
        setDocuments(Array.isArray(docs) ? docs : []);
      })
      .catch(() => { if (live) setError("Não foi possível carregar o histórico."); });
    return () => { live = false; };
  }, [contract.id, refreshKey]);
  return { events, documents, error };
}

function ContractHistory({ events, error }) {
  if (error) return <p className="ct-history-empty">{error}</p>;
  if (events === null) return <p className="ct-history-empty">Carregando histórico…</p>;
  if (events.length === 0) return <p className="ct-history-empty">Nenhum registro no histórico.</p>;

  // Mais recente primeiro.
  return (
    <ol className="ct-history">
      {[...events].reverse().map((event) => {
        const title = event.type === "amendment" ? `${event.amendmentNumber}º aditivo` : HISTORY_TITLES[event.type] || "Registro";
        const stamp = new Date(event.createdAt);
        return (
          <li key={event.id} className={`ct-history-item ${event.type}`}>
            <span className="ct-history-dot" aria-hidden="true" />
            <div className="ct-history-content">
              <div className="ct-history-head">
                <strong>{title}</strong>
                <time dateTime={event.eventDate}>{formatDate(event.eventDate)}</time>
              </div>
              {event.type === "created" && event.newDueDate && (
                <p>Vigência até {formatDate(event.newDueDate)} · {event.newValueVariable ? "Valor variável" : formatMoney(event.newValue)}</p>
              )}
              {event.type === "amendment" && (
                <>
                  <p>Vencimento: {formatDate(event.previousDueDate)} → <b>{formatDate(event.newDueDate)}</b></p>
                  {(() => {
                    const before = event.previousValueVariable ? "Variável" : formatMoney(event.previousValue);
                    const after = event.newValueVariable ? "Variável" : formatMoney(event.newValue);
                    return before !== after
                      ? <p>Valor: {before} → <b>{after}</b></p>
                      : <p>Valor mantido: {after}</p>;
                  })()}
                </>
              )}
              {event.type === "edited" && (
                <ul className="ct-history-changes">
                  {event.changes.map((change) => (
                    <li key={change.field}>
                      <span>{change.label}:</span> {formatChangeValue(change.field, change.from)} → <b>{formatChangeValue(change.field, change.to)}</b>
                    </li>
                  ))}
                </ul>
              )}
              {event.notes && event.type === "document" && <p>{event.notes}</p>}
              {event.notes && event.type !== "created" && event.type !== "document" && <p className="ct-history-notes">“{event.notes}”</p>}
              <small>
                {event.userName ? `${event.userName} · ` : ""}
                {Number.isFinite(stamp.getTime()) ? formatDateTime(stamp.toISOString(), "") : ""}
              </small>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ContractDetails({ contract, canEdit, onClose, handlers, onContractChange }) {
  const closeRef = useRef(null);
  const wide = useWideScreen();
  const [viewerOpen, setViewerOpen] = useState(false);
  const { events, documents, error: recordsError } = useContractRecords(contract);
  const amendmentEvents = (events || []).filter((event) => event.type === "amendment");
  const [closing, setClosing] = useState(false);
  // Toca a animação de saída antes de desmontar o painel.
  const requestClose = useCallback((then) => {
    setClosing(true);
    setTimeout(() => (then || onClose)(), DETAIL_EXIT_MS);
  }, [onClose]);
  const status = getContractStatus(contract);
  const law = LAW_INFO[contract.lawType] || LAW_INFO.new;
  const amendmentsLeft = MAX_AMENDMENTS - status.amendments;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event) => { if (event.key === "Escape") requestClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [requestClose]);

  return (
    <div className={`ct-detail-overlay ${closing ? "closing" : ""}`} onMouseDown={(event) => event.target === event.currentTarget && requestClose()}>
      <aside className={`ct-detail ${wide ? "with-viewer" : ""}`} role="dialog" aria-modal="true" aria-labelledby="ct-detail-title">
        {wide && events && (
          <DocumentViewer key={contract.id} contract={contract} documents={documents} amendments={amendmentEvents} canEdit={canEdit} onChanged={onContractChange} />
        )}
        {!wide && viewerOpen && events && (
          <div className="ct-viewer-fullscreen">
            <DocumentViewer key={contract.id} contract={contract} documents={documents} amendments={amendmentEvents} canEdit={canEdit}
              onChanged={onContractChange} onCloseViewer={() => setViewerOpen(false)} />
          </div>
        )}
        <div className="ct-detail-main">
        <header className="ct-detail-header">
          <div>
            <span className="ct-detail-number">{contract.processNumber}</span>
            <h2 id="ct-detail-title">{contract.processName}</h2>
            <div className="ct-detail-badges">
              <span className={`ct-badge ${status.tone}`}>{status.label}</span>
              <span className={`contract-law-badge contract-law-${contract.lawType}`}>{law.label}</span>
            </div>
          </div>
          <button type="button" className="ct-detail-close" ref={closeRef} onClick={() => requestClose()} aria-label="Fechar detalhes"><IconClose /></button>
        </header>

        <div className="ct-detail-body">
          <section className="ct-detail-highlight">
            <div><span>Valor do contrato</span><strong>{formatContractValue(contract)}</strong></div>
            <div><span>Vencimento</span><strong>{formatDate(contract.dueDate)}</strong><small className={`tone-${status.tone}`}>{remainingText(status, contract)}</small></div>
          </section>

          <section className="ct-detail-section">
            <h3>Aditivos</h3>
            <div className="ct-amend-meter" aria-label={`${status.amendments} de ${MAX_AMENDMENTS} aditivos usados`}>
              {Array.from({ length: MAX_AMENDMENTS }, (_, i) => <span key={i} className={i < status.amendments ? "used" : ""} />)}
            </div>
            <p className="ct-detail-text">
              {status.amendments} de {MAX_AMENDMENTS} aditivos usados.{" "}
              {amendmentsLeft > 0
                ? `${amendmentsLeft === 1 ? "Resta 1 aditivo" : `Restam ${amendmentsLeft} aditivos`} antes de exigir nova contratação.`
                : "Limite atingido: ao vencer, será necessária uma nova contratação."}
            </p>
            {contract.closedAt && (
              <p className="ct-detail-closed">Encerrado manualmente em {formatDate(contract.closedAt)}{contract.closedReason ? ` — “${contract.closedReason}”` : ""}.</p>
            )}
          </section>

          {!wide && (
            <section className="ct-detail-section">
              <h3>Documentos</h3>
              <button type="button" className="ct-docs-open" onClick={() => setViewerOpen(true)}>
                <IconFileText />
                <span>
                  <strong>Ver termo de contrato e aditivos</strong>
                  <small>{documents.length ? `${documents.length} ${documents.length === 1 ? "documento anexado" : "documentos anexados"}` : "Nenhum documento anexado"}</small>
                </span>
              </button>
            </section>
          )}

          <section className="ct-detail-section">
            <h3>Objeto</h3>
            <p className="ct-detail-text">{contract.objectDescription || "—"}</p>
          </section>

          <section className="ct-detail-section">
            <h3>Informações do processo</h3>
            <dl className="ct-detail-grid">
              <div><dt>Nº do processo</dt><dd>{contract.processNumber || "—"}</dd></div>
              <div><dt>Modalidade</dt><dd>{contract.modality || "—"}</dd></div>
              <div><dt>Lei aplicável</dt><dd>{law.label} ({law.short})</dd></div>
              <div><dt>Situação</dt><dd>{status.label}</dd></div>
            </dl>
          </section>

          <section className="ct-detail-section">
            <h3>Fiscalização</h3>
            <dl className="ct-detail-grid">
              <div><dt>Fiscal efetivo</dt><dd>{contract.fiscalEffective || "—"}</dd></div>
              <div><dt>Fiscal substituto</dt><dd>{contract.fiscalSubstitute || "Não informado"}</dd></div>
            </dl>
          </section>

          <section className="ct-detail-section">
            <h3>Histórico</h3>
            <ContractHistory events={events} error={recordsError} />
          </section>
        </div>

        {canEdit && (
          <footer className="ct-detail-footer">
            <button type="button" className="ct-detail-delete" onClick={() => handlers.onDelete(contract)}><IconTrash /> Excluir</button>
            <div className="ct-detail-footer-main">
              {contract.closedAt
                ? <button type="button" className="ct-detail-secondary" onClick={() => handlers.onReopen(contract)}><IconUnarchive /> Reabrir</button>
                : <button type="button" className="ct-detail-secondary" onClick={() => handlers.onClose(contract)}><IconArchive /> Encerrar</button>}
              {status.canAmend && <button type="button" className="ct-detail-secondary" onClick={() => handlers.onAmend(contract)}><IconPlus /> Aditivo</button>}
              <button type="button" className="ct-detail-edit" onClick={() => handlers.onEdit(contract)}><IconEdit /> Editar</button>
            </div>
          </footer>
        )}
        </div>
      </aside>
    </div>
  );
}

// Aditivo: nova data de vencimento obrigatória; valor mantido ou alterado (caixa para marcar).
function AmendmentModal({ contract, saving, error, onClose, onSubmit }) {
  const [newDueDate, setNewDueDate] = useState("");
  const [valueVariable, setValueVariable] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState(null);
  const fileError = validateDocument(file);
  const number = (contract.amendmentCount || 0) + 1;
  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape" && !saving) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);
  return (
    <div className="ct-detail-overlay ct-form-overlay" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <div className="contract-form-modal ct-form-drawer" role="dialog" aria-modal="true" aria-labelledby="ct-amend-title">
        <div className="contract-form-header">
          <div>
            <span className="contract-form-eyebrow">{contract.processNumber} · {number}º de {MAX_AMENDMENTS} aditivos</span>
            <h2 id="ct-amend-title">Lançar aditivo</h2>
            <p>{contract.processName}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} disabled={saving} aria-label="Fechar"><IconClose /></button>
        </div>
        <form className="contract-form" onSubmit={(event) => { event.preventDefault(); onSubmit({ newDueDate, valueVariable, newValue: valueVariable || !newValue.trim() ? null : moneyInputToNumber(newValue), notes, file }); }}>
          <div className="contract-form-body">
            {error && <div className="contract-form-error">{error}</div>}
            {daysUntil(contract.dueDate) < 0 && (
              <div className="ct-form-warning">
                Este contrato está vencido desde {formatDate(contract.dueDate)}. O aditivo vai prorrogar a vigência a partir da nova data de vencimento.
              </div>
            )}
            {number === MAX_AMENDMENTS && <div className="ct-form-warning">Este é o último aditivo permitido. Depois dele, será necessária uma nova contratação.</div>}
            <section className="contract-form-section">
              <div className="contract-form-section-title"><div><strong>Vigência atual</strong></div></div>
              <dl className="ct-detail-grid">
                <div><dt>Vencimento atual</dt><dd>{formatDate(contract.dueDate)}</dd></div>
                <div><dt>Valor atual</dt><dd>{formatContractValue(contract)}</dd></div>
              </dl>
            </section>
            <section className="contract-form-section">
              <div className="contract-form-section-title"><div><strong>Prorrogação</strong></div></div>
              <div className="contract-form-grid">
                <label className="contract-field contract-field-wide">
                  <span>Nova data de vencimento *</span>
                  <DatePicker value={newDueDate} onChange={setNewDueDate} required />
                </label>
                <label className={`contract-field contract-field-wide ${valueVariable ? "ct-field-disabled" : ""}`}>
                  <span>Novo valor do contrato</span>
                  <div className="contract-money-field">
                    <span>R$</span>
                    <input value={valueVariable ? "" : newValue} onChange={(event) => setNewValue(event.target.value)} inputMode="decimal"
                      disabled={valueVariable} placeholder={valueVariable ? "Variável" : "0,00"} />
                  </div>
                  <small className="ct-field-note">
                    {valueVariable ? "O valor ficará como “Variável”."
                      : newValue.trim() ? "Este será o novo valor do contrato."
                      : `Deixe em branco para manter o último valor informado (${formatContractValue(contract)}).`}
                  </small>
                </label>
                <label className="ct-checkbox contract-field-wide">
                  <input type="checkbox" checked={valueVariable} onChange={(event) => setValueVariable(event.target.checked)} />
                  <span>Valor variável <em>— sem valor definido</em></span>
                </label>
                <label className="contract-field contract-field-wide">
                  <span>Observação</span>
                  <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} rows={3} placeholder="Ex.: prorrogação por mais 12 meses" />
                </label>
                <DocumentField label={`Termo do ${number}º aditivo (opcional)`} file={file} onChange={setFile} error={fileError} />
              </div>
            </section>
          </div>
          <div className="contract-form-footer">
            <button type="button" className="btn-cancel-lg" onClick={onClose} disabled={saving}><IconClose /> Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving || Boolean(fileError)}><IconPlus /> {saving ? "Salvando..." : "Registrar aditivo"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Encerrar (data + motivo opcional) ou reabrir (motivo opcional) um contrato.
function CloseReopenModal({ contract, mode, saving, error, onClose, onSubmit }) {
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const [closedAt, setClosedAt] = useState(todayIso);
  const [reason, setReason] = useState("");
  const reopening = mode === "reopen";
  return (
    <div className="contract-modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <form className="contract-delete-modal ct-close-modal" role="alertdialog" aria-modal="true" aria-labelledby="ct-close-title"
        onSubmit={(event) => { event.preventDefault(); onSubmit(reopening ? { reason } : { closedAt, reason }); }}>
        <div className={`contract-delete-icon ${reopening ? "reopen" : ""}`}>{reopening ? <IconUnarchive /> : <IconArchive />}</div>
        <h2 id="ct-close-title">{reopening ? "Reabrir este contrato?" : "Encerrar este contrato?"}</h2>
        <p>
          <strong>{contract.processName}</strong>{" "}
          {reopening ? "volta a ficar vigente, conforme a data de vencimento." : "deixa de ser vigente. Você poderá reabri-lo depois, se necessário."}
        </p>
        {error && <div className="contract-form-error">{error}</div>}
        <div className="ct-close-fields">
          {!reopening && (
            <label className="contract-field">
              <span>Data do encerramento *</span>
              <DatePicker value={closedAt} onChange={setClosedAt} required />
            </label>
          )}
          <label className="contract-field">
            <span>Motivo (opcional)</span>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3}
              placeholder={reopening ? "Ex.: encerrado por engano" : "Ex.: objeto entregue integralmente"} />
          </label>
        </div>
        <div className="contract-delete-actions">
          <button type="button" className="btn-cancel-lg" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="btn-danger" disabled={saving}>{saving ? "Salvando..." : reopening ? "Reabrir contrato" : "Encerrar contrato"}</button>
        </div>
      </form>
    </div>
  );
}

function ContractFormModal({ editing, form, setForm, modalities, collaborators, saving, error, closing, onClose, onSubmit, termFile, onTermFileChange }) {
  const availableModalities = editing?.modality && !modalities.includes(editing.modality)
    ? [editing.modality, ...modalities]
    : modalities;
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const [currentTerm, setCurrentTerm] = useState("");
  const termError = validateDocument(termFile);
  useEffect(() => {
    if (!editing?.documentCount) return;
    authFetch(`${API_URL}/api/contracts/${editing.id}/documents`)
      .then((res) => (res.ok ? res.json() : []))
      .then((docs) => setCurrentTerm(docs.find((doc) => doc.kind === "term")?.fileName || ""))
      .catch(() => {});
  }, [editing]);
  // Lista de colaboradores + nomes já salvos no contrato que não estejam mais cadastrados.
  const collaboratorNames = [...new Set([
    // Só colaboradores ativos; quem já está no contrato continua aparecendo (logo abaixo).
    ...collaborators.filter((collaborator) => collaborator.ativo !== false).map((collaborator) => collaborator.nome?.trim()).filter(Boolean),
    editing?.fiscalEffective?.trim(),
    editing?.fiscalSubstitute?.trim(),
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));

  useEffect(() => {
    const handleKeyDown = (event) => { if (event.key === "Escape" && !saving) onClose(); };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, saving]);

  return (
    <div className={`ct-detail-overlay ct-form-overlay ${closing ? "closing" : ""}`} onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <div className="contract-form-modal ct-form-drawer" role="dialog" aria-modal="true" aria-labelledby="contract-form-title">
        <div className="contract-form-header">
          <div>
            <span className="contract-form-eyebrow">{editing ? editing.processNumber : "Novo cadastro"}</span>
            <h2 id="contract-form-title">{editing ? editing.processName : "Novo contrato"}</h2>
            <p>{editing ? "Editando contrato — altere os campos e salve." : "Preencha os dados do contrato."}</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} disabled={saving} aria-label="Fechar">
            <IconClose />
          </button>
        </div>

        <form onSubmit={onSubmit} className="contract-form">
          <div className="contract-form-body">
            {error && <div className="contract-form-error">{error}</div>}

            <section className="contract-form-section">
              <div className="contract-form-section-title">
                <IconFileText />
                <div><strong>Informações do processo</strong><span>Identificação e objeto contratado</span></div>
              </div>
              <div className="contract-form-grid">
                <label className="contract-field contract-field-wide">
                  <span>Nome do processo *</span>
                  <input value={form.processName} onChange={update("processName")} maxLength={255} required autoFocus placeholder="Ex.: Manutenção preventiva dos equipamentos" />
                </label>
                <label className="contract-field contract-field-wide">
                  <span>Descrição do objeto *</span>
                  <textarea value={form.objectDescription} onChange={update("objectDescription")} maxLength={2000} required rows={4} placeholder="Descreva de forma objetiva o que foi contratado" />
                </label>
                <label className="contract-field">
                  <span>Nº do processo *</span>
                  <input value={form.processNumber} onChange={update("processNumber")} maxLength={120} required placeholder="Ex.: 2026/000123" />
                </label>
                <label className="contract-field">
                  <span>Modalidade *</span>
                  {availableModalities.length > 0 ? (
                    <select value={form.modality} onChange={update("modality")} required>
                      <option value="" disabled>Selecione a modalidade</option>
                      {availableModalities.map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                  ) : (
                    <input value={form.modality} onChange={update("modality")} maxLength={120} required placeholder="Cadastre as modalidades em Administração" />
                  )}
                </label>
                <label className="contract-field">
                  <span>Lei aplicável *</span>
                  <select value={form.lawType} onChange={update("lawType")} required>
                    <option value="new">Lei nova — 14.133/21</option>
                    <option value="old">Lei antiga — 8.666/93</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="contract-form-section">
              <div className="contract-form-section-title">
                <IconCalendar />
                <div><strong>Contrato e vigência</strong><span>Valor total e prazo atual</span></div>
              </div>
              <div className="contract-form-grid">
                <label className={`contract-field ${form.valueVariable ? "ct-field-disabled" : ""}`}>
                  <span>Valor do contrato {form.valueVariable ? "" : "*"}</span>
                  <div className="contract-money-field">
                    <span>R$</span>
                    <input value={form.valueVariable ? "" : form.contractValue} onChange={update("contractValue")} inputMode="decimal"
                      required={!form.valueVariable} disabled={form.valueVariable} placeholder={form.valueVariable ? "Variável" : "0,00"} />
                  </div>
                </label>
                <label className="contract-field">
                  <span>Vencimento *</span>
                  <DatePicker value={form.dueDate} onChange={(dueDate) => setForm((current) => ({ ...current, dueDate }))} required />
                </label>
                <label className="ct-checkbox contract-field-wide">
                  <input type="checkbox" checked={form.valueVariable} onChange={(event) => setForm((current) => ({ ...current, valueVariable: event.target.checked }))} />
                  <span>Valor variável <em>— sem valor definido</em></span>
                </label>
              </div>
            </section>

            <section className="contract-form-section">
              <div className="contract-form-section-title">
                <IconUser />
                <div><strong>Fiscalização</strong><span>Responsáveis pelo acompanhamento</span></div>
              </div>
              <div className="contract-form-grid">
                <label className="contract-field">
                  <span>Fiscal efetivo *</span>
                  <select value={form.fiscalEffective} onChange={update("fiscalEffective")} required>
                    <option value="" disabled>{collaboratorNames.length ? "Selecione um colaborador" : "Nenhum colaborador cadastrado"}</option>
                    {collaboratorNames.map((name) => <option key={name} value={name} disabled={name === form.fiscalSubstitute}>{name}</option>)}
                  </select>
                </label>
                <label className="contract-field">
                  <span>Fiscal substituto</span>
                  <select value={form.fiscalSubstitute} onChange={update("fiscalSubstitute")}>
                    <option value="">Não informado</option>
                    {collaboratorNames.map((name) => <option key={name} value={name} disabled={name === form.fiscalEffective}>{name}</option>)}
                  </select>
                </label>
                {collaboratorNames.length === 0 && <p className="contract-field-hint contract-field-wide">Cadastre colaboradores na seção Colaboradores para escolher os fiscais.</p>}
              </div>
            </section>

            <section className="contract-form-section">
              <div className="contract-form-section-title"><div><strong>Termo de contrato</strong></div></div>
              <div className="contract-form-grid">
                <DocumentField label="Arquivo do termo (opcional)" file={termFile} onChange={onTermFileChange} current={currentTerm} error={termError} />
              </div>
            </section>
          </div>

          <div className="contract-form-footer">
            <button type="button" className="btn-cancel-lg" onClick={onClose} disabled={saving}><IconClose /> Cancelar</button>
            <button type="submit" className="btn-primary" disabled={saving || Boolean(termError)}>
              {editing ? <IconEdit /> : <IconPlus />} {saving ? "Salvando..." : editing ? "Salvar alterações" : "Adicionar contrato"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Aba "Gestores": quantos contratos cada colaborador tem como gestor principal (fiscal efetivo)
// e como gestor substituto (fiscal substituto). Barras horizontais agrupadas, mesma escala.
const MANAGER_SERIES = [
  { key: "principal", label: "Gestor principal", color: "#2563eb" },
  { key: "substituto", label: "Gestor substituto", color: "#d97706" },
];

function ManagersView({ contracts, loading, onOpenContract }) {
  const [managerScope, setManagerScope] = useState("active");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [showTable, setShowTable] = useState(false);

  const rows = useMemo(() => {
    const map = new Map();
    const add = (name, field, contract) => {
      const key = (name || "").trim();
      if (!key) return;
      if (!map.has(key)) map.set(key, { name: key, principal: [], substituto: [] });
      map.get(key)[field].push(contract);
    };
    contracts
      .filter((contract) => managerScope === "all" || (managerScope === "closed") === (getContractStatus(contract).key === "closed"))
      .forEach((contract) => {
        add(contract.fiscalEffective, "principal", contract);
        add(contract.fiscalSubstitute, "substituto", contract);
      });
    return [...map.values()]
      .map((row) => ({ ...row, total: row.principal.length + row.substituto.length }))
      .sort((a, b) => b.total - a.total || b.principal.length - a.principal.length || a.name.localeCompare(b.name, "pt-BR"));
  }, [contracts, managerScope]);
  const scopedCount = contracts.filter((contract) => managerScope === "all" || (managerScope === "closed") === (getContractStatus(contract).key === "closed"));
  const withoutSubstitute = scopedCount.filter((contract) => !contract.fiscalSubstitute).length;
  const q = search.trim().toLocaleLowerCase("pt-BR");
  const visible = rows.filter((row) => !q || row.name.toLocaleLowerCase("pt-BR").includes(q));
  // Escala do eixo: arredonda o maior total para cima e gera até ~5 marcas inteiras.
  const maxTotal = Math.max(1, ...rows.map((row) => row.total));
  const step = Math.max(1, Math.ceil(maxTotal / 5));
  const axisMax = Math.ceil(maxTotal / step) * step;
  const ticks = Array.from({ length: axisMax / step + 1 }, (_, i) => i * step);
  const selectedRow = rows.find((row) => row.name === selected);

  return (
    <div className="ct-managers">
      <section className="lk-kpis ct-kpis" aria-label="Resumo dos gestores">
        {[
          ["GESTORES COM CONTRATOS", rows.length, "blue", "Colaboradores que são gestores principais ou substitutos"],
          ["COMO PRINCIPAL", rows.filter((row) => row.principal.length).length, "blue", "Colaboradores que são gestores principais de algum contrato"],
          ["COMO SUBSTITUTO", rows.filter((row) => row.substituto.length).length, "amber", "Colaboradores que são gestores substitutos de algum contrato"],
          ["SEM SUBSTITUTO", withoutSubstitute, "gray", "Contratos sem gestor substituto definido"],
        ].map(([label, value, tone, hint]) => (
          <article className={`lk-kpi ${tone}`} key={label} title={hint}>
            <h2><i aria-hidden="true" />{label}</h2>
            <strong>{loading ? "—" : value}</strong>
          </article>
        ))}
      </section>

      <section className="ct-toolbar ct-managers-toolbar" aria-label="Filtros de gestores">
        <label className="ct-field">
          <span>Buscar gestor</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome do colaborador..." />
        </label>
        <div className="ct-toolbar-actions">
          <div className="ct-view-toggle" role="group" aria-label="Contratos considerados">
            {[["active", "Vigentes"], ["all", "Todos"], ["closed", "Encerrados"]].map(([value, label]) => (
              <button type="button" key={value} className={managerScope === value ? "active" : ""} aria-pressed={managerScope === value} onClick={() => { setManagerScope(value); setSelected(null); }}>{label}</button>
            ))}
          </div>
          <div className="ct-view-toggle ct-icon-toggle" role="group" aria-label="Visualização">
            <button type="button" className={!showTable ? "active" : ""} aria-pressed={!showTable} aria-label="Gráfico" title="Gráfico" onClick={() => setShowTable(false)}><IconGrid /></button>
            <button type="button" className={showTable ? "active" : ""} aria-pressed={showTable} aria-label="Tabela" title="Tabela" onClick={() => setShowTable(true)}><IconList /></button>
          </div>
        </div>
      </section>

      <section className="ct-managers-card" aria-labelledby="ct-managers-title">
        <header className="ct-managers-head">
          <div>
            <h2 id="ct-managers-title">Contratos por gestor</h2>
            <p>Quantidade de contratos em que cada colaborador é gestor principal ou substituto. Clique num gestor para ver os contratos.</p>
          </div>
          <ul className="ct-managers-legend" aria-label="Legenda">
            {MANAGER_SERIES.map((serie) => <li key={serie.key}><i style={{ background: serie.color }} aria-hidden="true" />{serie.label}</li>)}
          </ul>
        </header>

        {loading ? <p className="ct-managers-empty">Carregando…</p>
          : visible.length === 0 ? <p className="ct-managers-empty">{rows.length ? "Nenhum gestor encontrado com essa busca." : "Nenhum contrato com gestor definido neste filtro."}</p>
          : showTable ? (
            <div className="ct-table-wrap">
              <table className="ct-table ct-managers-table">
                <thead><tr><th>Gestor</th><th>Gestor principal</th><th>Gestor substituto</th><th>Total</th></tr></thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.name} className="ct-row-clickable" onClick={() => setSelected(row.name)}>
                      <td className="ct-col-number">{row.name}</td>
                      <td data-label="Principal">{row.principal.length}</td>
                      <td data-label="Substituto">{row.substituto.length}</td>
                      <td data-label="Total"><strong>{row.total}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="ct-mchart" role="img" aria-label={`Gráfico de barras empilhadas: contratos por gestor, ${visible.length} gestores`}>
              {/* Eixo e grade ficam atrás das barras, na mesma escala de todas as linhas. */}
              <div className="ct-mchart-axis" aria-hidden="true">
                <span />
                <div className="ct-mchart-ticks">
                  {ticks.map((tick) => <span key={tick} style={{ left: `${(tick / axisMax) * 100}%` }}>{tick}</span>)}
                </div>
              </div>
              <ul className="ct-mchart-rows">
                {visible.map((row) => (
                  <li key={row.name} className={`${selected === row.name ? "selected" : ""} ${hovered === row.name ? "hovered" : ""}`}>
                    <button type="button" className="ct-mchart-row" onClick={() => setSelected(selected === row.name ? null : row.name)}
                      onMouseEnter={() => setHovered(row.name)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(row.name)} onBlur={() => setHovered(null)}
                      aria-pressed={selected === row.name}
                      aria-label={`${row.name}: ${row.principal.length} como gestor principal, ${row.substituto.length} como substituto, total ${row.total}`}>
                      <span className="ct-mchart-name" title={row.name}>{row.name}</span>
                      <span className="ct-mchart-track">
                        <span className="ct-mchart-grid" aria-hidden="true">
                          {ticks.slice(1).map((tick) => <i key={tick} style={{ left: `${(tick / axisMax) * 100}%` }} />)}
                        </span>
                        <span className="ct-mchart-bar" style={{ width: `${(row.total / axisMax) * 100}%` }}>
                          {MANAGER_SERIES.map((serie) => row[serie.key].length > 0 && (
                            <span key={serie.key} className="ct-mchart-seg" style={{ flexGrow: row[serie.key].length, background: serie.color }}>
                              {row[serie.key].length / axisMax >= 0.06 && <em>{row[serie.key].length}</em>}
                            </span>
                          ))}
                        </span>
                        <span className="ct-mchart-total" style={{ left: `${(row.total / axisMax) * 100}%` }}>{row.total}</span>
                      </span>
                    </button>
                    {hovered === row.name && (
                      <span className="ct-managers-tip" role="tooltip">
                        <strong>{row.name}</strong>
                        {MANAGER_SERIES.map((serie) => (
                          <span key={serie.key}><i style={{ background: serie.color }} />{serie.label}<b>{row[serie.key].length}</b></span>
                        ))}
                        <small>Total: {row.total} {row.total === 1 ? "contrato" : "contratos"}</small>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
      </section>

      {selectedRow && (
        <section className="ct-managers-card" aria-labelledby="ct-managers-detail">
          <header className="ct-managers-head">
            <div>
              <h2 id="ct-managers-detail">{selectedRow.name}</h2>
              <p>{selectedRow.principal.length} como gestor principal · {selectedRow.substituto.length} como gestor substituto</p>
            </div>
            <button type="button" className="ct-header-export" onClick={() => setSelected(null)}>Fechar</button>
          </header>
          <div className="ct-managers-lists">
            {MANAGER_SERIES.map((serie) => (
              <div key={serie.key}>
                <h3><i style={{ background: serie.color }} aria-hidden="true" />{serie.label}</h3>
                {selectedRow[serie.key].length === 0 ? <p className="ct-managers-empty small">Nenhum contrato.</p> : (
                  <ul>
                    {selectedRow[serie.key].map((contract) => {
                      const status = getContractStatus(contract);
                      return (
                        <li key={contract.id}>
                          <button type="button" onClick={() => onOpenContract(contract)}>
                            <span><strong>{contract.processName}</strong><small>{contract.processNumber} · vence {formatDate(contract.dueDate)}</small></span>
                            <span className={`ct-badge ${status.tone}`}>{status.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function ContratosAtivos({ isViewer, onUnauthorized, onOpenMenu }) {
  const exportFormat = usePreferences().preferences.exportFormat === "pdf" ? "pdf" : "csv";
  const [contracts, setContracts] = useState([]);
  const [modalities, setModalities] = useState([]);
  const [collaborators, setCollaborators] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modalityFilter, setModalityFilter] = useState("all");
  const [vigenciaFilter, setVigenciaFilter] = useState("all");
  const [scope, setScope] = useState("active");
  const [pageTab, setPageTab] = useState("contracts");
  const changeScope = (next) => {
    setScope(next);
    // Os filtros de status/vigência mudam de sentido entre as abas.
    setStatusFilter("all");
    setVigenciaFilter("all");
  };
  const [view, setView] = useState(() => {
    try { return localStorage.getItem(VIEW_KEY) === "cards" ? "cards" : "list"; } catch { return "list"; }
  });
  const changeView = (next) => {
    setView(next);
    try { localStorage.setItem(VIEW_KEY, next); } catch { /* preferência só desta sessão */ }
  };
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [formClosing, setFormClosing] = useState(false);
  const [termFile, setTermFile] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  // Ações com modal próprio: { type: "amend" | "close" | "reopen", contract }.
  const [action, setAction] = useState(null);
  const [actionSaving, setActionSaving] = useState(false);
  const [actionError, setActionError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [contractsResponse, modalitiesResponse, collaboratorsResponse] = await Promise.all([
        authFetch(`${API_URL}/api/contracts`),
        authFetch(`${API_URL}/api/contract-modalities`),
        authFetch(`${API_URL}/api/collaborators`),
      ]);
      if ([contractsResponse.status, modalitiesResponse.status].some((status) => status === 401 || status === 403)) {
        onUnauthorized?.();
        return;
      }
      if (!contractsResponse.ok) throw new Error("Não foi possível carregar os contratos.");
      const contractsData = await contractsResponse.json();
      const modalitiesData = modalitiesResponse.ok ? await modalitiesResponse.json() : [];
      const collaboratorsData = collaboratorsResponse.ok ? await collaboratorsResponse.json() : [];
      setCollaborators(Array.isArray(collaboratorsData) ? collaboratorsData : []);
      setContracts(Array.isArray(contractsData) ? contractsData : []);
      setModalities(Array.isArray(modalitiesData) ? modalitiesData.map((modality) => modality.name).filter(Boolean) : []);
    } catch (requestError) {
      setError(requestError.message || "Erro de conexão ao carregar os contratos.");
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized]);

  useEffect(() => { loadData(); }, [loadData]);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM, modality: modalities[0] || "" });
    setTermFile(null);
    setFormError("");
    setShowForm(true);
  };

  const openEdit = (contract) => {
    setEditing(contract);
    setForm({
      processName: contract.processName,
      objectDescription: contract.objectDescription,
      processNumber: contract.processNumber,
      contractValue: contract.valueVariable ? "" : Number(contract.contractValue).toFixed(2).replace(".", ","),
      valueVariable: Boolean(contract.valueVariable),
      dueDate: contract.dueDate || "",
      fiscalEffective: contract.fiscalEffective,
      fiscalSubstitute: contract.fiscalSubstitute || "",
      modality: contract.modality,
      lawType: contract.lawType,
    });
    setTermFile(null);
    setFormError("");
    setShowForm(true);
  };

  // Toca a animação de saída do formulário (mesma do painel de detalhes) antes de fechá-lo.
  const finishCloseForm = useCallback(() => {
    setFormClosing(true);
    setTimeout(() => {
      setShowForm(false);
      setEditing(null);
      setFormError("");
      setFormClosing(false);
    }, DETAIL_EXIT_MS);
  }, []);

  const closeForm = useCallback(() => {
    if (saving || formClosing) return;
    finishCloseForm();
  }, [saving, formClosing, finishCloseForm]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError("");
    const contractValue = form.valueVariable && !String(form.contractValue).trim() ? "" : moneyInputToNumber(form.contractValue);
    if (!form.valueVariable && (!Number.isFinite(contractValue) || contractValue < 0)) {
      setFormError("Informe um valor de contrato válido.");
      return;
    }

    setSaving(true);
    try {
      const response = await authFetch(
        editing ? `${API_URL}/api/contracts/${editing.id}` : `${API_URL}/api/contracts`,
        {
          method: editing ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, contractValue }),
        }
      );
      if (response.status === 401 || response.status === 403) {
        onUnauthorized?.();
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        setFormError(data.error || "Não foi possível salvar o contrato.");
        return;
      }
      let saved = data;
      // O termo é enviado depois que o contrato existe; se falhar, o contrato continua salvo.
      if (termFile) {
        try { saved = await uploadDocument(data.id, termFile, "term"); }
        catch (uploadError) { setError(`Contrato salvo, mas o termo não foi anexado: ${uploadError.message}`); }
      }
      setContracts((current) => editing
        ? current.map((contract) => contract.id === saved.id ? saved : contract)
        : [...current, saved]);
      finishCloseForm();
    } catch {
      setFormError("Erro de conexão ao salvar o contrato.");
    } finally {
      setSaving(false);
    }
  };

  const { settings } = useAppSettings();
  // Com "Confirmação ao excluir" desligada nas configurações, exclui direto, sem o modal.
  const requestDelete = (contract) => (settings.confirmBeforeDelete ? setDeleteTarget(contract) : handleDelete(contract));
  const handleDelete = async (target = deleteTarget) => {
    if (!target) return;
    setDeleting(true);
    setError("");
    try {
      const response = await authFetch(`${API_URL}/api/contracts/${target.id}`, { method: "DELETE" });
      if (response.status === 401 || response.status === 403) {
        onUnauthorized?.();
        return;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível excluir o contrato.");
      setContracts((current) => current.filter((contract) => contract.id !== target.id));
      setDeleteTarget(null);
    } catch (requestError) {
      setError(requestError.message || "Erro de conexão ao excluir o contrato.");
    } finally {
      setDeleting(false);
    }
  };

  const summary = useMemo(() => contracts.reduce((totals, contract) => {
    const status = getContractStatus(contract);
    if (status.key === "closed") totals.closed += 1;
    else if (status.key === "near") {
      totals.near += 1;
      if (status.renewable) totals.renewal += 1;
    } else totals.active += 1;
    return totals;
  }, { active: 0, near: 0, renewal: 0, closed: 0 }), [contracts]);

  const filteredContracts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return contracts
      .filter((contract) => {
        const status = getContractStatus(contract);
        if (scope === "renewal" && !(status.key === "near" && status.renewable)) return false;
        if ((scope === "active" || scope === "closed") && (status.key === "closed") !== (scope === "closed")) return false;
        if (statusFilter === "regular" && status.key !== "regular") return false;
        if (statusFilter === "renewal" && !(status.key === "near" && status.renewable)) return false;
        if (statusFilter === "newContract" && !(status.key === "near" && !status.renewable)) return false;
        if (statusFilter === "closed" && status.key !== "closed") return false;
        if (modalityFilter !== "all" && contract.modality !== modalityFilter) return false;
        if (!matchesVigencia(contract, vigenciaFilter)) return false;
        if (!query) return true;
        return [contract.processName, contract.objectDescription, contract.processNumber,
          contract.fiscalEffective, contract.fiscalSubstitute, contract.modality]
          .join(" ").toLocaleLowerCase("pt-BR").includes(query);
      })
      .sort((a, b) => {
        // Vigentes primeiro, pelo vencimento mais próximo; encerrados no fim, os mais recentes primeiro.
        const aClosed = getContractStatus(a).key === "closed", bClosed = getContractStatus(b).key === "closed";
        if (aClosed !== bClosed) return aClosed ? 1 : -1;
        if (aClosed) return endedOn(b).localeCompare(endedOn(a));
        return (a.dueDate || "").localeCompare(b.dueDate || "");
      });
  }, [contracts, modalityFilter, search, statusFilter, vigenciaFilter, scope]);
  const activeTotal = contracts.length - summary.closed;
  const scopeTotal = { all: contracts.length, active: activeTotal, renewal: summary.renewal, closed: summary.closed }[scope];
  const scopeWord = (count) => ({
    all: "",
    active: ` vigente${count === 1 ? "" : "s"}`,
    renewal: " para renovação",
    closed: ` encerrado${count === 1 ? "" : "s"}`,
  })[scope];

  const modalityOptions = [...new Set([...modalities, ...contracts.map((contract) => contract.modality)])].filter(Boolean);

  const canEdit = !isViewer;
  // Guarda só o id: o painel mostra sempre a versão atual (ex.: logo após editar).
  const detailContract = detailId ? contracts.find((contract) => contract.id === detailId) : null;
  const openDetails = useCallback((contract) => setDetailId(contract.id), []);
  const closeDetails = useCallback(() => setDetailId(null), []);

  const replaceContract = useCallback((saved) => {
    setContracts((current) => current.map((contract) => contract.id === saved.id ? saved : contract));
  }, []);
  const openAction = (type) => (contract) => { setAction({ type, contract }); setActionError(""); };
  const handlers = {
    onEdit: openEdit,
    onDelete: requestDelete,
    onAmend: openAction("amend"),
    onClose: openAction("close"),
    onReopen: openAction("reopen"),
  };
  const submitAction = async (payload) => {
    if (!action) return;
    if (action.type === "amend" && payload.newValue !== null && payload.newValue !== undefined && (!Number.isFinite(payload.newValue) || payload.newValue < 0)) {
      setActionError("Informe um novo valor válido.");
      return;
    }
    const path = { amend: "amendments", close: "close", reopen: "reopen" }[action.type];
    const { file, ...body } = payload;
    setActionSaving(true);
    setActionError("");
    try {
      const response = await authFetch(`${API_URL}/api/contracts/${action.contract.id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 401) { onUnauthorized?.(); return; }
      const { amendmentEventId, ...data } = await response.json();
      if (!response.ok) { setActionError(data.error || "Não foi possível concluir a ação."); return; }
      let saved = data;
      if (file && amendmentEventId) {
        try { saved = await uploadDocument(data.id, file, "amendment", amendmentEventId); }
        catch (uploadError) { setError(`Aditivo registrado, mas o termo não foi anexado: ${uploadError.message}`); }
      }
      replaceContract(saved);
      setAction(null);
    } catch {
      setActionError("Erro de conexão. Tente novamente.");
    } finally {
      setActionSaving(false);
    }
  };

  return (
    <div className="lk-contracts">
      <header className="ct-header">
        <button className="lk-menu" aria-label="Abrir navegação" onClick={onOpenMenu}>☰</button>
        <h1 className="lk-sr">Contratos</h1>
        <nav className="process-page-tabs ct-page-tabs" aria-label="Seções de contratos">
          {[["contracts", "Contratos"], ["managers", "Gestores"]].map(([id, label]) => (
            <button type="button" key={id} className={pageTab === id ? "active" : ""} aria-current={pageTab === id ? "page" : undefined} onClick={() => setPageTab(id)}>{label}</button>
          ))}
        </nav>
        <div className="ct-header-actions">
          <button type="button" className="ct-header-export" onClick={() => exportContracts(filteredContracts, exportFormat)} disabled={filteredContracts.length === 0} title={`Exporta os contratos exibidos (com os filtros atuais) em ${exportFormat.toUpperCase()}. O formato muda em Meu perfil › Preferências.`}>Exportar {exportFormat.toUpperCase()}</button>
          {canEdit && <button type="button" className="ct-new-button" onClick={openAdd}><IconPlus /> Novo contrato</button>}
        </div>
      </header>

      {error && (
        <div className="ct-message" role="alert">
          <span>{error}</span>
          <button type="button" onClick={loadData}>Tentar novamente</button>
        </div>
      )}

      {pageTab === "managers" ? (
        <ManagersView contracts={contracts} loading={loading} onOpenContract={openDetails} />
      ) : (
      <>
      <section className="lk-kpis ct-kpis" aria-label="Resumo dos contratos">
        {[
          ["ATIVOS", summary.active, "green", "Regularizados: faltam mais de 3 meses para vencer"],
          ["PERTO DO VENCIMENTO", summary.near, "amber", "Vencem em até 3 meses"],
          ["PARA RENOVAÇÃO", summary.renewal, "purple", `Perto do vencimento e com menos de ${MAX_AMENDMENTS} aditivos`],
          ["ENCERRADOS", summary.closed, "gray", "Vencidos ou encerrados manualmente"],
        ].map(([label, value, tone, hint]) => (
          <article className={`lk-kpi ${tone}`} key={label} title={hint}>
            <h2><i aria-hidden="true" />{label}</h2>
            <strong>{loading ? "—" : value}</strong>
          </article>
        ))}
      </section>

      <section className="ct-toolbar" aria-label="Filtros de contratos">
        <label className="ct-field ct-field-search">
          <span>Buscar contrato</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Número, fiscal ou objeto..." />
        </label>
        {(scope === "all" || scope === "active") && (
          <label className="ct-field">
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">Todos</option>
              <option value="regular">Ativos</option>
              <option value="renewal">Para renovação</option>
              <option value="newContract">Nova contratação</option>
              {scope === "all" && <option value="closed">Encerrados</option>}
            </select>
          </label>
        )}
        <label className="ct-field">
          <span>Vigência</span>
          <select value={vigenciaFilter} onChange={(event) => setVigenciaFilter(event.target.value)}>
            {VIGENCIA_FILTERS[scope].map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label className="ct-field">
          <span>Modalidade</span>
          <select value={modalityFilter} onChange={(event) => setModalityFilter(event.target.value)}>
            <option value="all">Todas</option>
            {modalityOptions.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <div className="ct-toolbar-actions">
          <div className="ct-view-toggle ct-scope-toggle" role="group" aria-label="Situação dos contratos">
            <button type="button" className={scope === "all" ? "active" : ""} aria-pressed={scope === "all"} onClick={() => changeScope("all")}>Todos <span className="ct-toggle-count">{loading ? "—" : contracts.length}</span></button>
            <button type="button" className={scope === "active" ? "active" : ""} aria-pressed={scope === "active"} onClick={() => changeScope("active")}>Vigentes <span className="ct-toggle-count">{loading ? "—" : activeTotal}</span></button>
            <button type="button" className={scope === "renewal" ? "active" : ""} aria-pressed={scope === "renewal"} onClick={() => changeScope("renewal")}>Renovação <span className="ct-toggle-count">{loading ? "—" : summary.renewal}</span></button>
            <button type="button" className={scope === "closed" ? "active" : ""} aria-pressed={scope === "closed"} onClick={() => changeScope("closed")}>Encerrados <span className="ct-toggle-count">{loading ? "—" : summary.closed}</span></button>
          </div>
          <div className="ct-view-toggle ct-icon-toggle" role="group" aria-label="Visualização">
            <button type="button" className={view === "list" ? "active" : ""} aria-pressed={view === "list"} aria-label="Lista" title="Lista" onClick={() => changeView("list")}><IconViewList /></button>
            <button type="button" className={view === "cards" ? "active" : ""} aria-pressed={view === "cards"} aria-label="Cards" title="Cards" onClick={() => changeView("cards")}><IconViewCards /></button>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="ct-state">
          <span className="contracts-spinner" />
          <h2>Carregando contratos</h2>
          <p>Aguarde enquanto buscamos os dados cadastrados.</p>
        </div>
      ) : filteredContracts.length === 0 ? (
        <div className="ct-state">
          <div className="contracts-state-icon"><IconFileText /></div>
          <h2>{contracts.length === 0 ? "Nenhum contrato cadastrado"
            : scopeTotal === 0 ? ({ closed: "Nenhum contrato encerrado", renewal: "Nenhum contrato para renovação", active: "Nenhum contrato vigente" })[scope]
            : "Nenhum contrato encontrado"}</h2>
          <p>{contracts.length === 0
            ? "Cadastre o primeiro contrato para começar o acompanhamento."
            : scopeTotal === 0 ? ({
              closed: "Contratos aparecem aqui quando vencem ou são encerrados manualmente.",
              renewal: `Aparecem aqui os contratos que vencem em até 3 meses e ainda têm aditivos disponíveis (menos de ${MAX_AMENDMENTS}).`,
              active: "Todos os contratos cadastrados já estão encerrados.",
            })[scope]
            : "Ajuste os filtros ou use outro termo de busca."}</p>
          {canEdit && contracts.length === 0 && (
            <button type="button" className="ct-add" onClick={openAdd}><IconPlus /> Adicionar primeiro contrato</button>
          )}
        </div>
      ) : (
        <section className={view === "list" ? "ct-list" : "ct-cards-section"} aria-label="Lista de contratos">
          {view === "list"
            ? <ContractsTable contracts={filteredContracts} canEdit={canEdit} handlers={handlers} onOpen={openDetails} />
            : <div className="contracts-grid">{filteredContracts.map((contract) => (
                <ContractCard key={contract.id} contract={contract} canEdit={canEdit} handlers={handlers} onOpen={openDetails} />
              ))}</div>}
          <footer className="ct-pagination">
            <span>{filteredContracts.length === scopeTotal
              ? `${scopeTotal} ${scopeTotal === 1 ? "contrato" : "contratos"}${scopeWord(scopeTotal)}`
              : `Mostrando ${filteredContracts.length} de ${scopeTotal} contratos${scopeWord(scopeTotal)}`}</span>
          </footer>
        </section>
      )}

      </>
      )}

      {detailContract && !showForm && !deleteTarget && !action && (
        <ContractDetails
          contract={detailContract}
          canEdit={canEdit}
          onClose={closeDetails}
          handlers={handlers}
          onContractChange={replaceContract}
        />
      )}

      {action?.type === "amend" && (
        <AmendmentModal contract={action.contract} saving={actionSaving} error={actionError} onClose={() => !actionSaving && setAction(null)} onSubmit={submitAction} />
      )}
      {(action?.type === "close" || action?.type === "reopen") && (
        <CloseReopenModal contract={action.contract} mode={action.type} saving={actionSaving} error={actionError} onClose={() => !actionSaving && setAction(null)} onSubmit={submitAction} />
      )}

      {showForm && (
        <ContractFormModal
          editing={editing}
          form={form}
          setForm={setForm}
          modalities={modalities}
          collaborators={collaborators}
          saving={saving}
          error={formError}
          closing={formClosing}
          onClose={closeForm}
          onSubmit={handleSubmit}
          termFile={termFile}
          onTermFileChange={setTermFile}
        />
      )}

      {deleteTarget && (
        <div className="contract-modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && !deleting && setDeleteTarget(null)}>
          <div className="contract-delete-modal" role="alertdialog" aria-modal="true" aria-labelledby="contract-delete-title">
            <div className="contract-delete-icon"><IconTrash /></div>
            <h2 id="contract-delete-title">Excluir este contrato?</h2>
            <p>O contrato <strong>{deleteTarget.processName}</strong> será removido permanentemente. Essa ação não pode ser desfeita.</p>
            <div className="contract-delete-actions">
              <button type="button" className="btn-cancel-lg" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancelar</button>
              <button type="button" className="btn-danger" onClick={() => handleDelete()} disabled={deleting}>{deleting ? "Excluindo..." : "Excluir contrato"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
