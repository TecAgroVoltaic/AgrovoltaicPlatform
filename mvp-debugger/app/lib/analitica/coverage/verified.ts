// La cobertura de la BASE, escrita a mano porque ningún endpoint la publica.
// Verificada contra la Supabase de producción el 2026-08-28. Cuando el backend
// la exponga, se reemplaza ACÁ y nada más cambia.
import { addDays } from "@/app/lib/analitica/dateRange";

/** Ventana [from, toExclusive) que la base de datos cubre de verdad. */
export const VERIFIED_COVERAGE = {
  from: "2024-11-10",
  toExclusive: "2026-06-02",
} as const;

/** Días de calendario que la cobertura abarca, y cuántos traen datos. */
export const COVERAGE_FACTS = {
  daysWithData: 274,
  calendarDays: 569,
} as const;

/** Último día que SÍ trae datos (el fin exclusivo menos uno). */
export const LAST_DAY_WITH_DATA = addDays(VERIFIED_COVERAGE.toExclusive, -1);

/** Aviso para un rango que la base no cubre: es la causa más común de un gráfico
 * vacío, y merece decirse antes de que la persona crea que algo se rompió. */
export const OUT_OF_COVERAGE_NOTICE =
  `Fuera de la cobertura de la base: los datos van del ${VERIFIED_COVERAGE.from} ` +
  `al ${LAST_DAY_WITH_DATA} (el sistema dejó de reportar ese día).`;
