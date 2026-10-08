// Colores del tema leídos de las variables CSS, y el formato numérico común de
// las gráficas SVG.

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

export const fmt = (n: number | null | undefined, d = 1) =>
  n == null || !isFinite(n) ? "—" : Number(n).toLocaleString("es-CR", { minimumFractionDigits: d, maximumFractionDigits: d });
