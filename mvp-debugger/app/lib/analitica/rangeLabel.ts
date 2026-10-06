// Rangos de fechas en corto, como los lee una persona: «3 may – 1 jun 2026».
// Lo usan el chip de rango de las secciones con cabecera propia y las fechas de
// una alerta, para que las dos digan un período con las mismas palabras.
import { addDays, type DateRange, type IsoDate } from "@/app/lib/analitica/dateRange";
import { GRANULARITY_LABEL } from "@/app/lib/analitica/granularity";
import { fechaCorta } from "@/app/lib/tiempo";

const YEAR_LENGTH = 4;
const MONTH_LENGTH = 7;

/** Del primer al último día, ambos INCLUSIVOS: «26 – 31 ago 2026», «3 jul – 9
 *  ago 2026», «28 dic 2025 – 3 ene 2026». Sin `withYear` el año se omite, salvo
 *  que las dos puntas caigan en años distintos: ahí callarlo sería ambiguo. */
export function dateSpanLabel(first: IsoDate, last: IsoDate, withYear = true): string {
  const sameYear = first.slice(0, YEAR_LENGTH) === last.slice(0, YEAR_LENGTH);
  const sameMonth = first.slice(0, MONTH_LENGTH) === last.slice(0, MONTH_LENGTH);
  const end = fechaCorta(last, withYear || !sameYear);
  if (first === last) return end;
  if (sameMonth) return `${Number(first.slice(-2))} – ${end}`;
  return `${fechaCorta(first, !sameYear)} – ${end}`;
}

/** «3 may – 1 jun 2026 · diaria». El fin se muestra INCLUSIVO, como lo lee una
 *  persona, y el año va una sola vez si las dos puntas lo comparten. */
export function rangeLabel(range: DateRange): string {
  const dates = dateSpanLabel(range.from, addDays(range.toExclusive, -1));
  return `${dates} · ${GRANULARITY_LABEL[range.granularity]}`;
}
