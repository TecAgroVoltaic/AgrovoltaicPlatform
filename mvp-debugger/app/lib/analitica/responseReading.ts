// Cómo se lee la respuesta del servicio: el cuerpo de un fallo HTTP traducido a
// un código de la capa de análisis, y el cuerpo de un éxito validado contra su
// contrato. Sin red: lo usa `client.ts` después del `fetch`.
import type { ZodType } from "zod";

import { servidorApagado } from "@/app/lib/client";
import { failure, type AnalyticsFailure, type AnalyticsResult } from "@/app/lib/analitica/errors";

const UNAUTHORIZED_STATUS = 401;

export function validate<TData>(body: string, schema: ZodType<TData>): AnalyticsResult<TData> {
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

export function describeHttpFailure(status: number, body: string): AnalyticsFailure {
  const detail = readDetail(body);
  if (status === UNAUTHORIZED_STATUS) return failure("UNAUTHORIZED", { status });
  if (servidorApagado({ status, ok: false, data: safeJson(body) })) {
    return failure("SERVICE_UNAVAILABLE", { status, detail });
  }
  const payload = safeJson(body);
  return failure("UPSTREAM_ERROR", {
    status,
    detail,
    ...(detail ? { message: detail } : {}),
    ...(payload !== null ? { payload } : {}),
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

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
