// La aritmética del calendario de actividad, pura: semanas de lunes a domingo,
// etiquetas de mes y textos de cada celda. No lee el reloj: el rango llega de
// afuera. Las fechas `YYYY-MM-DD` se comparan como texto (orden ISO).
import type { ActivityDay, ActivityRow } from "@/app/components/charts/activityCalendar/types";
import { formatCount } from "@/app/lib/descargas/format";
import { fechaCorta, moverDias, shortMonthName, weekdayMondayFirst } from "@/app/lib/tiempo";

export const DAYS_PER_WEEK = 7;
const FIRST_OF_MONTH_SUFFIX = "-01";
const JANUARY_PREFIX = "-01-";
const YEAR_LENGTH = 4;
/** Con menos semanas entre dos etiquetas de mes, la primera pisa a la segunda. */
const MIN_WEEKS_BETWEEN_MONTH_LABELS = 3;

/** Una semana de lunes a domingo; `null` donde el día cae fuera del rango. */
export type CalendarWeek = readonly (string | null)[];

export type MonthLabel = { readonly weekIndex: number; readonly label: string };

/** Las semanas que cubren `[from, to]` (ambos inclusivos). Vacío si el rango está al revés. */
export function buildWeeks(from: string, to: string): CalendarWeek[] {
  if (from > to) return [];
  const weeks: CalendarWeek[] = [];
  for (let monday = moverDias(from, -weekdayMondayFirst(from)); monday <= to; monday = moverDias(monday, DAYS_PER_WEEK)) {
    const weekStart = monday;
    weeks.push(
      Array.from({ length: DAYS_PER_WEEK }, (_, offset) => {
        const date = moverDias(weekStart, offset);
        return date >= from && date <= to ? date : null;
      }),
    );
  }
  return weeks;
}

/** Una etiqueta por mes, en la semana donde empieza. La primera y cada enero
 *  llevan el año: el rango puede cruzar varios. */
export function monthLabels(weeks: readonly CalendarWeek[]): MonthLabel[] {
  const labels: MonthLabel[] = [];
  weeks.forEach((week, weekIndex) => {
    const firstOfMonth = week.find((date) => date?.endsWith(FIRST_OF_MONTH_SUFFIX));
    const date = firstOfMonth ?? (weekIndex === 0 ? week.find((day) => day !== null) : undefined);
    if (!date) return;
    const previous = labels.at(-1);
    if (previous && weekIndex - previous.weekIndex < MIN_WEEKS_BETWEEN_MONTH_LABELS) labels.pop();
    const withYear = labels.length === 0 || date.slice(YEAR_LENGTH).startsWith(JANUARY_PREFIX);
    const month = shortMonthName(date);
    labels.push({ weekIndex, label: withYear ? `${month} ${date.slice(0, YEAR_LENGTH)}` : month });
  });
  return labels;
}

/** Días del rango que cubren las semanas. */
export function countRangeDays(weeks: readonly CalendarWeek[]): number {
  return weeks.reduce((total, week) => total + week.filter((date) => date !== null).length, 0);
}

/** Días de la fila con datos dentro del rango. */
export function countActiveDays(row: ActivityRow, from: string, to: string): number {
  let active = 0;
  row.days.forEach((day, date) => {
    if (day.level > 0 && date >= from && date <= to) active += 1;
  });
  return active;
}

/** El `title` de una celda: «3 may 2025 · 412 lecturas» o «… · sin datos». */
export function cellTitle(date: string, day: ActivityDay | undefined): string {
  const when = fechaCorta(date, true);
  if (!day || day.level === 0) return `${when} · sin datos`;
  return `${when} · ${formatCount(day.readings)} ${day.readings === 1 ? "lectura" : "lecturas"}`;
}

/** «27 jun – 3 set 2025», con el año en las dos puntas solo si cambian. */
export function rangeLabel(from: string, to: string): string {
  const sameYear = from.slice(0, YEAR_LENGTH) === to.slice(0, YEAR_LENGTH);
  return `${fechaCorta(from, !sameYear)} – ${fechaCorta(to, true)}`;
}

/** El resumen que leen los lectores de pantalla en lugar de la rejilla. */
export function rowSummary(row: ActivityRow, activeDays: number, totalDays: number, from: string, to: string): string {
  return `${row.label}: ${activeDays} de ${totalDays} días con datos, ${rangeLabel(from, to)}`;
}
