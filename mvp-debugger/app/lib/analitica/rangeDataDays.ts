// Cuántos días del rango traen datos, y si sus bordes caen en un día vacío.
//
// Un rango con días vacíos en el medio es VÁLIDO (3 may – 1 jun pasa por el
// hueco del 22 al 24 de mayo): no se rechaza, se cuenta. Lo que sí merece aviso
// es un rango que llega por URL empezando o terminando en un día sin datos,
// porque el calendario ya no deja armarlo y la persona no sabe por qué el
// gráfico arranca más tarde de lo que pidió.
import { addDays, rangeDays, type DateRange, type IsoDate } from "@/app/lib/analitica/dateRange";
import type { CoverageBounds } from "@/app/lib/analitica/contracts/daysWithData";

export type RangeDataDays = {
  readonly calendarDays: number;
  readonly daysWithData: number;
  readonly startsWithoutData: boolean;
  readonly endsWithoutData: boolean;
};

/** Recorre los días CON datos (cientos) y no los del rango: un rango pegado a
 *  mano en la URL puede abarcar siglos. */
export function rangeDataDays(range: DateRange, days: ReadonlySet<IsoDate>): RangeDataDays {
  let daysWithData = 0;
  for (const day of days) {
    if (day >= range.from && day < range.toExclusive) daysWithData += 1;
  }
  return {
    calendarDays: rangeDays(range),
    daysWithData,
    startsWithoutData: !days.has(range.from),
    endsWithoutData: !days.has(addDays(range.toExclusive, -1)),
  };
}

/** El aviso que corresponde, o null si el rango no lo necesita. */
export function rangeDataNotice(
  range: DateRange,
  summary: RangeDataDays,
  coverage: CoverageBounds,
): string | null {
  if (summary.daysWithData === 0) {
    const lastDay = addDays(coverage.toExclusive, -1);
    return `Ningún día del rango tiene datos: los datos van del ${coverage.from} al ${lastDay}.`;
  }
  const edges = [
    summary.startsWithoutData ? `empieza (${range.from})` : null,
    summary.endsWithoutData ? `termina (${addDays(range.toExclusive, -1)})` : null,
  ].filter((edge): edge is string => edge !== null);
  if (edges.length === 0) return null;
  return `El rango ${edges.join(" y ")} en un día sin datos: esos días no aportan lecturas.`;
}
