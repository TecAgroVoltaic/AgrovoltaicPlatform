// El rango de fechas: el parámetro de primera clase de todo el sistema.
//
// DOS reglas que no se pueden romper y por eso están en los nombres y no en un
// comentario perdido:
//
// 1. El fin es EXCLUSIVO (`toExclusive`). El backend define la ventana como
//    [desde, hasta), así que un campo llamado `to` invitaría a perder o duplicar
//    el último día en cada llamada.
// 2. Estas fechas son FECHAS DE CALENDARIO, no instantes. Los timestamps de la
//    base están etiquetados UTC pero guardan hora local de Costa Rica: convertir
//    zona horaria acá correría seis horas todos los perfiles diarios. Por eso la
//    aritmética usa Date.UTC sobre `YYYY-MM-DD` y nunca el reloj local.
import type { Granularity } from "@/app/lib/analitica/granularity";

/** Fecha de calendario en formato ISO corto, `YYYY-MM-DD`. */
export type IsoDate = string;

/** Ventana de análisis: [from, toExclusive) con su grano de agregación. */
export type DateRange = {
  readonly from: IsoDate;
  readonly toExclusive: IsoDate;
  readonly granularity: Granularity;
};

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_LENGTH = 10;
const MILLISECONDS_PER_DAY = 86_400_000;

function toUtcTimestamp(date: IsoDate): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/** true si es `YYYY-MM-DD` Y además existe en el calendario (no `2026-02-30`). */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const timestamp = toUtcTimestamp(value);
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString().startsWith(value);
}

/** Días de calendario entre dos fechas ISO. Negativo si `to` es anterior. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcTimestamp(to) - toUtcTimestamp(from)) / MILLISECONDS_PER_DAY);
}

/** Días que cubre el rango. Con fin exclusivo, [d, d+1) es exactamente 1 día. */
export function rangeDays(range: DateRange): number {
  return daysBetween(range.from, range.toExclusive);
}

/** Desplaza una fecha ISO en días (negativo hacia atrás). */
export function addDays(date: IsoDate, days: number): IsoDate {
  return new Date(toUtcTimestamp(date) + days * MILLISECONDS_PER_DAY)
    .toISOString()
    .slice(0, ISO_DATE_LENGTH);
}

/** true si las dos ventanas [from, toExclusive) comparten al menos un día. */
export function rangesOverlap(
  first: Pick<DateRange, "from" | "toExclusive">,
  second: Pick<DateRange, "from" | "toExclusive">,
): boolean {
  return first.from < second.toExclusive && second.from < first.toExclusive;
}

/** Rango en fechas INCLUSIVAS, que es como lo lee una persona: el fin
 * exclusivo `2026-06-02` se muestra como `2026-06-01`, el último día que entra. */
export function formatRange(range: DateRange): string {
  const lastIncludedDay = addDays(range.toExclusive, -1);
  return `${range.from} a ${lastIncludedDay}`;
}
