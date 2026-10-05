// El tema de los gráficos SALE del CSS, no de una paleta paralela.
//
// Los colores viven una sola vez, en las variables de globals.css, y acá se leen
// del DOM ya resueltas. Por eso los gráficos siguen el cambio claro/oscuro sin
// que nadie les pase nada, y por eso no hay ni un color escrito a mano en este
// directorio: un hexadecimal repetido acá sería la segunda fuente de verdad que
// se despinta el día que alguien retoca la paleta.
export type SeriesColorToken =
  | "accent"
  | "real"
  | "pred"
  | "ceil"
  | "good"
  | "warn"
  | "crit";

export type ChartTheme = {
  readonly ink: string;
  readonly ink2: string;
  readonly muted: string;
  readonly grid: string;
  readonly line: string;
  readonly panel: string;
  readonly raise: string;
  readonly series: Readonly<Record<SeriesColorToken, string>>;
  /** Orden por defecto cuando una vista no elige color por serie. */
  readonly palette: readonly string[];
  readonly monoFamily: string;
  /** false con `prefers-reduced-motion`: la animación se apaga entera. */
  readonly animate: boolean;
};

const SERIES_VARIABLE: Readonly<Record<SeriesColorToken, string>> = {
  accent: "--accent",
  real: "--real",
  pred: "--pred",
  ceil: "--ceil",
  good: "--good",
  warn: "--warn",
  crit: "--crit",
};

const PALETTE_ORDER: readonly SeriesColorToken[] = ["accent", "real", "pred", "ceil"];

const MONO_FALLBACK = "ui-monospace, Menlo, Consolas, monospace";

export function readChartTheme(root: HTMLElement, animate: boolean): ChartTheme {
  const computed = getComputedStyle(root);
  const read = (variable: string) => computed.getPropertyValue(variable).trim();
  const series = {
    accent: read(SERIES_VARIABLE.accent),
    real: read(SERIES_VARIABLE.real),
    pred: read(SERIES_VARIABLE.pred),
    ceil: read(SERIES_VARIABLE.ceil),
    good: read(SERIES_VARIABLE.good),
    warn: read(SERIES_VARIABLE.warn),
    crit: read(SERIES_VARIABLE.crit),
  };
  return {
    ink: read("--ink"),
    ink2: read("--ink2"),
    muted: read("--muted"),
    grid: read("--grid"),
    line: read("--line2"),
    panel: read("--panel"),
    raise: read("--raise"),
    series,
    palette: PALETTE_ORDER.map((token) => series[token]),
    monoFamily: read("--mono") || MONO_FALLBACK,
    animate,
  };
}

/** Color de una serie: el token elegido, o el siguiente de la paleta. */
export function seriesColor(
  theme: ChartTheme,
  index: number,
  token?: SeriesColorToken,
): string {
  if (token) return theme.series[token];
  return theme.palette[index % theme.palette.length];
}
