"use client";
// Grafica de linea minima en SVG (sin librerias). Recibe puntos {t, v}.
// Sirve para ver de un vistazo la forma de una serie en el debugger.

export type Punto = { t: string; v: number | null };

export function Sparkline({
  puntos,
  width = 640,
  height = 160,
  label,
}: {
  puntos: Punto[];
  width?: number;
  height?: number;
  label?: string;
}) {
  const vals = puntos.map((p) => Number(p.v)).filter((v) => isFinite(v));
  if (vals.length < 2) {
    return <div className="muted">Sin suficientes puntos para graficar.</div>;
  }
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const pad = 24;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const pts = puntos
    .map((p, i) => {
      const v = Number(p.v);
      if (!isFinite(v)) return null;
      const x = pad + (i / (puntos.length - 1)) * w;
      const y = pad + h - ((v - min) / span) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean)
    .join(" ");

  const first = puntos[0]?.t?.slice(0, 10) ?? "";
  const last = puntos[puntos.length - 1]?.t?.slice(0, 10) ?? "";

  return (
    <div>
      {label && <div className="spark-label">{label}</div>}
      <svg width={width} height={height} className="spark">
        <line x1={pad} y1={pad} x2={pad} y2={pad + h} className="spark-axis" />
        <line x1={pad} y1={pad + h} x2={pad + w} y2={pad + h} className="spark-axis" />
        <polyline points={pts} className="spark-line" />
        <text x={pad} y={pad - 8} className="spark-txt">
          max {max.toLocaleString("es-CR", { maximumFractionDigits: 1 })}
        </text>
        <text x={pad} y={pad + h + 16} className="spark-txt">
          min {min.toLocaleString("es-CR", { maximumFractionDigits: 1 })}
        </text>
        <text x={pad + w} y={pad + h + 16} className="spark-txt" textAnchor="end">
          {first} → {last}
        </text>
      </svg>
    </div>
  );
}
