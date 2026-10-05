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
