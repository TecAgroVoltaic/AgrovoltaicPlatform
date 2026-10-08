// El modelo de lo que se está mirando en /alertas: filtros, página y alerta
// abierta, y la única puerta para cambiarlo. Puro: sin React ni URL.
import {
  ALERT_STATUS_WIRE,
  ALL_ALERT_STATUSES,
  CLOSED_ALERT_STATUSES,
  OPEN_ALERT_STATUSES,
  type AlertSeverity,
  type AlertStatus,
} from "@/app/lib/alertas/vocabulary";

export const ALERTS_PARAM = {
  status: "estado",
  severity: "severidad",
  type: "tipo",
  search: "q",
  offset: "offset",
  selected: "alerta",
} as const;

export const ALERTS_PAGE_SIZE = 20;
export const FIRST_OFFSET = 0;
const WIRE_LIST_SEPARATOR = ",";

/** Los cortes de estado que ofrece la vista: las abiertas (por defecto), las
 *  cerradas, uno solo, o todos. Combinaciones arbitrarias no se ofrecen: nadie
 *  las pidió. */
export type StatusFilter = "open" | "closed" | "all" | AlertStatus;

export type AlertFilters = {
  readonly status: StatusFilter;
  readonly severity: AlertSeverity | null;
  readonly type: string | null;
  readonly search: string;
};

export type AlertsQuery = {
  readonly filters: AlertFilters;
  readonly offset: number;
  readonly selectedId: number | null;
};

export const DEFAULT_ALERT_FILTERS: AlertFilters = {
  status: "open",
  severity: null,
  type: null,
  search: "",
};

export type AlertsQueryChange =
  | { readonly kind: "filters"; readonly filters: AlertFilters }
  | { readonly kind: "page"; readonly offset: number }
  | { readonly kind: "select"; readonly id: number | null };

/** La única puerta para cambiar la consulta. Cambiar un filtro SIEMPRE vuelve a
 *  la primera página: conservar el desplazamiento deja a la persona en la
 *  página cuatro de un resultado de una, mirando un vacío que parece un fallo. */
export function reduceAlertsQuery(query: AlertsQuery, change: AlertsQueryChange): AlertsQuery {
  switch (change.kind) {
    case "filters":
      return { ...query, filters: change.filters, offset: FIRST_OFFSET };
    case "page":
      return { ...query, offset: Math.max(FIRST_OFFSET, change.offset) };
    case "select":
      return { ...query, selectedId: change.id };
  }
}

export function isDefaultFilters(filters: AlertFilters): boolean {
  return (
    filters.status === DEFAULT_ALERT_FILTERS.status &&
    filters.severity === null &&
    filters.type === null &&
    filters.search.trim() === ""
  );
}

export function statusesOf(filter: StatusFilter): readonly AlertStatus[] {
  if (filter === "open") return OPEN_ALERT_STATUSES;
  if (filter === "closed") return CLOSED_ALERT_STATUSES;
  if (filter === "all") return ALL_ALERT_STATUSES;
  return [filter];
}

/** El estado o los estados del filtro, como los escribe el backend. */
export function statusWire(filter: StatusFilter): string {
  return statusesOf(filter)
    .map((status) => ALERT_STATUS_WIRE[status])
    .join(WIRE_LIST_SEPARATOR);
}
