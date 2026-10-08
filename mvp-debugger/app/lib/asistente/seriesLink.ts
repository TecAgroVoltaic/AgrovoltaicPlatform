// El enlace «Abrir en Series» de un gráfico del asistente: la misma variable y
// el mismo rango con que el agente lo pidió, en la vista que lo explora a fondo.
import type { ChartRequest } from "@/app/lib/asistente/messageBlocks";
import { RANGE_PARAM } from "@/app/lib/analitica/urlRange";

const SERIES_PATH = "/series";
const VARIABLES_PARAM = "variables";

/** Sin fechas en el pedido (el agente usó su ventana por defecto) el enlace
 *  lleva solo las variables, y Series abre con su rango por defecto. */
export function seriesHref(request: ChartRequest): string {
  const params = new URLSearchParams({ [VARIABLES_PARAM]: request.variables.join(",") });
  if (request.from) params.set(RANGE_PARAM.from, request.from);
  if (request.toExclusive) params.set(RANGE_PARAM.toExclusive, request.toExclusive);
  if (request.granularity) params.set(RANGE_PARAM.granularity, request.granularity);
  return `${SERIES_PATH}?${params.toString()}`;
}
