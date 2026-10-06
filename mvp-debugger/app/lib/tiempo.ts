// La hora del SITIO. Único lugar de la consola que sabe de zonas horarias.
//
// Todo lo que la consola muestra o pide está en hora de Costa Rica, que es donde
// está la planta, y NO en la hora de quien mira: el mismo enlace tiene que
// mostrar lo mismo abierto en San Carlos, en Berlín o en el servidor (UTC). Dos
// bugs salieron de olvidarlo (tests que solo pasaban con el reloj en Costa Rica,
// y «Predicción vs Real» pidiendo un rango vacío desde Europa), así que la regla
// es estructural y no de cuidado:
//
//   Fuera de este archivo NO se usa el reloj local del navegador. Nada de
//   `getHours()`, `getDate()`, `setDate()`, ni `toLocaleString()` sin zona. El
//   guard `scripts/smoke-zona-horaria.mjs` lo verifica en el CI.
//
// Hay TRES cosas distintas y cada una tiene su función; mezclarlas es el bug:
//
//   1. FECHA de calendario  `YYYY-MM-DD`           -> `moverDias`, `hoyEnSitio`
//   2. RELOJ del sitio      `YYYY-MM-DDTHH:MM:SS`  -> `moverReloj`
//      (hora de pared de Costa Rica, sin zona: así la guardan las tablas PV y
//      así la interpretan los servicios)
//   3. INSTANTE real        ISO con zona o `Z`     -> `instanteEnSitio`, `diaEnSitio`
//
// Las dos primeras NO son instantes: se operan ancladas en UTC solo como
// calculadora de calendario, sin convertir nada. Costa Rica no tiene horario de
// verano, así que sumar segundos a su hora de pared es exacto todo el año.

/** Zona del sitio. El único literal de zona horaria de la consola. */
export const ZONA_SITIO = "America/Costa_Rica";

/** Cómo se rotula la zona en pantalla. */
export const ETIQUETA_ZONA = "hora local (UTC−6)";

const LOCALE = "es-CR";
const MS_POR_DIA = 86_400_000;
const LARGO_FECHA = 10;   // YYYY-MM-DD
const LARGO_RELOJ = 19;   // YYYY-MM-DDTHH:MM:SS
const LARGO_ANIO = 4;
const LARGO_HORA_MINUTO = 5;  // HH:MM

// ── 1. Fechas de calendario ──────────────────────────────────────────────────

/** Desplaza una fecha `YYYY-MM-DD` en días (negativo hacia atrás). */
export function moverDias(fecha: string, dias: number): string {
  const [anio, mes, dia] = fecha.slice(0, LARGO_FECHA).split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia) + dias * MS_POR_DIA)
    .toISOString()
    .slice(0, LARGO_FECHA);
}

/** Qué día es HOY en el sitio, `YYYY-MM-DD`. No es el día del navegador ni el
 *  de UTC: a las 19:00 de Costa Rica en UTC ya es mañana. */
export function hoyEnSitio(ahora: Date = new Date()): string {
  return partes(ahora).fecha;
}

// Abreviaturas de mes como se dicen en Costa Rica («set», no «sep»). Se escriben
// a mano y no con `Intl`: una fecha de calendario no es un instante y no hay
// zona que aplicarle, y así el texto no depende del ICU del navegador.
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

/** Una fecha `YYYY-MM-DD` como «3 may» o, con año, «3 may 2026». */
export function fechaCorta(fecha: string, conAnio: boolean): string {
  const [anio, mes, dia] = fecha.slice(0, LARGO_FECHA).split("-").map(Number);
  const texto = `${dia} ${MESES_CORTOS[mes - 1] ?? "?"}`;
  return conAnio ? `${texto} ${anio}` : texto;
}

// ── 1b. Calendario mensual ───────────────────────────────────────────────────
// Lo que necesita un calendario: el mes, su largo y en qué día de la semana cae
// cada fecha. Misma regla que arriba: aritmética UTC sobre la fecha de
// calendario, sin reloj local. Identificadores en inglés (regla del proyecto);
// el resto del archivo en español es deuda anterior.

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

// ── 2. Reloj del sitio (hora de pared, sin zona) ─────────────────────────────

/** Suma segundos a una hora de pared `YYYY-MM-DDTHH:MM[:SS]` y devuelve otra
 *  hora de pared `YYYY-MM-DDTHH:MM:SS`. No pasa por ninguna zona. */
export function moverReloj(reloj: string, segundos: number): string {
  const [fecha, hora = "00:00:00"] = reloj.split("T");
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const [h = 0, m = 0, s = 0] = hora.split(":").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia, h, m, s) + segundos * 1000)
    .toISOString()
    .slice(0, LARGO_RELOJ);
}

// ── 3. Instantes reales ──────────────────────────────────────────────────────

function partes(instante: Date): { fecha: string; hora: string } {
  // `en-CA` da YYYY-MM-DD; `hourCycle: h23` evita el "24:00" de medianoche.
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_SITIO, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(instante);
  const de = (tipo: string) => p.find((x) => x.type === tipo)?.value ?? "";
  return {
    fecha: `${de("year")}-${de("month")}-${de("day")}`,
    hora: `${de("hour")}:${de("minute")}:${de("second")}`,
  };
}

function instante(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Un instante real como fecha y hora cortas DEL SITIO. Tolera nulos y basura. */
export function instanteEnSitio(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = instante(iso);
  return d === null ? String(iso)
    : d.toLocaleString(LOCALE, { timeZone: ZONA_SITIO, dateStyle: "short", timeStyle: "short" });
}

/** Un instante real como día legible DEL SITIO. Tolera nulos y basura. */
export function diaEnSitio(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = instante(iso);
  return d === null ? String(iso).slice(0, LARGO_FECHA)
    : d.toLocaleDateString(LOCALE, { timeZone: ZONA_SITIO, year: "numeric", month: "short", day: "2-digit" });
}

/** Cuándo pasó algo, corto y en hora del sitio: «hoy 12:21», «3 oct 09:05» o,
 *  de otro año, «3 oct 2025 09:05». Para la línea bajo el título de un hilo. */
export function momentoEnSitio(instanteReal: Date, ahora: Date = new Date()): string {
  const momento = partes(instanteReal);
  const hoy = partes(ahora).fecha;
  const hora = momento.hora.slice(0, LARGO_HORA_MINUTO);
  if (momento.fecha === hoy) return `hoy ${hora}`;
  const otroAnio = momento.fecha.slice(0, LARGO_ANIO) !== hoy.slice(0, LARGO_ANIO);
  return `${fechaCorta(momento.fecha, otroAnio)} ${hora}`;
}

// ── 4. Tiempo transcurrido ───────────────────────────────────────────────────

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

/** Cuánto pasó entre dos instantes, en la unidad más grande que cabe entera:
 *  «hace 8 s», «hace 12 min», «hace 2 h», «hace 3 d». Es una resta de instantes,
 *  así que no depende de ninguna zona. Un `since` en el futuro (relojes
 *  desfasados entre servidor y navegador) se lee como «hace 0 s», no negativo. */
export function elapsedSince(since: Date, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - since.getTime()) / MS_PER_SECOND));
  if (seconds < SECONDS_PER_MINUTE) return `hace ${seconds} s`;
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  if (minutes < MINUTES_PER_HOUR) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  if (hours < HOURS_PER_DAY) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / HOURS_PER_DAY)} d`;
}
