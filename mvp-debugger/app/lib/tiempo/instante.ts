// 3. Instantes reales (ISO con zona o `Z`) leídos en la hora del sitio.

import { fechaCorta } from "./calendario";
import { LARGO_ANIO, LARGO_FECHA, LARGO_HORA_MINUTO, LOCALE, ZONA_SITIO } from "./zona";

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

/** Qué día es HOY en el sitio, `YYYY-MM-DD`. No es el día del navegador ni el
 *  de UTC: a las 19:00 de Costa Rica en UTC ya es mañana. */
export function hoyEnSitio(ahora: Date = new Date()): string {
  return partes(ahora).fecha;
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
