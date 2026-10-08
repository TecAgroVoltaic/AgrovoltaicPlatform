// Valores fijos de la vista Descargas: formatos, rutas del proxy, resoluciones
// y los atajos de rango.
export const EXPORT_FORMATS = [
  { k: "csv", l: "CSV", d: "coma · nulo vacío · Excel, pandas, R" },
  { k: "dat", l: "DAT", d: "tabulado · NaN · columna *_unix · MATLAB, numpy" },
  { k: "mat", l: "MAT", d: "MATLAB · variable por columna · *_unix, *_datenum, meta" },
] as const;

export const DEFAULT_FORMAT = "csv";
export const PREFERRED_SOURCE = "supabase";
export const INITIAL_DATASET = "electrico_corregido";
export const INITIAL_STEP = "datos";

export const CATALOG_PATH = "/api/historico/datos/exportables";
export const ESTIMATE_PATH = "/api/historico/datos/exportar/estimar";
export const PREVIEW_PATH = "/api/historico/datos/exportar/previa";
export const EXPORT_PATH = "/api/historico/datos/exportar";
export const NOT_FOUND_STATUS = 404;

/** Rótulo de cada resolución en segundos; 0 = una fila por lectura. */
export const STEP_LABEL: Record<number, string> = { 0: "Crudo", 60: "1 min", 300: "5 min", 900: "15 min", 3600: "1 h", 86400: "1 día" };
export const RAW_STEP = 0;

export const ESTIMATE_DEBOUNCE_MS = 400;
export const PREVIEW_ROWS = 5;

export const INITIAL_WINDOW_DAYS = 30;
export const FALLBACK_COVERAGE_DAYS = 365;
export const FALLBACK_ALL_HISTORY_DAYS = 3650;

export const RANGE_PRESET_DAYS = { semana: 7, mes: 30, trimestre: 91, anio: 365 } as const;
export const RANGE_PRESET_LABELS = [
  ["semana", "7 días"], ["mes", "30 días"], ["trimestre", "3 meses"], ["anio", "1 año"], ["todo", "Todo"],
] as const;

/** Bytes aproximados por celda: el .mat es binario y el texto lleva separadores. */
export const BYTES_PER_CELL_MAT = 5;
export const BYTES_PER_CELL_TEXT = 9;
