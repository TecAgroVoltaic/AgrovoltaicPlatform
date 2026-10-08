import { fmt, palette } from "@/app/lib/charts/palette";

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
