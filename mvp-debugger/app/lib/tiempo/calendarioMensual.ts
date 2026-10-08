// 1b. Calendario mensual. Lo que necesita un calendario: el mes, su largo y en
// qué día de la semana cae cada fecha. Misma regla que `calendario.ts`:
// aritmética UTC sobre la fecha de calendario, sin reloj local.

import { LARGO_FECHA } from "./zona";

const LONG_MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre",
];
const DAYS_PER_WEEK = 7;
const SUNDAY_UTC_INDEX = 0;
const MONTHS_PER_YEAR = 12;
const YEAR_MONTH_LENGTH = 7;  // YYYY-MM

function calendarParts(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.slice(0, LARGO_FECHA).split("-").map(Number);
  return { year, month, day };
}

function isoFromParts(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, LARGO_FECHA);
}

/** Días que tiene el mes (`month` de 1 a 12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Día de la semana con el lunes primero: 0 = lunes … 6 = domingo. */
export function weekdayMondayFirst(date: string): number {
  const { year, month, day } = calendarParts(date);
  const sundayFirst = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return sundayFirst === SUNDAY_UTC_INDEX ? DAYS_PER_WEEK - 1 : sundayFirst - 1;
}

/** El mes de `date` como `YYYY-MM`. */
export function monthKey(date: string): string {
  return date.slice(0, YEAR_MONTH_LENGTH);
}

/** El primer día del mes de `date`, `YYYY-MM-01`. */
export function monthStart(date: string): string {
  return `${monthKey(date)}-01`;
}

/** Corre `date` `months` meses conservando el día; si el mes destino es más
 *  corto (31 ene + 1 mes), cae en su último día y no se desborda a marzo. */
export function shiftMonths(date: string, months: number): string {
  const { year, month, day } = calendarParts(date);
  const monthIndex = year * MONTHS_PER_YEAR + (month - 1) + months;
  const targetYear = Math.floor(monthIndex / MONTHS_PER_YEAR);
  const targetMonth = (monthIndex % MONTHS_PER_YEAR) + 1;
  return isoFromParts(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)));
}

/** El mes de `date` con su año: «mayo 2026». */
export function monthLabel(date: string): string {
  const { year, month } = calendarParts(date);
  return `${LONG_MONTH_NAMES[month - 1] ?? "?"} ${year}`;
}

/** La fecha completa, para lectores de pantalla: «3 de mayo de 2026». */
export function longDateLabel(date: string): string {
  const { year, month, day } = calendarParts(date);
  return `${day} de ${LONG_MONTH_NAMES[month - 1] ?? "?"} de ${year}`;
}
