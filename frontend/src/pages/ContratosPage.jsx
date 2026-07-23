import { useState, useEffect, useRef } from "react";
import { IconClose, IconLink, IconUpload } from "../icons";
import { useStorage } from "../utils";

// ── Helpers de CSV / datas / valores ─────────────────────────────────────────

function splitCSVLine(line) {
  const cols = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; }
    else if (ch === "," && !inQ) { cols.push(cur.replace(/^"|"$/g, "").trim()); cur = ""; }
    else cur += ch;
  }
  cols.push(cur.replace(/^"|"$/g, "").trim());
  return cols;
}

function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 3) return [];
  return lines.slice(2).map(line => {
    const c = splitCSVLine(line);
    const g = (i) => (c[i] || "").replace(/\n/g, " ").trim();
    const aditivoRaw = g(10);
    let estado = "Contrato Inicial";
    if (g(22) && g(22) !== "-") {
      estado = "Emergencial";
    } else if (aditivoRaw && aditivoRaw !== "-") {
      const n = aditivoRaw.replace(/[°º]/g, "").trim();
      const map = { "1": "1º Aditivo", "2": "2º Aditivo", "3": "3º Aditivo", "4": "4º Aditivo" };
      estado = map[n] || `${aditivoRaw} Aditivo`;
    }
    let ultimoVenc = g(13);
    if (!ultimoVenc || ultimoVenc === "-") ultimoVenc = g(23);
    if (!ultimoVenc || ultimoVenc === "-") ultimoVenc = g(9);
    let ultimoValor = g(11);
    if (!ultimoValor || ultimoValor === "-") ultimoValor = g(22);
    if (!ultimoValor || ultimoValor === "-") ultimoValor = g(7);
    return {
      contratada:        g(1),
      lei:               g(2),
      processo:          g(3),
      modalidade:        g(4),
      objeto:            g(5),
      contrato:          g(6),
      valorInicial:      g(7),
      assinatura:        g(8),
      vencInicial:       g(9),
      valorMensal:       g(12),
      portaria:          g(27),
      fiscalEfetivo:     g(28),
      matriculaFiscal:   g(29),
      substituto:        g(30),
      matriculaSubst:    g(31),
      estado, ultimoVenc, ultimoValor,
    };
  }).filter(r => r.contrato && r.contrato !== "" && r.objeto !== "");
}

function parseDate(str) {
  if (!str) return null;
  const parts = str.split("/");
  if (parts.length === 3) return new Date(+parts[2], +parts[1] - 1, +parts[0]);
  return new Date(str);
}

function formatDate(str) {
  if (!str) return "—";
  const d = parseDate(str);
  if (!d || isNaN(d)) return str;
  return d.toLocaleDateString("pt-BR");
}

function formatMoney(str) {
  if (!str) return "—";
  const clean = str.replace(/[R$\s.]/g, "").replace(",", ".");
  const n = parseFloat(clean);
  if (isNaN(n)) return str;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getStatusVencimento(dateStr) {
  const d = parseDate(dateStr);
  if (!d || isNaN(d)) return { label: "Sem data", color: "#8b949e", key: "semdata" };
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const diff = Math.ceil((d - hoje) / (1000 * 60 * 60 * 24));
  if (diff < -30) return { label: "Encerrado",          color: "#6e7681", key: "encerrado" };
  if (diff < 0)   return { label: "Vencido",             color: "#f85149", key: "vencido"   };
  if (diff <= 30) return { label: `Vence em ${diff}d`,   color: "#e3b341", key: "alerta"    };
  if (diff <= 90) return { label: `Vence em ${diff}d`,   color: "#f0883e", key: "alerta"    };
  return                  { label: `Vence em ${diff}d`,   color: "#3fb950", key: "ok"        };
}

const LEI_COLORS = {
  "8.666":  { label: "Lei 8.666/93",  color: "#58a6ff", bg: "#58a6ff18" },
  "14.133": { label: "Lei 14.133/21", color: "#bc8cff", bg: "#bc8cff18" },
};

const ESTADO_COLORS = {
  "Contrato Inicial": "#3fb950",
  "1º Aditivo":       "#58a6ff",
  "2º Aditivo":       "#f0883e",
  "3º Aditivo":       "#e3b341",
  "4º Aditivo":       "#f85149",
  "Emergencial":      "#bc8cff",
};

function useContratoDerived(row) {
  const vencStatus  = getStatusVencimento(row.ultimoVenc);
  const leiKey      = Object.keys(LEI_COLORS).find(k => row.lei.includes(k));
  const leiInfo     = leiKey ? LEI_COLORS[leiKey] : { label: row.lei || "Lei N/D", color: "#8b949e", bg: "#8b949e18" };
  const estadoColor = ESTADO_COLORS[row.estado] || "#8b949e";
  return { vencStatus, leiInfo, estadoColor };
}

function toGSheetsCsvUrl(input) {
  const str = input.trim();
  if (!str) return { url: "", type: "unknown", sheetId: null, gid: null };
  if (str.includes("docs.google.com/spreadsheets") && str.includes("/pub") && str.includes("output=csv")) {
    return { url: str, type: "pub-csv", sheetId: null, gid: null };
  }
  const isExcelUpload = str.includes("rtpof=true") || str.includes("sd=true");
  let match = str.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) match = str.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9_-]+)/);
  if (!match) match = str.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    const id = match[1];
    const gidMatch = str.match(/[#&?]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : "0";
    if (isExcelUpload || str.includes("/file/d/")) {
      return { url: `https://docs.google.com/uc?export=download&id=${id}`, type: "drive-xlsx", sheetId: id, gid: null };
    }
    return { url: `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`, type: "sheets-csv", sheetId: id, gid };
  }
  return { url: str, type: "unknown", sheetId: null, gid: null };
}

