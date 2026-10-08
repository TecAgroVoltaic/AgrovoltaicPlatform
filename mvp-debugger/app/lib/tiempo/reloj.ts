// 2. Reloj del sitio: hora de pared de Costa Rica `YYYY-MM-DDTHH:MM:SS`, sin
// zona (así la guardan las tablas PV y así la interpretan los servicios). Costa
// Rica no tiene horario de verano: sumar segundos a su hora de pared es exacto.

import { LARGO_RELOJ } from "./zona";

const MS_PER_SECOND = 1000;

/** Suma segundos a una hora de pared `YYYY-MM-DDTHH:MM[:SS]` y devuelve otra
 *  hora de pared `YYYY-MM-DDTHH:MM:SS`. No pasa por ninguna zona. */
export function moverReloj(reloj: string, segundos: number): string {
  const [fecha, hora = "00:00:00"] = reloj.split("T");
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const [h = 0, m = 0, s = 0] = hora.split(":").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia, h, m, s) + segundos * MS_PER_SECOND)
    .toISOString()
    .slice(0, LARGO_RELOJ);
}
