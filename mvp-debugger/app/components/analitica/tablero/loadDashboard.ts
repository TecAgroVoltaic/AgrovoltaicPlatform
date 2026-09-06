// Carga del tablero, del lado SERVIDOR.
//
// No usa `app/lib/analitica/client.ts` a propósito: aquel es "use client" y sus
// URLs son relativas, así que solo resuelve en el navegador. Acá se habla
// directo con el servicio Python usando la configuración de servidor, que es
// donde vive la API key. Un salto menos que pasar por `/api/historico`, y el
// navegador sigue sin ver la clave.
//
// Devuelve un `ChartState` ya resuelto: la página no decide nada sobre errores
// ni vacíos, solo pinta el estado que le llega.
import { emptyChart, errorChart, readyChart, type ChartState } from "@/app/components/charts";
import { dashboardSummarySchema, type DashboardSummary } from "@/app/lib/analitica/contracts/tablero";
import { failure, FAILURE_MESSAGE, type AnalyticsFailure } from "@/app/lib/analitica/errors";
import { HISTORICO } from "@/app/lib/config";
import { OUT_OF_COVERAGE_NOTICE } from "@/app/lib/analitica/coverage";
import { RANGE_PARAM } from "@/app/lib/analitica/urlRange";
import type { DateRange } from "@/app/lib/analitica/dateRange";

const SUMMARY_PATH = "analitica/resumen";
const REQUEST_TIMEOUT_MS = 20_000;
const UNAUTHORIZED_STATUS = 401;

/** Firma mínima de `fetch`, inyectable para probar sin red (DIP). */
export type ServerFetch = (url: string, init?: RequestInit) => Promise<Response>;

export type DashboardState = ChartState<DashboardSummary>;

/**
 * Pide el resumen del rango y lo convierte en uno de los cuatro estados.
 *
 * UNA sola petición, y es deliberado. Comparados los dos endpoints con el mismo
 * rango, `analitica/energia` es un SUBCONJUNTO de `analitica/resumen`: sus
 * bloques `energia_ac` y `confianza` son idénticos clave por clave, y sus
 * energías por arreglo son las mismas que `energia_periodo`. Pedirlo sería un
 * segundo viaje por números que ya están en la mano y una segunda fuente de
 * verdad para la misma casilla. Además expone `energia_pv*_wh`, que pese al
 * sufijo va en kWh: `resumen` no tiene ni una clave `_wh` que se pueda leer mal.
 *
 * Una petición es una espera, que era el objetivo. Si mañana entra una fuente
 * que resumen NO cubra, entra acá y en paralelo, nunca encadenada en un
 * componente.
 */
export async function loadDashboard(
  range: DateRange,
  httpFetch: ServerFetch = fetch,
): Promise<DashboardState> {
  const summary = await fetchSummary(range, httpFetch);
  if (!summary.ok) return errorChart(reportFailure(summary.failure));
  return guardCoverage(summary.data);
}

/** El rango puede no tocar ni un día de la base: eso no es un error, es un vacío
 * con causa, y decirlo evita que nueve casillas repitan el mismo «sin dato». */
function guardCoverage(summary: DashboardSummary): DashboardState {
  const confidence = summary.confidence;
  if (confidence === null) return readyChart(summary);
  if (confidence.daysInRange === 0) {
    return emptyChart("OUT_OF_COVERAGE", {
      message: confidence.warning ?? undefined,
      hint: OUT_OF_COVERAGE_NOTICE,
    });
  }
  if (confidence.daysWithData === 0) {
    return emptyChart("NO_ROWS", { hint: OUT_OF_COVERAGE_NOTICE });
  }
  return readyChart(summary);
}

type FetchOutcome =
  | { readonly ok: true; readonly data: DashboardSummary }
  | { readonly ok: false; readonly failure: AnalyticsFailure };

async function fetchSummary(range: DateRange, httpFetch: ServerFetch): Promise<FetchOutcome> {
  const url = buildSummaryUrl(range);
  const abort = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    abort.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await httpFetch(url, {
      cache: "no-store",
      signal: abort.signal,
      headers: HISTORICO.key ? { "x-api-key": HISTORICO.key } : {},
    });
    const body = await response.text();
    if (!response.ok) return { ok: false, failure: httpFailure(response.status, body) };
    return parseBody(body);
  } catch (error) {
    if (timedOut) return { ok: false, failure: failure("TIMEOUT") };
    return { ok: false, failure: failure("NETWORK", { detail: describeError(error) }) };
  } finally {
    clearTimeout(timer);
  }
}

/** El endpoint solo entiende `desde`/`hasta`: la granularidad no le dice nada al
 * resumen, que siempre responde escalares del período completo. */
export function buildSummaryUrl(range: DateRange): string {
  const params = new URLSearchParams({
    [RANGE_PARAM.from]: range.from,
    [RANGE_PARAM.toExclusive]: range.toExclusive,
  });
  return `${HISTORICO.url}/${SUMMARY_PATH}?${params.toString()}`;
}

function parseBody(body: string): FetchOutcome {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch (error) {
    return { ok: false, failure: failure("MALFORMED_RESPONSE", { detail: describeError(error) }) };
  }
  const parsed = dashboardSummarySchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, failure: failure("MALFORMED_RESPONSE", { detail: parsed.error.message }) };
  }
  return { ok: true, data: parsed.data };
}

function httpFailure(status: number, body: string): AnalyticsFailure {
  if (status === UNAUTHORIZED_STATUS) return failure("UNAUTHORIZED", { status });
  return failure("UPSTREAM_ERROR", { status, detail: body });
}

/** Registra el fallo con su detalle técnico y devuelve lo que ve la persona.
 * Nunca se silencia: un `ZodError` completo no ayuda en pantalla, pero perderlo
 * dejaría el fallo sin rastro en el servidor. */
function reportFailure(reason: AnalyticsFailure): string {
  console.error("tablero: no se pudo cargar el resumen", reason);
  return FAILURE_MESSAGE[reason.code];
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
