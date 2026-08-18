"use client";
// Gráficas en SVG (sin librerías): devuelven un string de SVG que las vistas
// inyectan con dangerouslySetInnerHTML. Cada punto lleva data-tip para el tooltip
// global (ver ChartTooltip). Portado 1:1 del prototipo de diseño.

export type Palette = ReturnType<typeof palette>;

export function palette() {
  const s = getComputedStyle(document.documentElement);
  const g = (k: string) => s.getPropertyValue(k).trim();
  return {
    accent: g("--accent"), real: g("--real"), pred: g("--pred"), ceil: g("--ceil"),
    ink: g("--ink"), muted: g("--muted"), line: g("--line2"), grid: g("--grid"),
    good: g("--good"), warn: g("--warn"), crit: g("--crit"),
  };
}

const fmt = (n: any, d = 1) =>
  n == null || !isFinite(n) ? "—" : Number(n).toLocaleString("es-CR", { minimumFractionDigits: d, maximumFractionDigits: d });

type Serie = { points: (number | null)[]; color: string; name?: string; area?: boolean; width?: number; dash?: boolean };
type LineOpts = { x: string[]; height?: number; w?: number; yfmt?: (v: number) => string; area?: boolean; unit?: string; tipfmt?: (v: number) => string };

// `w` = ancho del viewBox. Renderizar cerca del ancho real del contenedor mantiene
// las fuentes legibles (en un bubble angosto, un viewBox de 1000 se achica 3x y el
// texto queda ilegible). Vistas grandes: 1000. Chat: ~500.
export function lineChart(series: Serie[], { x, height = 320, w = 1000, yfmt = (v) => fmt(v, 0), area = true, unit = "", tipfmt = null as any }: LineOpts): string {
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
      g += `<circle cx="${cx}" cy="${cy}" r="2.4" fill="${s.color}"/>`;
      g += `<circle class="hit" cx="${cx}" cy="${cy}" r="12" fill="transparent" data-tip="${tip}"/>`; });
  }
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img">${g}</svg>`;
}

type Group = { values: (number | null)[]; color: string; name?: string; dec?: number };
export function barChart(cats: string[], groups: Group[], { height = 320, yfmt = (v: number) => fmt(v, 0), unit = "" } = {}): string {
  const W = 1000, H = height, mL = 54, mR = 14, mT = 18, mB = 36, P = palette();
  const n = cats.length, gN = groups.length;
  const flat = groups.flatMap((g) => g.values).filter((v) => v != null) as number[];
  let ymax = Math.max(1, ...flat);
  const bandW = (W - mL - mR) / n, barW = Math.min(18, (bandW * 0.68) / gN);
  const py = (v: number) => mT + (1 - v / ymax) * (H - mT - mB);
  let g = "";
  for (let k = 0; k <= 4; k++) { const v = ymax * k / 4, y = py(v);
    g += `<line x1="${mL}" y1="${y.toFixed(1)}" x2="${W - mR}" y2="${y.toFixed(1)}" stroke="${P.grid}" stroke-width="1"/>`;
    g += `<text x="${mL - 9}" y="${(y + 4).toFixed(1)}" fill="${P.muted}" font-size="12" text-anchor="end" font-family="var(--mono)">${yfmt(v)}</text>`; }
  const step = Math.max(1, Math.round(n / 12));
  cats.forEach((c, i) => { const cx = mL + bandW * i + bandW / 2;
    if (i % step === 0) g += `<text x="${cx.toFixed(1)}" y="${H - 13}" fill="${P.muted}" font-size="11" text-anchor="middle" font-family="var(--mono)">${c}</text>`;
    groups.forEach((gr, j) => { const v = gr.values[i]; if (v == null) return;
      const x = cx - (gN * barW) / 2 + j * barW, y = py(v), h = py(0) - y;
      const tip = `${c} · ${gr.name ? gr.name + ": " : ""}${fmt(v, gr.dec ?? 1)}${unit ? " " + unit : ""}`;
      g += `<rect class="bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(barW - 2).toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="2" fill="${gr.color}" data-tip="${tip}"/>`; }); });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img">${g}</svg>`;
}

export function scatter(pts: [number, number][], { height = 300 } = {}): string {
  const W = 1000, H = height, mL = 56, mR = 16, mT = 18, mB = 38, P = palette();
  if (pts.length < 2) return `<div class="muted small">Sin suficientes puntos.</div>`;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  let xmin = Math.min(...xs), xmax = Math.max(...xs), ymin = 0, ymax = Math.max(...ys) * 1.05;
  const px = (v: number) => mL + ((v - xmin) / (xmax - xmin)) * (W - mL - mR), py = (v: number) => mT + (1 - (v - ymin) / (ymax - ymin)) * (H - mT - mB);
  let g = "";
  for (let k = 0; k <= 4; k++) { const v = ymin + (ymax - ymin) * k / 4, y = py(v);
    g += `<line x1="${mL}" y1="${y.toFixed(1)}" x2="${W - mR}" y2="${y.toFixed(1)}" stroke="${P.grid}" stroke-width="1"/>`;
    g += `<text x="${mL - 9}" y="${(y + 4).toFixed(1)}" fill="${P.muted}" font-size="12" text-anchor="end" font-family="var(--mono)">${fmt(v, 1)}</text>`; }
  for (let k = 0; k <= 4; k++) { const v = xmin + (xmax - xmin) * k / 4;
    g += `<text x="${px(v).toFixed(1)}" y="${H - 13}" fill="${P.muted}" font-size="11.5" text-anchor="middle" font-family="var(--mono)">${fmt(v, 0)}</text>`; }
  pts.forEach((p) => g += `<circle class="hit" cx="${px(p[0]).toFixed(1)}" cy="${py(p[1]).toFixed(1)}" r="5" fill="${P.accent}" opacity="0.7" data-tip="GHI ${fmt(p[0], 0)} W/m² · ${fmt(p[1], 2)} kWh"/>`);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img">${g}</svg>`;
}

export function sparkline(vals: (number | null)[], color: string): string {
  const W = 240, H = 42, f = vals.filter((v) => v != null) as number[];
  if (f.length < 2) return "";
  const mn = Math.min(...f), mx = Math.max(...f), sp = mx - mn || 1;
  const pts = vals.map((v, i) => v == null ? null : [6 + (i / (vals.length - 1)) * (W - 12), H - 5 - ((v - mn) / sp) * (H - 10)] as [number, number]);
  let d = "", st = false; pts.forEach((p) => { if (!p) { st = false; return; } d += (st ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1) + " "; st = true; });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:42px"><path d="${d}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}
