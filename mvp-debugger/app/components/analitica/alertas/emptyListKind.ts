// Cuál de los vacíos de la lista se está viendo. Son distintos porque le piden
// a la persona cosas distintas: lanzar la evaluación, no hacer nada, quitar un
// filtro o volver a la primera página. Un vacío sin motivo es el silencio leído
// como salud que este proyecto ya pagó.
import { isDefaultFilters, type AlertsQuery } from "@/app/lib/alertas/query";

export type EmptyListKind =
  /** El evaluador nunca corrió: una lista vacía no dice nada todavía. */
  | "neverEvaluated"
  /** Un enlace viejo apunta a una página que ya no tiene filas. */
  | "pageOutOfRange"
  /** Evaluado y sin abiertas en el período, con los filtros por defecto. */
  | "nothingOpen"
  /** Hay un filtro elegido y nada coincide. */
  | "filteredOut";

const FIRST_OFFSET = 0;

/** `lastEvaluation`: `undefined` mientras el resumen no se conoce (cargando o
 *  caído); `null` si el backend dice que nunca se evaluó. */
export function emptyListKind(query: AlertsQuery, lastEvaluation: string | null | undefined): EmptyListKind {
  if (lastEvaluation === null) return "neverEvaluated";
  if (query.offset > FIRST_OFFSET) return "pageOutOfRange";
  return isDefaultFilters(query.filters) ? "nothingOpen" : "filteredOut";
}
