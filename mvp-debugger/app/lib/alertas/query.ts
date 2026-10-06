// Lo que se está mirando en /alertas vive en la URL, junto al rango: filtros,
// página y la alerta abierta. Así una lista filtrada o una ficha se comparten
// pegando el enlace, y «atrás» cierra la ficha como se espera.
//
// Este módulo es puro (sin React ni Next): leer, escribir y cambiar la consulta
// se prueba sin montar nada. Los nombres de los parámetros van en castellano
// porque son contrato público, igual que `desde`/`hasta`.
import type { ParamEntries, ParamReader } from "@/app/lib/analitica/urlRange";
import {
  ALERT_SEVERITY_WIRE,
  ALERT_STATUS_WIRE,
  ALL_ALERT_STATUSES,
  OPEN_ALERT_STATUSES,
  SEVERITY_FROM_WIRE,
  STATUS_FROM_WIRE,
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
const FIRST_OFFSET = 0;
const WIRE_LIST_SEPARATOR = ",";

/** Los cortes de estado que ofrece la vista: las abiertas (por defecto), uno
 *  solo, o todos. Combinaciones arbitrarias no se ofrecen: nadie las pidió. */
export type StatusFilter = "open" | "all" | AlertStatus;

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
  if (filter === "all") return ALL_ALERT_STATUSES;
  return [filter];
}

function statusWire(filter: StatusFilter): string {
  return statusesOf(filter)
    .map((status) => ALERT_STATUS_WIRE[status])
    .join(WIRE_LIST_SEPARATOR);
}

/** Valores fuera de lo conocido vuelven al defecto: el selector muestra el
 *  filtro que de verdad se aplica, así que la corrección queda a la vista. */
function parseStatus(raw: string | null): StatusFilter {
  if (raw === null) return "open";
  const candidates: readonly StatusFilter[] = ["open", "all", ...ALL_ALERT_STATUSES];
  return candidates.find((filter) => statusWire(filter) === raw) ?? "open";
}

function parseNonNegativeInt(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

export function parseAlertsQuery(params: ParamReader): AlertsQuery {
  const severityWire = params.get(ALERTS_PARAM.severity);
  const type = params.get(ALERTS_PARAM.type)?.trim() ?? "";
  const selectedId = parseNonNegativeInt(params.get(ALERTS_PARAM.selected));
  const hasSelection = selectedId !== null && selectedId > 0;
  return {
    filters: {
      status: parseStatus(params.get(ALERTS_PARAM.status)),
      severity: severityWire === null ? null : (SEVERITY_FROM_WIRE.get(severityWire) ?? null),
      type: type === "" ? null : type,
      search: params.get(ALERTS_PARAM.search) ?? "",
    },
    offset: parseNonNegativeInt(params.get(ALERTS_PARAM.offset)) ?? FIRST_OFFSET,
    selectedId: hasSelection ? selectedId : null,
  };
}

/** Gravedad, tipo y búsqueda: se escriben igual en la URL y en la API. */
function narrowingParams(filters: AlertFilters): Record<string, string> {
  const search = filters.search.trim();
  return {
    ...(filters.severity ? { [ALERTS_PARAM.severity]: ALERT_SEVERITY_WIRE[filters.severity] } : {}),
    ...(filters.type ? { [ALERTS_PARAM.type]: filters.type } : {}),
    ...(search ? { [ALERTS_PARAM.search]: search } : {}),
  };
}

/** Los parámetros propios de la consulta, sin los que valen el defecto: un
 *  enlace sin ruido se lee y se comparte mejor. */
function ownParams(query: AlertsQuery): Record<string, string> {
  const { filters } = query;
  return {
    ...(filters.status !== "open" ? { [ALERTS_PARAM.status]: statusWire(filters.status) } : {}),
    ...narrowingParams(filters),
    ...(query.offset > FIRST_OFFSET ? { [ALERTS_PARAM.offset]: String(query.offset) } : {}),
    ...(query.selectedId !== null ? { [ALERTS_PARAM.selected]: String(query.selectedId) } : {}),
  };
}

const OWN_PARAM_NAMES: ReadonlySet<string> = new Set(Object.values(ALERTS_PARAM));

/** Query string con `?`. Conserva todo lo ajeno (el rango, sobre todo) y
 *  reescribe solo lo de esta vista. */
export function alertsQueryToSearch(query: AlertsQuery, current: ParamEntries = []): string {
  const params = new URLSearchParams();
  for (const [name, value] of current) {
    if (value !== "" && !OWN_PARAM_NAMES.has(name)) params.append(name, value);
  }
  for (const [name, value] of Object.entries(ownParams(query))) params.set(name, value);
  const search = params.toString();
  return search ? `?${search}` : "";
}

/** Los parámetros de `GET /alertas`, además del rango. */
export function alertsListParams(query: AlertsQuery): Record<string, string> {
  return {
    [ALERTS_PARAM.status]: statusWire(query.filters.status),
    ...narrowingParams(query.filters),
    limite: String(ALERTS_PAGE_SIZE),
    offset: String(query.offset),
  };
}
