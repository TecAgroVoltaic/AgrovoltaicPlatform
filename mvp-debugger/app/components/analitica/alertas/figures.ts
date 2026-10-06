// Las cifras de la evidencia, con nombre legible y unidad cuando se conoce.
//
// El mapa cubre las claves que hoy escribe el evaluador (`alertas/evaluar.py`:
// `lecturas_afectadas` más los campos del `detalle` de cada regla). Una clave
// que no está acá se muestra con su nombre crudo y sin unidad: adivinarle
// significado sería inventar, y callarla, perder dato.
const NUMBER_FORMAT = new Intl.NumberFormat("es-CR", { maximumFractionDigits: 2 });
const MISSING = "—";
const HEADLINE_SEPARATOR = " · ";
const MAX_HEADLINE_FIGURES = 2;

type FigureSpec = { readonly label: string; readonly unit?: string };

const FIGURE_SPECS: Readonly<Record<string, FigureSpec>> = {
  lecturas_afectadas: { label: "Lecturas afectadas" },
  ghi_max_wm2: { label: "GHI máx", unit: "W/m²" },
  lecturas_con_sol: { label: "Lecturas con sol" },
  lecturas_en_85: { label: "Lecturas en 85 °C" },
  kt_max: { label: "kt máx" },
  peor: { label: "Peor valor" },
  temp_max: { label: "Temp. máx", unit: "°C" },
  ghi_max: { label: "GHI máx", unit: "W/m²" },
  minutos_caliente_sin_sol: { label: "Caliente sin sol", unit: "min" },
};

/** Qué cifra resume mejor cada regla, para la segunda línea de la fila: primero
 *  la del tipo de alerta y después cuántas lecturas tocó. */
const HEADLINE_ORDER: readonly string[] = [
  "ghi_max_wm2",
  "lecturas_en_85",
  "kt_max",
  "temp_max",
  "ghi_max",
  "minutos_caliente_sin_sol",
  "lecturas_afectadas",
];

export type KeyFigure = {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly unit: string | null;
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return MISSING;
  if (typeof value === "number") return NUMBER_FORMAT.format(value);
  if (typeof value === "string" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function toKeyFigure(key: string, value: unknown): KeyFigure {
  const spec = FIGURE_SPECS[key];
  return { key, label: spec?.label ?? key, value: formatValue(value), unit: spec?.unit ?? null };
}

/** Todas las cifras, en el orden en que las guardó el backend. */
export function keyFigures(figures: Readonly<Record<string, unknown>>): KeyFigure[] {
  return Object.entries(figures).map(([key, value]) => toKeyFigure(key, value));
}

/** Hasta dos cifras conocidas y numéricas en una línea («GHI máx 1.043,5 W/m² ·
 *  Lecturas afectadas 147»), o `null` si la evidencia no trae ninguna. */
export function headlineFigures(figures: Readonly<Record<string, unknown>>): string | null {
  const picked = HEADLINE_ORDER.filter((key) => typeof figures[key] === "number")
    .slice(0, MAX_HEADLINE_FIGURES)
    .map((key) => {
      const { label, value, unit } = toKeyFigure(key, figures[key]);
      return unit ? `${label} ${value} ${unit}` : `${label} ${value}`;
    });
  return picked.length > 0 ? picked.join(HEADLINE_SEPARATOR) : null;
}
