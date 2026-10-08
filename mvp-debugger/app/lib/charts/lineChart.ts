import { fmt, palette } from "@/app/lib/charts/palette";

type Serie = { points: (number | null)[]; color: string; name?: string; area?: boolean; width?: number; dash?: boolean; r?: number };
// `marca` resalta un punto del eje X (guía vertical + etiqueta): sirve para
// señalar "la hora que estoy mirando" sin sacar al lector del gráfico.
type Marca = { i: number; label?: string };
type LineOpts = { x: string[]; height?: number; w?: number; yfmt?: (v: number) => string; area?: boolean; unit?: string; tipfmt?: (v: number) => string; marca?: Marca | null };

// `w` = ancho del viewBox. Renderizar cerca del ancho real del contenedor mantiene
// las fuentes legibles (en un bubble angosto, un viewBox de 1000 se achica 3x y el
// texto queda ilegible). Vistas grandes: 1000. Chat: ~500.
export function lineChart(series: Serie[], { x, height = 320, w = 1000, yfmt = (v) => fmt(v, 0), area = true, unit = "", tipfmt, marca = null }: LineOpts): string {
  const W = w, H = height, mL = 54, mR = 18, mT = 18, mB = 36, P = palette(), tf = tipfmt || yfmt;
  const n = x.length;
  const flat = series.flatMap((s) => s.points).filter((v) => v != null && isFinite(v as number)) as number[];
  let ymin = Math.min(0, ...flat), ymax = Math.max(...flat); if (ymax === ymin) ymax = ymin + 1;
  const px = (i: number) => mL + (n <= 1 ? 0 : (i / (n - 1)) * (W - mL - mR));
  const py = (v: number) => mT + (1 - (v - ymin) / (ymax - ymin)) * (H - mT - mB);
  let g = "";
  for (let k = 0; k <= 4; k++) { const v = ymin + (ymax - ymin) * k / 4, y = py(v);
    g += `<line x1="${mL}" y1="${y.toFixed(1)}" x2="${W - mR}" y2="${y.toFixed(1)}" stroke="${P.grid}" stroke-width="1"/>`;
    g += `<text x="${mL - 9}" y="${(y + 4).toFixed(1)}" fill="${P.muted}" font-size="12" text-anchor="end" font-family="var(--mono)">${yfmt(v)}</text>`; }
  if (marca && marca.i >= 0 && marca.i < n) {
    const mx = px(marca.i);
    g += `<line x1="${mx.toFixed(1)}" y1="${mT}" x2="${mx.toFixed(1)}" y2="${H - mB}" stroke="${P.accent}" stroke-width="1.4" stroke-dasharray="4 4" opacity="0.85"/>`;
    if (marca.label) {
      const anchor = marca.i > n * 0.75 ? "end" : "start";
      const dx = anchor === "end" ? -7 : 7;
      g += `<text x="${(mx + dx).toFixed(1)}" y="${mT + 12}" fill="${P.accent}" font-size="11.5" text-anchor="${anchor}" font-family="var(--mono)">${marca.label}</text>`;
    }
  }
  const step = Math.max(1, Math.round(n / 7));
  for (let i = 0; i < n; i += step) g += `<text x="${px(i).toFixed(1)}" y="${H - 13}" fill="${P.muted}" font-size="11.5" text-anchor="middle" font-family="var(--mono)">${x[i]}</text>`;
  for (const s of series) {
    const pts = s.points.map((v, i) => v == null || !isFinite(v) ? null : [px(i), py(v)] as [number, number]);
    let d = "", st = false; pts.forEach((p) => { if (!p) { st = false; return; } d += (st ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1) + " "; st = true; });
    if (s.area && area) { const seg = pts.filter(Boolean) as [number, number][];
      if (seg.length) { const a = `M${seg[0][0].toFixed(1)} ${py(ymin).toFixed(1)} ` + seg.map((p) => `L${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") + ` L${seg[seg.length - 1][0].toFixed(1)} ${py(ymin).toFixed(1)} Z`;
        g += `<path d="${a}" fill="${s.color}" opacity="0.09"/>`; } }
    g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2.2}" stroke-linejoin="round" stroke-linecap="round" ${s.dash ? 'stroke-dasharray="6 5"' : ""} vector-effect="non-scaling-stroke"/>`;
    s.points.forEach((v, i) => { if (v == null || !isFinite(v)) return;
      const cx = px(i).toFixed(1), cy = py(v).toFixed(1);
      const tip = `${x[i]} · ${s.name ? s.name + ": " : ""}${tf(v)}${unit ? " " + unit : ""}`;
      g += `<circle cx="${cx}" cy="${cy}" r="${s.r || 2.4}" fill="${s.color}"/>`;
      g += `<circle class="hit" cx="${cx}" cy="${cy}" r="12" fill="transparent" data-tip="${tip}"/>`; });
  }
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img">${g}</svg>`;
}
