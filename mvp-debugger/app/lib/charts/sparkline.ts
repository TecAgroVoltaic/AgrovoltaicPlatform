export function sparkline(vals: (number | null)[], color: string): string {
  const W = 240, H = 42, f = vals.filter((v) => v != null) as number[];
  if (f.length < 2) return "";
  const mn = Math.min(...f), mx = Math.max(...f), sp = mx - mn || 1;
  const pts = vals.map((v, i) => v == null ? null : [6 + (i / (vals.length - 1)) * (W - 12), H - 5 - ((v - mn) / sp) * (H - 10)] as [number, number]);
  let d = "", st = false; pts.forEach((p) => { if (!p) { st = false; return; } d += (st ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1) + " "; st = true; });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:42px"><path d="${d}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}
