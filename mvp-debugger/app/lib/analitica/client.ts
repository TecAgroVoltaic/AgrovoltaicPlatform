"use client";
// Cliente de la capa de análisis. Habla con las rutas `/api/historico/*` de este
// mismo servidor, NUNCA con el servicio Python: la API key se inyecta del lado
// servidor (ver app/lib/upstream.ts) y el navegador no la ve nunca.
//
// La directiva "use client" es una guarda, no un detalle: las URLs son relativas
// y solo resuelven en el navegador. Si un Server Component intentara llamar acá,
// falla al importar y no en producción a las tres de la mañana.
//
// Devuelve un `AnalyticsResult` en vez de lanzar: los cuatro estados de una
// consulta (carga, dato, vacío, error) son igual de normales en este producto, y
// un try/catch los reparte entre dos caminos distintos.
import type { ZodType } from "zod";

import { servidorApagado } from "@/app/lib/client";
import { failure, type AnalyticsResult } from "@/app/lib/analitica/errors";
import { rangeToParams } from "@/app/lib/analitica/urlRange";
import type { DateRange } from "@/app/lib/analitica/dateRange";

const ANALYTICS_BASE_PATH = "/api/historico";
const DEFAULT_TIMEOUT_MS = 30_000;
const UNAUTHORIZED_STATUS = 401;

/** Firma mínima de `fetch`: se inyecta para poder probar sin red (DIP). */
export type HttpFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type AnalyticsRequest<TData> = {
  /** Ruta bajo `/api/historico`, sin barra inicial (`"analitica/energia"`). */
  readonly path: string;
  readonly range: DateRange;
  /** Parámetros propios del endpoint, además del rango. */
  readonly query?: Readonly<Record<string, string>>;
  /** Contrato de la respuesta. Se valida SIEMPRE antes de devolverla. */
  readonly schema: ZodType<TData>;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
};

export type AnalyticsDeps = { readonly httpFetch?: HttpFetch };

export function buildAnalyticsUrl(
  path: string,
  range: DateRange,
  query: Readonly<Record<string, string>> = {},
): string {
  const params = new URLSearchParams({ ...rangeToParams(range), ...query });
  return `${ANALYTICS_BASE_PATH}/${path}?${params.toString()}`;
}

export async function fetchAnalytics<TData>(
  request: AnalyticsRequest<TData>,
  deps: AnalyticsDeps = {},
): Promise<AnalyticsResult<TData>> {
  const httpFetch = deps.httpFetch ?? globalThis.fetch;
  const url = buildAnalyticsUrl(request.path, request.range, request.query);
  const abort = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    abort.abort();
  }, request.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  request.signal?.addEventListener("abort", () => abort.abort(), { once: true });

  try {
    const response = await httpFetch(url, { cache: "no-store", signal: abort.signal });
    const body = await response.text();
    if (!response.ok) return { ok: false, failure: describeHttpFailure(response.status, body) };
    return validate(body, request.schema);
  } catch (error) {
    if (timedOut) return { ok: false, failure: failure("TIMEOUT", { detail: url }) };
    return { ok: false, failure: failure("NETWORK", { detail: describeError(error) }) };
  } finally {
    clearTimeout(timer);
  }
}

function validate<TData>(body: string, schema: ZodType<TData>): AnalyticsResult<TData> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(body);
  } catch (error) {
    return {
      ok: false,
      failure: failure("MALFORMED_RESPONSE", { detail: describeError(error) }),
    };
  }
  const result = schema.safeParse(parsedJson);
  if (!result.success) {
    return {
      ok: false,
      failure: failure("MALFORMED_RESPONSE", { detail: result.error.message }),
    };
  }
  return { ok: true, data: result.data };
}

function describeHttpFailure(status: number, body: string) {
  const detail = readDetail(body);
  if (status === UNAUTHORIZED_STATUS) return failure("UNAUTHORIZED", { status });
  if (servidorApagado({ status, ok: false, data: safeJson(body) })) {
    return failure("SERVICE_UNAVAILABLE", { status, detail });
  }
  return failure("UPSTREAM_ERROR", {
    status,
    detail,
    ...(detail ? { message: detail } : {}),
  });
}

/** FastAPI responde `{detail}`; el proxy de /api/*, `{error}`. */
function readDetail(body: string): string | undefined {
  const parsed = safeJson(body);
  if (parsed === null) return undefined;
  const detail = "detail" in parsed ? parsed.detail : "error" in parsed ? parsed.error : null;
  return typeof detail === "string" ? detail : undefined;
}

function safeJson(body: string): object | null {
  try {
    const parsed: unknown = JSON.parse(body);
    return typeof parsed === "object" ? parsed : null;
  } catch {
    // Un cuerpo que no es JSON no es un fallo aparte: el código HTTP ya dijo qué
    // pasó y el cuerpo crudo viaja en `detail`.
    return null;
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
