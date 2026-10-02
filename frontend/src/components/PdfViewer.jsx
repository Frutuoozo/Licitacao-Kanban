import { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import "./PdfViewer.css";

// O worker fica em /public com a mesma versão do pacote (pdfjs-dist 3.11.174).
pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.PUBLIC_URL || ""}/pdf.worker.min.js`;

const MIN_SCALE = 0.4;
const MAX_SCALE = 4;
const ZOOM_STEP = 1.2;
const PAGE_GAP = 16;

const IconMinus = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>;
const IconPlus = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
const IconFit = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4" /></svg>;
const IconRotate = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></svg>;
const IconDownload = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>;
const IconExternal = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>;
const IconChevron = ({ up }) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={up ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} /></svg>;

// Uma página: o canvas só é desenhado quando a página se aproxima da área visível.
function PdfPage({ pdf, number, scale, rotation, registerPage }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [size, setSize] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let live = true;
    pdf.getPage(number).then((page) => {
      if (!live) return;
      const viewport = page.getViewport({ scale, rotation });
      setSize({ width: viewport.width, height: viewport.height });
    });
    return () => { live = false; };
  }, [pdf, number, scale, rotation]);

  useEffect(() => {
    const node = wrapRef.current;
    registerPage(number, node);
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setVisible(true); }, { rootMargin: "600px 0px" });
    observer.observe(node);
    return () => { observer.disconnect(); registerPage(number, null); };
  }, [number, registerPage]);

  useEffect(() => {
    if (!visible || !size) return undefined;
    let task = null;
    let cancelled = false;
    pdf.getPage(number).then((page) => {
      if (cancelled) return;
      const ratio = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale, rotation });
      const canvas = canvasRef.current;
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      task = page.render({
        canvasContext: canvas.getContext("2d"),
        viewport,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
      });
      task.promise.catch(() => {});
    });
    return () => { cancelled = true; task?.cancel(); };
  }, [pdf, number, scale, rotation, visible, size]);

  return (
    <div ref={wrapRef} className="pdfv-page" data-page={number} style={size ? { width: size.width, height: size.height } : undefined}>
      <canvas ref={canvasRef} aria-label={`Página ${number}`} />
    </div>
  );
}

/** Leitor de PDF próprio (PDF.js): rolagem contínua, navegação por página, zoom, girar, baixar. */
export default function PdfViewer({ blob, fileName, fileUrl }) {
  const scrollRef = useRef(null);
  const pagesRef = useRef(new Map());
  const [pdf, setPdf] = useState(null);
  const [error, setError] = useState("");
  const [scale, setScale] = useState(null);
  const [fitWidth, setFitWidth] = useState(true);
  const [rotation, setRotation] = useState(0);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");

  useEffect(() => {
    let live = true;
    let doc = null;
    setPdf(null);
    setError("");
    blob.arrayBuffer()
      .then((data) => pdfjs.getDocument({ data }).promise)
      .then((loaded) => { doc = loaded; if (live) setPdf(loaded); else loaded.destroy(); })
      .catch(() => { if (live) setError("Não foi possível ler este PDF."); });
    return () => { live = false; doc?.destroy(); };
  }, [blob]);

  // "Ajustar à largura": recalcula a escala pela primeira página e pela largura disponível.
  const computeFitScale = useCallback(async () => {
    if (!pdf || !scrollRef.current) return;
    const first = await pdf.getPage(1);
    const viewport = first.getViewport({ scale: 1, rotation });
    const available = scrollRef.current.clientWidth - 48;
    setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, available / viewport.width)));
  }, [pdf, rotation]);

  useEffect(() => {
    if (!pdf || !fitWidth) return undefined;
    computeFitScale();
    const observer = new ResizeObserver(() => computeFitScale());
    observer.observe(scrollRef.current);
    return () => observer.disconnect();
  }, [pdf, fitWidth, computeFitScale]);

  const registerPage = useCallback((number, node) => {
    if (node) pagesRef.current.set(number, node); else pagesRef.current.delete(number);
  }, []);

  // Página atual = a que ocupa o topo da área visível.
  const onScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    const top = container.scrollTop + container.clientHeight * 0.3;
    let current = 1;
    pagesRef.current.forEach((node, number) => { if (node.offsetTop <= top) current = Math.max(current, number); });
    if (current !== page) { setPage(current); setPageInput(String(current)); }
  };

  const goTo = (number) => {
    if (!pdf) return;
    const target = Math.min(pdf.numPages, Math.max(1, number));
    const node = pagesRef.current.get(target);
    if (node) scrollRef.current.scrollTo({ top: node.offsetTop - PAGE_GAP, behavior: "smooth" });
    setPage(target);
    setPageInput(String(target));
  };

  const zoom = (factor) => {
    setFitWidth(false);
    setScale((current) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round((current || 1) * factor * 100) / 100)));
  };

  const onKeyDown = (event) => {
    if (event.target.tagName === "INPUT") return;
    if ((event.ctrlKey || event.metaKey) && (event.key === "=" || event.key === "+")) { event.preventDefault(); zoom(ZOOM_STEP); }
    else if ((event.ctrlKey || event.metaKey) && event.key === "-") { event.preventDefault(); zoom(1 / ZOOM_STEP); }
    else if (event.key === "PageDown") { event.preventDefault(); goTo(page + 1); }
    else if (event.key === "PageUp") { event.preventDefault(); goTo(page - 1); }
  };

  const total = pdf?.numPages || 0;

  return (
    <div className="pdfv" onKeyDown={onKeyDown}>
      <div className="pdfv-toolbar" role="toolbar" aria-label="Controles do documento">
        <div className="pdfv-group">
          <button type="button" onClick={() => goTo(page - 1)} disabled={!pdf || page <= 1} aria-label="Página anterior" title="Página anterior"><IconChevron up /></button>
          <form className="pdfv-page-form" onSubmit={(event) => { event.preventDefault(); goTo(Number(pageInput) || page); }}>
            <input value={pageInput} onChange={(event) => setPageInput(event.target.value.replace(/\D/g, ""))} onBlur={() => setPageInput(String(page))}
              inputMode="numeric" aria-label="Página atual" disabled={!pdf} />
            <span>de {total || "—"}</span>
          </form>
          <button type="button" onClick={() => goTo(page + 1)} disabled={!pdf || page >= total} aria-label="Próxima página" title="Próxima página"><IconChevron /></button>
        </div>

        <div className="pdfv-group">
          <button type="button" onClick={() => zoom(1 / ZOOM_STEP)} disabled={!pdf || (scale || 1) <= MIN_SCALE} aria-label="Diminuir zoom" title="Diminuir zoom"><IconMinus /></button>
          <span className="pdfv-zoom" aria-live="polite">{scale ? `${Math.round(scale * 100)}%` : "—"}</span>
          <button type="button" onClick={() => zoom(ZOOM_STEP)} disabled={!pdf || (scale || 1) >= MAX_SCALE} aria-label="Aumentar zoom" title="Aumentar zoom"><IconPlus /></button>
          <button type="button" className={fitWidth ? "active" : ""} onClick={() => setFitWidth(true)} disabled={!pdf} aria-pressed={fitWidth} aria-label="Ajustar à largura" title="Ajustar à largura"><IconFit /></button>
          <button type="button" onClick={() => setRotation((r) => (r + 90) % 360)} disabled={!pdf} aria-label="Girar página" title="Girar"><IconRotate /></button>
        </div>

        <div className="pdfv-group">
          {fileUrl && <a href={fileUrl} target="_blank" rel="noreferrer" aria-label="Abrir em nova aba" title="Abrir em nova aba"><IconExternal /></a>}
          {fileUrl && <a href={fileUrl} download={fileName} aria-label="Baixar" title="Baixar"><IconDownload /></a>}
        </div>
      </div>

      <div className="pdfv-scroll" ref={scrollRef} onScroll={onScroll} tabIndex={0} aria-label={fileName || "Documento PDF"}>
        {error ? <p className="pdfv-state">{error}</p>
          : !pdf || !scale ? <p className="pdfv-state"><span className="pdfv-spinner" /> Carregando documento…</p>
          : Array.from({ length: total }, (_, i) => (
            <PdfPage key={i + 1} pdf={pdf} number={i + 1} scale={scale} rotation={rotation} registerPage={registerPage} />
          ))}
      </div>
    </div>
  );
}
