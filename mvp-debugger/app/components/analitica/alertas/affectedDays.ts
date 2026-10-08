// Los días afectados como tiras de calendario, una por mes: del primer al último
// día afectado de ese mes, con los afectados marcados. Así se ve de un vistazo
// si la condición fue un día suelto, una racha o días salteados.
import { isIsoDate, type IsoDate } from "@/app/lib/analitica/dateRange";
import { monthKey, monthLabel, moverDias } from "@/app/lib/tiempo";

/** Una alerta vieja puede tener días en muchos meses: se muestran los más
 *  recientes y se dice cuántos quedaron fuera, en vez de un cajón interminable. */
export const MAX_MONTH_STRIPS = 6;

export type DayCell = { readonly date: IsoDate; readonly affected: boolean };

export type MonthStrip = {
  readonly month: string;
  readonly label: string;
  readonly days: readonly DayCell[];
  readonly affectedDates: readonly IsoDate[];
};

export type AffectedDays = {
  readonly strips: readonly MonthStrip[];
  /** Meses con días afectados que no entraron en las tiras. */
  readonly hiddenMonths: number;
};

function monthStrip(month: string, affected: readonly IsoDate[]): MonthStrip {
  const affectedSet = new Set(affected);
  const last = affected[affected.length - 1];
  const days: DayCell[] = [];
  for (let date = affected[0]; date <= last; date = moverDias(date, 1)) {
    days.push({ date, affected: affectedSet.has(date) });
  }
  return { month, label: monthLabel(`${month}-01`), days, affectedDates: affected };
}

/** Ignora lo que no es una fecha de calendario válida: la evidencia es JSON
 *  libre y una fecha rota no puede tumbar la ficha. */
export function affectedDays(dates: readonly string[]): AffectedDays {
  const valid = Array.from(new Set(dates.filter(isIsoDate))).sort();
  const byMonth = new Map<string, IsoDate[]>();
  for (const date of valid) {
    const month = monthKey(date);
    byMonth.set(month, [...(byMonth.get(month) ?? []), date]);
  }
  const months = Array.from(byMonth.keys());
  const shown = months.slice(-MAX_MONTH_STRIPS);
  return {
    strips: shown.map((month) => monthStrip(month, byMonth.get(month) ?? [])),
    hiddenMonths: months.length - shown.length,
  };
}
