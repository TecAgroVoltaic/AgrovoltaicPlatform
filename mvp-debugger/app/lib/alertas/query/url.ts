// Leer y escribir la consulta de /alertas en la URL y en la API. Leer y
// escribir viven juntos a propósito: separados, un parámetro nuevo se agrega de
// un lado y se olvida del otro. Los nombres de los parámetros van en castellano
// porque son contrato público, igual que `desde`/`hasta`.
import type { ParamEntries, ParamReader } from "@/app/lib/analitica/urlRange";
import {
  ALERT_SEVERITY_WIRE,
  ALL_ALERT_STATUSES,
  SEVERITY_FROM_WIRE,
} from "@/app/lib/alertas/vocabulary";

import {
  ALERTS_PAGE_SIZE,
  ALERTS_PARAM,
  FIRST_OFFSET,
  statusWire,
  type AlertFilters,
  type AlertsQuery,
  type StatusFilter,
} from "./model";

/** Valores fuera de lo conocido vuelven al defecto: el selector muestra el
 *  filtro que de verdad se aplica, así que la corrección queda a la vista. */
function parseStatus(raw: string | null): StatusFilter {
  if (raw === null) return "open";
  const candidates: readonly StatusFilter[] = ["open", "closed", "all", ...ALL_ALERT_STATUSES];
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
