// La hora del SITIO. Único lugar de la consola que sabe de zonas horarias.
//
// Todo lo que la consola muestra o pide está en hora de Costa Rica, que es donde
// está la planta, y NO en la hora de quien mira: el mismo enlace tiene que
// mostrar lo mismo abierto en San Carlos, en Berlín o en el servidor (UTC). Dos
// bugs salieron de olvidarlo (tests que solo pasaban con el reloj en Costa Rica,
// y «Predicción vs Real» pidiendo un rango vacío desde Europa), así que la regla
// es estructural y no de cuidado:
//
//   Fuera de `tiempo.ts` y `tiempo/` NO se usa el reloj local del navegador. Nada de
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

// Este archivo es el barril: cada concepto vive en su módulo de `tiempo/`.

export { ZONA_SITIO, ETIQUETA_ZONA } from "./tiempo/zona";
export { moverDias, fechaCorta } from "./tiempo/calendario";
export {
  daysInMonth, weekdayMondayFirst, monthKey, monthStart, shiftMonths, monthLabel, longDateLabel,
} from "./tiempo/calendarioMensual";
export { moverReloj } from "./tiempo/reloj";
export { hoyEnSitio, instanteEnSitio, diaEnSitio, momentoEnSitio } from "./tiempo/instante";
export { elapsedSince } from "./tiempo/transcurrido";