const SYNC_INTERVALS = [
  { label: "1 min",  value: 1  },
  { label: "5 min",  value: 5  },
  { label: "10 min", value: 10 },
  { label: "30 min", value: 30 },
  { label: "Manual", value: 0  },
];

// ── Modal de detalhe ──────────────────────────────────────────────────────────

function ContratoModal({ row, onClose }) {
  const { vencStatus, leiInfo, estadoColor } = useContratoDerived(row);

  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const Field = ({ label, value, accent, full }) => (
    <div className={full ? "cdm-field cdm-field-full" : "cdm-field"}>
      <span className="cdm-label">{label}</span>
      <span className="cdm-value" style={{ color: accent || undefined }}>{value || "—"}</span>
    </div>
  );

  const hasSubst = row.substituto && row.substituto !== "-";

  return (
    <div className="cdm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="cdm-box">

        {/* Hero */}
        <div className="cdm-hero" style={{ borderBottom: `3px solid ${vencStatus.color}` }}>
          <div className="cdm-hero-badges">
            <span className="cc2-estado"    style={{ background: estadoColor + "22", color: estadoColor,    borderColor: estadoColor + "55" }}>{row.estado}</span>
            <span className="cc2-lei"       style={{ background: leiInfo.bg,          color: leiInfo.color, borderColor: leiInfo.color + "44" }}>{leiInfo.label}</span>
            <span className="cc2-venc-badge" style={{ background: vencStatus.color + "22", color: vencStatus.color, borderColor: vencStatus.color + "55", marginLeft: "auto" }}>{vencStatus.label}</span>
          </div>
          <div className="cdm-hero-contratada">{row.contratada}</div>
          <div className="cdm-hero-num">Contrato Nº {row.contrato}</div>
          <button className="cdm-close" onClick={onClose}><IconClose /></button>
        </div>

        <div className="cdm-body">

          {/* Objeto */}
          <div className="cdm-section">
            <div className="cdm-section-title">📄 Objeto</div>
            <p className="cdm-objeto-text">{row.objeto}</p>
          </div>

          {/* Processo */}
          <div className="cdm-section">
            <div className="cdm-section-title">📋 Processo</div>
            <div className="cdm-grid">
              <Field label="Nº do Processo" value={row.processo} />
              <Field label="Modalidade"     value={row.modalidade} />
            </div>
          </div>

          {/* Contrato inicial */}
          <div className="cdm-section">
            <div className="cdm-section-title">📝 Contrato Inicial</div>
            <div className="cdm-grid">
              <Field label="Valor inicial"    value={formatMoney(row.valorInicial)} accent="#8b949e" />
              <Field label="Data de assinatura" value={formatDate(row.assinatura)} />
              <Field label="Vencimento inicial" value={formatDate(row.vencInicial)} />
              {row.valorMensal && row.valorMensal !== "-" && (
                <Field label="Valor mensal" value={formatMoney(row.valorMensal)} />
              )}
            </div>
          </div>

          {/* Situação atual */}
          <div className="cdm-section">
            <div className="cdm-section-title">💰 Situação Atual ({row.estado})</div>
            <div className="cdm-grid">
              <Field label="Último vencimento" value={formatDate(row.ultimoVenc)}    accent={vencStatus.color} />
              <Field label="Último valor"       value={formatMoney(row.ultimoValor)} accent="#f0883e" />
            </div>
          </div>

          {/* Fiscalização */}
          <div className="cdm-section">
            <div className="cdm-section-title">👤 Fiscalização</div>
            <div className="cdm-grid">
              {row.portaria && row.portaria !== "-" && (
                <Field label="Portaria" value={row.portaria} />
              )}
              <Field label="Fiscal efetivo" value={row.fiscalEfetivo} />
              {row.matriculaFiscal && <Field label="Matrícula fiscal" value={row.matriculaFiscal} />}
              <Field label="Fiscal substituto"
                value={hasSubst ? row.substituto : "Sem substituto designado"}
                accent={!hasSubst ? "#8b949e" : undefined} />
              {hasSubst && row.matriculaSubst && <Field label="Matrícula substituto" value={row.matriculaSubst} />}
            </div>
          </div>

        </div>

        <div className="cdm-footer">
          <button className="btn-cancel-lg" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

function ContratoCard({ row }) {
  const [open, setOpen] = useState(false);
  const { vencStatus, leiInfo } = useContratoDerived(row);

  return (
    <>
      <div className="cc2-card" style={{ "--sc": vencStatus.color, cursor: "pointer" }}
        onClick={() => setOpen(true)} title="Clique para ver detalhes">
        <div className="cc2-stripe" style={{ background: vencStatus.color }} />
        <div className="cc2-body">
          {/* Nome do contratado */}
          <div className="cc2-contratada">{row.contratada}</div>

          {/* Badges: lei + modalidade */}
          <div className="cc2-badges-row">
            <span className="cc2-lei" style={{ background: leiInfo.bg, color: leiInfo.color, borderColor: leiInfo.color + "44" }}>{leiInfo.label}</span>
            <span className="cc2-modalidade">{row.modalidade}</span>
          </div>

          {/* Vencimento */}
          <div className="cc2-venc-row">
            <span className="cc2-bottom-label">Vencimento</span>
            <span className="cc2-venc-val" style={{ color: vencStatus.color }}>{formatDate(row.ultimoVenc)}</span>
            <span className="cc2-venc-badge" style={{ background: vencStatus.color + "18", color: vencStatus.color, borderColor: vencStatus.color + "44" }}>{vencStatus.label}</span>
          </div>
        </div>
      </div>
      {open && <ContratoModal row={row} onClose={() => setOpen(false)} />}
    </>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function ContratosAtivos({ isViewer }) {
  const DEFAULT_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRgWXyIcoaK2D_vska_TC7vlvmhnEkZ6TyPGoX2wyJJVBnSIv85TM4P-RS7MPo68Q/pub?gid=1218345147&single=true&output=csv";
  const [csvUrl, setCsvUrl]           = useStorage("licit_csv_url", DEFAULT_CSV);
  const [syncInterval, setSyncInterval] = useStorage("licit_sync_interval", 5);
  const [inputUrl, setInputUrl]       = useState("");
  const [contratos, setContratos]     = useState([]);
  const [loading, setLoading]         = useState(false);
  const [syncing, setSyncing]         = useState(false);
  const [error, setError]             = useState("");
  const [search, setSearch]           = useState("");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [fonte, setFonte]             = useState("link");
  const [fileName, setFileName]       = useState("");
  const [lastSync, setLastSync]       = useState(null);
  const [nextSyncIn, setNextSyncIn]   = useState(null);
  const fileRef       = useRef();
  const syncTimerRef  = useRef(null);
  const countdownRef  = useRef(null);

  const loadSheetJS = () => new Promise((resolve, reject) => {
    if (window.XLSX) return resolve(window.XLSX);
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    script.onload  = () => resolve(window.XLSX);
    script.onerror = () => reject(new Error("Falha ao carregar a biblioteca de Excel."));
    document.head.appendChild(script);
  });

  const CORS_PROXIES = [
    (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
    (u) => `https://cors.eu.org/${u}`,
    (u) => u,
  ];

  const fetchWithFallback = async (rawUrl, asArrayBuffer = false) => {
    const cacheBust = rawUrl + (rawUrl.includes("?") ? "&" : "?") + "_t=" + Date.now();
    let lastError = null;
    for (const buildProxy of CORS_PROXIES) {
      try {
        const proxied = buildProxy(cacheBust);
        const res = await fetch(proxied, { redirect: "follow" });
        if (!res.ok) { lastError = new Error(`HTTP ${res.status}`); continue; }
        return asArrayBuffer ? await res.arrayBuffer() : await res.text();
      } catch (e) { lastError = e; continue; }
    }
    throw lastError || new Error("Todos os proxies falharam.");
  };

  const fetchCSV = async (url, silent = false) => {
    if (!silent) setLoading(true); else setSyncing(true);
    setError("");
    const detected = typeof url === "string" ? toGSheetsCsvUrl(url) : { url, type: "sheets-csv" };
    const isExcel  = detected.type === "drive-xlsx";
    try {
      let rows;
      if (isExcel) {
        const XLSX   = await loadSheetJS();
        const buffer = await fetchWithFallback(detected.url, true);
        const wb     = XLSX.read(buffer, { type: "array" });
        rows = parseCSV(XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]));
      } else {
        const text = await fetchWithFallback(detected.url, false);
        if (text.trim().startsWith("<!DOCTYPE") || text.trim().startsWith("<html")) {
          throw new Error("Planilha não está pública. Em Compartilhar, libere para 'Qualquer pessoa com o link'.");
        }
        rows = parseCSV(text);
      }
      if (rows.length === 0) throw new Error("Planilha vazia ou formato inválido.");
      setContratos(rows);
      setCsvUrl(url);
      setLastSync(new Date());
    } catch (e) {
      const msg = e.message === "Failed to fetch"
        ? "Não foi possível baixar o arquivo. Verifique sua conexão ou tente upload manual."
        : (e.message || "Erro ao carregar.");
      if (!silent) setError(msg);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  const scheduleSync = (url, intervalMin) => {
    if (syncTimerRef.current)  clearInterval(syncTimerRef.current);
    if (countdownRef.current)  clearInterval(countdownRef.current);
    if (!url || intervalMin === 0) { setNextSyncIn(null); return; }
    const ms = intervalMin * 60 * 1000;
    let remaining = ms;
    countdownRef.current = setInterval(() => {
      remaining -= 1000;
      setNextSyncIn(Math.max(0, Math.ceil(remaining / 1000)));
      if (remaining <= 0) remaining = ms;
    }, 1000);
    syncTimerRef.current = setInterval(() => { remaining = ms; fetchCSV(url, true); }, ms);
    setNextSyncIn(Math.ceil(ms / 1000));
  };

  useEffect(() => {
    if (csvUrl && fonte === "link") { fetchCSV(csvUrl); scheduleSync(csvUrl, syncInterval); }
    return () => {
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  useEffect(() => {
    if (csvUrl && fonte === "link") scheduleSync(csvUrl, syncInterval);
    else {
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      setNextSyncIn(null);
    }
  }, [syncInterval, csvUrl, fonte]);

  const formatCountdown = (secs) => {
    if (secs === null) return null;
    if (secs <= 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  };

  const handleConnect = () => {
    const raw = inputUrl.trim();
    if (!raw) return;
    const result = toGSheetsCsvUrl(raw);
    if (result.type === "unknown") { setError("Link não reconhecido. Cole um link válido do Google Sheets."); return; }
    fetchCSV(result.url);
    scheduleSync(result.url, syncInterval);
    setInputUrl("");
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true); setError("");
    setFileName(file.name);
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    try {
      let rows;
      if (isExcel) {
        const XLSX   = await loadSheetJS();
        const buffer = await file.arrayBuffer();
        const wb     = XLSX.read(buffer, { type: "array" });
        rows = parseCSV(XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]));
      } else {
        rows = parseCSV(await file.text());
      }
      if (rows.length === 0) throw new Error("Arquivo vazio ou formato não reconhecido.");
      setContratos(rows);
      setLastSync(new Date());
    } catch (err) {
      setError(err.message || "Erro ao ler o arquivo.");
    } finally {
      setLoading(false);
    }
  };

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  const filtered = contratos.filter(row => {
    const texto = Object.values(row).join(" ").toLowerCase();
    if (search && !texto.includes(search.toLowerCase())) return false;
    if (filterStatus !== "todos") {
      const d    = parseDate(row.ultimoVenc);
      const diff = d ? Math.ceil((d - hoje) / (1000 * 60 * 60 * 24)) : null;
      if (filterStatus === "encerrado" && (diff === null || diff >= -30))          return false;
      if (filterStatus === "vencido"   && (diff === null || diff < -30 || diff >= 0)) return false;
      if (filterStatus === "alerta"    && (diff === null || diff < 0 || diff > 90))   return false;
      if (filterStatus === "ok"        && (diff === null || diff <= 90))              return false;
    }
    return true;
  });

  const totalEncerrados = contratos.filter(r => { const d = parseDate(r.ultimoVenc); return d && Math.ceil((d - hoje) / (1000 * 60 * 60 * 24)) < -30; }).length;
  const totalVencidos   = contratos.filter(r => { const d = parseDate(r.ultimoVenc); const diff = d ? Math.ceil((d - hoje) / (1000 * 60 * 60 * 24)) : null; return diff !== null && diff >= -30 && diff < 0; }).length;
  const totalAlerta     = contratos.filter(r => { const d = parseDate(r.ultimoVenc); const diff = d ? Math.ceil((d - hoje) / (1000 * 60 * 60 * 24)) : null; return diff !== null && diff >= 0 && diff <= 90; }).length;

  return (
    <div className="contratos-page">

      {/* Painel de fonte de dados */}
      {!isViewer && (
        <div className="contratos-config">
        <div style={{ width: "100%" }}>
          <div className="fonte-tabs">
            <button className={`fonte-tab ${fonte === "link" ? "active" : ""}`} onClick={() => setFonte("link")}>
              <IconLink />Link Google Sheets<span className="fonte-badge">Tempo real</span>
            </button>
            <button className={`fonte-tab ${fonte === "arquivo" ? "active" : ""}`} onClick={() => setFonte("arquivo")}>
              <IconUpload />Upload de arquivo<span className="fonte-badge">CSV / Excel</span>
            </button>
          </div>

          {fonte === "link" && (
            <div className="fonte-panel">
              <p className="contratos-config-label">Cole o link do Google Sheets (qualquer formato)</p>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <input className="csv-input"
                  placeholder="https://docs.google.com/spreadsheets/d/... (link de edição ou publicação)"
                  value={inputUrl} onChange={e => setInputUrl(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleConnect()} />
                <button className="btn-primary" onClick={handleConnect} disabled={!inputUrl.trim() || loading}>
                  {loading ? "Carregando..." : csvUrl ? "Atualizar link" : "Conectar"}
                </button>
              </div>
              {(() => {
                if (!inputUrl.trim()) return null;
                const detected = toGSheetsCsvUrl(inputUrl);
                if (detected.type === "pub-csv")
                  return <p style={{ fontSize: "0.7rem", color: "#3fb950", marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>✓ Link CSV publicado — pronto pra conectar</p>;
                if (detected.type === "drive-xlsx")
                  return (
                    <div style={{ marginTop: 6, padding: "8px 10px", background: "rgba(63,185,80,.08)", border: "1px solid rgba(63,185,80,.25)", borderRadius: 8 }}>
                      <p style={{ fontSize: "0.72rem", color: "#3fb950", marginBottom: 3 }}>✦ Arquivo Excel (.xlsx) detectado — será baixado e processado</p>
                      <p style={{ fontSize: "0.66rem", color: "#8b949e", lineHeight: 1.4 }}>O arquivo precisa estar com <strong style={{ color: "#e6edf3" }}>"Qualquer pessoa com o link pode ver"</strong> em Compartilhar. Lê apenas a primeira aba.</p>
                    </div>
                  );
                if (detected.type === "sheets-csv")
                  return (
                    <div style={{ marginTop: 6, padding: "8px 10px", background: "rgba(88,166,255,.08)", border: "1px solid rgba(88,166,255,.25)", borderRadius: 8 }}>
                      <p style={{ fontSize: "0.72rem", color: "#58a6ff", marginBottom: 3 }}>✦ Link de Google Sheets — será convertido para CSV</p>
                      <p style={{ fontSize: "0.66rem", color: "#8b949e", lineHeight: 1.4 }}>Sua planilha precisa estar com <strong style={{ color: "#e6edf3" }}>"Qualquer pessoa com o link pode ver"</strong> em Compartilhar.</p>
                    </div>
                  );
                if (detected.type === "unknown" && inputUrl.trim().length > 10)
                  return <p style={{ fontSize: "0.7rem", color: "#f85149", marginTop: 6 }}>✗ Link não reconhecido. Verifique se é do Google Sheets ou Drive.</p>;
                return null;
              })()}

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, flexWrap: "wrap", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {csvUrl && !error && (
                    <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.72rem", color: "#3fb950" }}>
                      {syncing
                        ? <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#e3b341" }} />
                        : <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#3fb950" }} />}
                      {syncing ? "Sincronizando..." : `Conectado · ${contratos.length} contratos`}
                      {lastSync && !syncing && ` · ${lastSync.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
                    </span>
                  )}
                  {error && <span style={{ fontSize: "0.72rem", color: "#f85149" }}>Erro: {error}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {csvUrl && nextSyncIn !== null && (
                    <span style={{ fontSize: "0.68rem", color: "#8b949e" }}>
                      Próxima sync: <strong style={{ color: "#58a6ff" }}>{formatCountdown(nextSyncIn)}</strong>
                    </span>
                  )}
                  {csvUrl && (
                    <button className="btn-outline" onClick={() => fetchCSV(csvUrl, true)} disabled={loading || syncing} style={{ fontSize: "0.75rem", padding: "4px 10px" }}>
                      {syncing ? "Sincronizando..." : "Sincronizar agora"}
                    </button>
                  )}
                </div>
              </div>

              {csvUrl && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, padding: "8px 12px", background: "#1c2330", borderRadius: 8, border: "1px solid #30363d" }}>
                  <span style={{ fontSize: "0.72rem", color: "#8b949e", flexShrink: 0 }}>Sincronizar a cada:</span>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {SYNC_INTERVALS.map(opt => (
                      <button key={opt.value} onClick={() => setSyncInterval(opt.value)}
                        style={{ fontSize: "0.7rem", padding: "3px 9px", borderRadius: 99, border: "1px solid", cursor: "pointer", transition: "all .15s", fontFamily: "'Nunito Sans', sans-serif",
                          background:   syncInterval === opt.value ? "#f0883e22" : "transparent",
                          color:        syncInterval === opt.value ? "#f0883e"   : "#8b949e",
                          borderColor:  syncInterval === opt.value ? "#f0883e66" : "#30363d" }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!csvUrl && (
                <div style={{ marginTop: 10, padding: "10px 12px", background: "#161b22", borderRadius: 8, border: "1px solid #30363d" }}>
                  <p style={{ fontSize: "0.72rem", color: "#8b949e", marginBottom: 4 }}><strong style={{ color: "#e6edf3" }}>Como publicar sua planilha:</strong></p>
                  <div style={{ fontSize: "0.7rem", color: "#8b949e", display: "flex", flexDirection: "column", gap: 2 }}>
                    <span>1. No Google Sheets: <strong style={{ color: "#e6edf3" }}>Arquivo → Compartilhar → Publicar na web</strong></span>
                    <span>2. Selecione a aba e o formato <strong style={{ color: "#e6edf3" }}>Valores separados por vírgula (.csv)</strong></span>
                    <span>3. Clique em <strong style={{ color: "#e6edf3" }}>Publicar</strong> e cole o link acima</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {fonte === "arquivo" && (
            <div className="fonte-panel">
              <p className="contratos-config-label">Faça upload do arquivo exportado (.csv)</p>
              <p style={{ fontSize: "0.72rem", color: "#8b949e", margin: "4px 0 10px" }}>
                No Google Sheets: <strong style={{ color: "#e6edf3" }}>Arquivo → Fazer download → Valores separados por vírgula (.csv)</strong>
              </p>
              <div className="upload-zone"
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("drag-over"); }}
                onDragLeave={e => e.currentTarget.classList.remove("drag-over")}
                onDrop={e => {
                  e.preventDefault(); e.currentTarget.classList.remove("drag-over");
                  const file = e.dataTransfer.files?.[0];
                  if (file) { const dt = new DataTransfer(); dt.items.add(file); fileRef.current.files = dt.files; handleFileUpload({ target: { files: [file] } }); }
                }}>
                <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" style={{ display: "none" }} onChange={handleFileUpload} />
                {loading ? (
                  <p style={{ color: "#8b949e", fontSize: "0.85rem" }}>Lendo arquivo...</p>
                ) : fileName ? (
                  <div style={{ textAlign: "center" }}>
                    <p style={{ color: "#3fb950", fontSize: "0.85rem", fontWeight: 600 }}>✓ {fileName}</p>
                    <p style={{ color: "#8b949e", fontSize: "0.72rem", marginTop: 4 }}>{contratos.length} contratos carregados · Clique para trocar o arquivo</p>
                  </div>
                ) : (
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: "1.8rem", marginBottom: 8 }}>📂</p>
                    <p style={{ color: "#e6edf3", fontSize: "0.85rem", fontWeight: 600 }}>Clique ou arraste o arquivo aqui</p>
                    <p style={{ color: "#8b949e", fontSize: "0.72rem", marginTop: 4 }}>Suporta .csv exportado do Google Sheets ou Excel</p>
                  </div>
                )}
              </div>
              {error && <p style={{ fontSize: "0.72rem", color: "#f85149", marginTop: 6 }}>⚠ {error}</p>}
              {lastSync && !error && fileName && (
                <p style={{ fontSize: "0.7rem", color: "#8b949e", marginTop: 4 }}>
                  Carregado às {lastSync.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · Para atualizar, faça upload novamente
                </p>
              )}
            </div>
          )}
        </div>
      </div>
      )}

      {contratos.length > 0 && (
        <>
          <div className="contratos-resumo">
            <div className="resumo-card" onClick={() => setFilterStatus("todos")}     style={{ borderLeftColor: "#58a6ff", cursor: "pointer" }}><div className="resumo-val" style={{ color: "#58a6ff" }}>{contratos.length}</div><div className="resumo-label">Total de contratos</div></div>
            <div className="resumo-card" onClick={() => setFilterStatus("alerta")}    style={{ borderLeftColor: "#e3b341", cursor: "pointer" }}><div className="resumo-val" style={{ color: "#e3b341" }}>{totalAlerta}</div><div className="resumo-label">Vencem em 90 dias</div></div>
            <div className="resumo-card" onClick={() => setFilterStatus("vencido")}   style={{ borderLeftColor: "#f85149", cursor: "pointer" }}><div className="resumo-val" style={{ color: "#f85149" }}>{totalVencidos}</div><div className="resumo-label">Vencidos</div></div>
            <div className="resumo-card" onClick={() => setFilterStatus("encerrado")} style={{ borderLeftColor: "#6e7681", cursor: "pointer" }}><div className="resumo-val" style={{ color: "#6e7681" }}>{totalEncerrados}</div><div className="resumo-label">Encerrados</div></div>
            <div className="resumo-card" onClick={() => setFilterStatus("ok")}        style={{ borderLeftColor: "#3fb950", cursor: "pointer" }}><div className="resumo-val" style={{ color: "#3fb950" }}>{contratos.length - totalAlerta - totalVencidos - totalEncerrados}</div><div className="resumo-label">Em dia</div></div>
          </div>

          <div className="contratos-filters">
            <input className="contratos-search" placeholder="🔍  Buscar por objeto, fiscal, contrato..."
              value={search} onChange={e => setSearch(e.target.value)} />
            <div className="filter-btns">
              {[["todos","Todos"],["ok","Em dia"],["alerta","⚠ Alerta"],["vencido","Vencidos"],["encerrado","Encerrados"]].map(([v,l]) => (
                <button key={v} className={`filter-btn ${filterStatus === v ? "active" : ""}`} onClick={() => setFilterStatus(v)}>{l}</button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="contratos-loading">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="contratos-empty">Nenhum contrato encontrado com esses filtros.</div>
          ) : (
            <div className="cc2-grid">
              {filtered.map((row, i) => <ContratoCard key={i} row={row} />)}
            </div>
          )}
        </>
      )}

      {contratos.length === 0 && !loading && (
        <div className="contratos-empty-state">
          <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>📄</div>
          <h3>Nenhum dado carregado</h3>
          <p>Use o link do Google Sheets para atualização em tempo real, ou faça upload do arquivo CSV para carregar manualmente.</p>
        </div>
      )}
    </div>
  );
}
