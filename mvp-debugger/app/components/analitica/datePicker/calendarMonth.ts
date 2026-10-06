// La aritmética del calendario mensual, sin React: qué celdas pinta un mes, a
// dónde lleva cada tecla y qué meses ofrece el salto rápido. Todo sobre fechas
// de calendario `YYYY-MM-DD` con los helpers de `tiempo.ts`.
import { addDays, type IsoDate } from "@/app/lib/analitica/dateRange";
import {
  daysInMonth,
  monthKey,
  monthStart,
  shiftMonths,
  weekdayMondayFirst,
} from "@/app/lib/tiempo";

const DAYS_PER_WEEK = 7;
const LAST_WEEKDAY_INDEX = DAYS_PER_WEEK - 1;
const DAY_DIGITS = 2;

/** Una semana de lunes a domingo; `null` es un hueco fuera del mes. */
export type CalendarWeek = readonly (IsoDate | null)[];

/** Las semanas del mes de `date`, completas de lunes a domingo. */
export function monthWeeks(date: IsoDate): readonly CalendarWeek[] {
  const first = monthStart(date);
  const [year, month] = first.split("-").map(Number);
  const leadingBlanks = weekdayMondayFirst(first);
  const cells: (IsoDate | null)[] = Array.from({ length: leadingBlanks }, () => null);
  for (let offset = 0; offset < daysInMonth(year, month); offset += 1) cells.push(addDays(first, offset));
  while (cells.length % DAYS_PER_WEEK !== 0) cells.push(null);
  const weeks: CalendarWeek[] = [];
  for (let start = 0; start < cells.length; start += DAYS_PER_WEEK) {
    weeks.push(cells.slice(start, start + DAYS_PER_WEEK));
  }
  return weeks;
}

const KEY_MOVES: Readonly<Record<string, (date: IsoDate) => IsoDate>> = {
  ArrowLeft: (date) => addDays(date, -1),
  ArrowRight: (date) => addDays(date, 1),
  ArrowUp: (date) => addDays(date, -DAYS_PER_WEEK),
  ArrowDown: (date) => addDays(date, DAYS_PER_WEEK),
  Home: (date) => addDays(date, -weekdayMondayFirst(date)),
  End: (date) => addDays(date, LAST_WEEKDAY_INDEX - weekdayMondayFirst(date)),
  PageUp: (date) => shiftMonths(date, -1),
  PageDown: (date) => shiftMonths(date, 1),
};

/** A dónde lleva la tecla el cursor, o null si la tecla no mueve. Los días sin
 *  datos NO se saltean: se puede pasar por ellos, solo que no elegirlos. */
export function moveByKey(date: IsoDate, key: string): IsoDate | null {
  const move = KEY_MOVES[key];
  return move ? move(date) : null;
}

/** El mismo día en el mes `targetMonthKey` (`YYYY-MM`), recortado a su largo. */
export function sameDayInMonth(date: IsoDate, targetMonthKey: string): IsoDate {
  const [year, month] = targetMonthKey.split("-").map(Number);
  const day = Math.min(Number(date.slice(-DAY_DIGITS)), daysInMonth(year, month));
  return `${targetMonthKey}-${String(day).padStart(DAY_DIGITS, "0")}`;
}

/** Los meses `YYYY-MM` entre dos fechas, ambos extremos incluidos. */
export function monthsBetween(first: IsoDate, last: IsoDate): readonly string[] {
  const months: string[] = [];
  for (let cursor = monthStart(first); monthKey(cursor) <= monthKey(last); cursor = shiftMonths(cursor, 1)) {
    months.push(monthKey(cursor));
  }
  return months;
}

/** Los meses que tienen al menos un día de la lista. */
export function monthsWithData(days: Iterable<IsoDate>): ReadonlySet<string> {
  const months = new Set<string>();
  for (const day of days) months.add(monthKey(day));
  return months;
}
