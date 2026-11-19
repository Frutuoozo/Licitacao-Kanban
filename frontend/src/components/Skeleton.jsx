// Esqueleto de carregamento (skeleton screen), usado por Demandas e Contratos: blocos no formato do conteúdo
// no lugar do "Carregando…". As larguras variam por linha (skWidth) para não parecer uma grade repetida.
import "./Skeleton.css";

export const SKELETON_ROWS = 6;
export const skWidth = (row, base, spread) => `${base + ((row * 37) % spread)}%`;
export const Sk = ({ w = "100%", h, className = "" }) => <span className={`sk ${className}`} style={{ width: w, height: h }} />;
