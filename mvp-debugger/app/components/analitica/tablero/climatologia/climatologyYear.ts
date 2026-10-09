// El año de la climatología: qué años se ofrecen, cuál vale y cómo viaja en la
// URL. Es estado propio de la sección, independiente del rango global: los KPIs
// miran el período elegido arriba y la climatología siempre un año entero.
import type { DateRange } from "@/app/lib/analitica/dateRange";
import type { CoverageBounds } from "@/app/lib/analitica/contracts/daysWithData";
import type { ParamEntries, ParamReader } from "@/app/lib/analitica/urlRange";
import { calendarYear, moverDias, yearStart } from "@/app/lib/tiempo";

/** `?clima=2026`: en español porque la URL es contrato público, como `desde`. */
export const CLIMATOLOGY_YEAR_PARAM = "clima";

const YEAR_PATTERN = /^\d{4}$/;
const LAST_COVERED_DAY_OFFSET = -1;

/** Los años que toca la cobertura, del más viejo al más nuevo. `hasta` es
 *  exclusivo: un `hasta` del 1 de enero no suma ese año. */
export function yearsWithData(bounds: CoverageBounds): number[] {
  const first = calendarYear(bounds.from);
  const last = calendarYear(moverDias(bounds.toExclusive, LAST_COVERED_DAY_OFFSET));
  return Array.from({ length: Math.max(last - first + 1, 0) }, (_, offset) => first + offset);
}

/** El año pedido en la URL, o null si falta o no es un año de cuatro cifras. */
export function readYearParam(params: ParamReader): number | null {
  const raw = params.get(CLIMATOLOGY_YEAR_PARAM);
  return raw !== null && YEAR_PATTERN.test(raw) ? Number(raw) : null;
}

/** El pedido si tiene datos; si no (o no hay pedido), el último año con datos. */
export function resolveYear(requested: number | null, years: readonly number[]): number | null {
  if (requested !== null && years.includes(requested)) return requested;
  return years.at(-1) ?? null;
}

/** [1 ene, 1 ene del año siguiente): doce meses, con el fin exclusivo de siempre. */
export function yearRange(year: number): DateRange {
  return { from: yearStart(year), toExclusive: yearStart(year + 1), granularity: "month" };
}

/** Query con el `?`, escribiendo el año ENCIMA de la vigente: el rango y todo lo
 *  demás de la vista sobreviven, igual que en `rangeToQuery`. */
export function yearToQuery(year: number, current: ParamEntries): string {
  const params = new URLSearchParams();
  for (const [name, value] of current) {
    if (value !== "" && name !== CLIMATOLOGY_YEAR_PARAM) params.append(name, value);
  }
  params.set(CLIMATOLOGY_YEAR_PARAM, String(year));
  return `?${params.toString()}`;
}
