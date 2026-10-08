import { fmt, palette } from "@/app/lib/charts/palette";

export type MarcaScatter = { x: number; y: number; etiqueta: string; nota: string };

/** Nube de puntos con recta ajustada opcional y puntos destacados.
 *
 * Las unidades se pasan: antes estaban escritas en el `data-tip` («kWh») y el eje
 * traía vatios, así que el hover decía una unidad y el dato era otra. Un gráfico
 * que rotula mal la unidad es peor que no tenerlo. */
export function scatter(pts: [number, number][], {
  height = 300, xUnit = "", yUnit = "", xfmt, yfmt, linea, marcas = [], etiquetas = [],
}: {
  height?: number; xUnit?: string; yUnit?: string;
  xfmt?: (v: number) => string; yfmt?: (v: number) => string;
  /** Recta y = m·x + b, dibujada de extremo a extremo del eje x. */
  linea?: { m: number; b: number };
  /** Puntos que se pintan aparte, con su propio texto al pasar el mouse. */
  marcas?: MarcaScatter[];
  /** Etiqueta por punto, en el mismo orden que `pts`. */
  etiquetas?: string[];
} = {}): string {
  const W = 1000, H = height, mL = 56, mR = 16, mT = 18, mB = 38, P = palette();
  if (pts.length < 2) return `<div class="muted small">Sin suficientes puntos.</div>`;
  const xf = xfmt || ((v: number) => fmt(v, 0));
  const yf = yfmt || ((v: number) => fmt(v, 0));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  const ymin = 0, ymax = Math.max(...ys) * 1.05;
  const px = (v: number) => mL + ((v - xmin) / (xmax - xmin || 1)) * (W - mL - mR);
  const py = (v: number) => mT + (1 - (v - ymin) / (ymax - ymin || 1)) * (H - mT - mB);
  let g = "";
  for (let k = 0; k <= 4; k++) { const v = ymin + (ymax - ymin) * k / 4, y = py(v);
    g += `<line x1="${mL}" y1="${y.toFixed(1)}" x2="${W - mR}" y2="${y.toFixed(1)}" stroke="${P.grid}" stroke-width="1"/>`;
    g += `<text x="${mL - 9}" y="${(y + 4).toFixed(1)}" fill="${P.muted}" font-size="12" text-anchor="end" font-family="var(--mono)">${yf(v)}</text>`; }
  for (let k = 0; k <= 4; k++) { const v = xmin + (xmax - xmin) * k / 4;
    g += `<text x="${px(v).toFixed(1)}" y="${H - 13}" fill="${P.muted}" font-size="11.5" text-anchor="middle" font-family="var(--mono)">${xf(v)}</text>`; }

  // La recta va DEBAJO de los puntos: es la referencia, no el dato.
  if (linea) {
    const y1 = linea.m * xmin + linea.b, y2 = linea.m * xmax + linea.b;
    g += `<line x1="${px(xmin).toFixed(1)}" y1="${py(y1).toFixed(1)}" x2="${px(xmax).toFixed(1)}" y2="${py(y2).toFixed(1)}" stroke="${P.muted}" stroke-width="1.5" stroke-dasharray="6 4" opacity="0.75"/>`;
  }

  const marcado = new Set(marcas.map((m) => `${m.x}|${m.y}`));
  pts.forEach((p, i) => {
    if (marcado.has(`${p[0]}|${p[1]}`)) return;   // los destacados se pintan aparte
    const et = etiquetas[i] ? `${etiquetas[i]} · ` : "";
    g += `<circle class="hit" cx="${px(p[0]).toFixed(1)}" cy="${py(p[1]).toFixed(1)}" r="4.5" fill="${P.accent}" opacity="0.55" data-tip="${et}${xf(p[0])}${xUnit ? " " + xUnit : ""} → ${yf(p[1])}${yUnit ? " " + yUnit : ""}"/>`;
  });
  for (const m of marcas) {
    g += `<circle class="hit" cx="${px(m.x).toFixed(1)}" cy="${py(m.y).toFixed(1)}" r="6" fill="none" stroke="${P.crit}" stroke-width="2" data-tip="${m.etiqueta} · ${m.nota}"/>`;
    g += `<circle class="hit" cx="${px(m.x).toFixed(1)}" cy="${py(m.y).toFixed(1)}" r="2.5" fill="${P.crit}" data-tip="${m.etiqueta} · ${m.nota}"/>`;
  }
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img">${g}</svg>`;
}
