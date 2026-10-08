// Cuentas puras de la vista Descargas: fechas cortas, nombre del archivo,
// resumen de selecciones y la barra de cobertura.
const DATE_LENGTH = 10;         // YYYY-MM-DD
const DATE_MINUTE_LENGTH = 16;  // YYYY-MM-DDTHH:MM
const MS_PER_DAY = 86_400_000;
const UTC_MIDNIGHT = "T00:00:00Z";
const SLUG_MAX_LENGTH = 40;
const SUMMARY_MAX_LISTED = 2;
const PERCENT = 100;
const MIN_BAR_WIDTH_PERCENT = 0.6;

export const dayOf = (iso: string | null | undefined) => (iso ? String(iso).slice(0, DATE_LENGTH) : "");

export const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to + UTC_MIDNIGHT) - Date.parse(from + UTC_MIDNIGHT)) / MS_PER_DAY);

export const minuteOf = (iso: string | null | undefined) =>
  (iso ? String(iso).slice(0, DATE_MINUTE_LENGTH).replace("T", " ") : "—");

const slug = (text: string) =>
  text.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, SLUG_MAX_LENGTH).toLowerCase();

/** «todas», «a, b» o «N seleccionadas». */
export const summarizeSelection = (selection: Set<string>, allLabel: string) =>
  selection.size === 0 ? allLabel
    : selection.size <= SUMMARY_MAX_LISTED ? [...selection].join(", ")
    : `${selection.size} seleccionadas`;

export function toggleInSet(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value); else next.add(value);
  return next;
}

/** El tipo SQL de una columna, corto para el costado del selector. */
export const compactColumnType = (sqlType: string) =>
  sqlType.replace(" without time zone", "").replace(" with time zone", "tz").replace("double precision", "double");

type FileNameInput = {
  source: string; dataset: string; boxes: Set<string>; hasTime: boolean; from: string; to: string; format: string;
};

/** Nombre sugerido del archivo, por si el servidor no manda uno. */
export function exportFileName({ source, dataset, boxes, hasTime, from, to, format }: FileNameInput): string {
  const parts = source === "supabase" ? [dataset] : [source, dataset];
  if (boxes.size) parts.push(boxes.size <= SUMMARY_MAX_LISTED ? slug([...boxes].join("_")) : `${boxes.size}-cajas`);
  if (hasTime) parts.push(from, to);
  return parts.join("_") + "." + format;
}

export type CoverageBar = { left: number; width: number; outside: boolean };

/** Dónde cae el rango elegido dentro de la cobertura, en porcentaje. */
export function coverageBar(start: string, end: string, from: string, to: string): CoverageBar | null {
  if (!start || !end || !from || !to) return null;
  const total = Math.max(1, daysBetween(start, end));
  const left = Math.min(1, Math.max(0, daysBetween(start, from) / total));
  const right = Math.min(1, Math.max(0, (daysBetween(start, to) + 1) / total));
  return {
    left: left * PERCENT,
    width: Math.max(MIN_BAR_WIDTH_PERCENT, (right - left) * PERCENT),
    outside: from < start || to > end,
  };
}
