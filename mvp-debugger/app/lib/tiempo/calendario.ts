// 1. Fechas de calendario `YYYY-MM-DD`. No son instantes: se operan ancladas en
// UTC solo como calculadora de calendario, sin convertir nada.

import { LARGO_FECHA, MS_POR_DIA } from "./zona";

/** Desplaza una fecha `YYYY-MM-DD` en días (negativo hacia atrás). */
export function moverDias(fecha: string, dias: number): string {
  const [anio, mes, dia] = fecha.slice(0, LARGO_FECHA).split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia) + dias * MS_POR_DIA)
    .toISOString()
    .slice(0, LARGO_FECHA);
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
