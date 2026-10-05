"use client";
// Baja el catálogo de tablas exportables (`GET /exportar/relaciones`).
//
// NO usa `fetchAnalytics` a propósito: aquel cliente inyecta el rango en toda
// URL, y este catálogo no depende del rango. Con él, mover una fecha volvería a
// pedir las nueve tablas (unos 225 ms de latencia cada vez) para recibir
// exactamente lo mismo.
//
// Nunca lanza: sin catálogo la vista no tiene formulario que ofrecer, así que el
// fallo se devuelve con código y la pantalla decide qué decir.
import {
  exportRelationsSchema,
  type ExportRelation,
} from "@/app/lib/analitica/contracts/exportar";
import { failure, type AnalyticsFailure, type AnalyticsResult } from "@/app/lib/analitica/errors";

/** Pasa por el proxy JSON de siempre: es metadato, no un archivo. */
export const RELATIONS_URL = "/api/historico/exportar/relaciones";

const TIMEOUT_MS = 10_000;
const UNAUTHORIZED_STATUS = 401;
const BAD_GATEWAY_STATUS = 502;
const GATEWAY_TIMEOUT_STATUS = 504;

export async function loadExportRelations(): Promise<AnalyticsResult<readonly ExportRelation[]>> {
  try {
    const response = await fetch(RELATIONS_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, failure: httpFailure(response.status) };
    // Un cuerpo que no es JSON y uno que no cumple el contrato son el mismo
    // fallo: los dos dejan a la vista sin catálogo utilizable.
    const body: unknown = await response.json().catch(() => null);
    const parsed = exportRelationsSchema.safeParse(body);
    if (!parsed.success) {
      return { ok: false, failure: failure("MALFORMED_RESPONSE", { detail: parsed.error.message }) };
    }
    return { ok: true, data: parsed.data };
  } catch (error) {
    return { ok: false, failure: transportFailure(error) };
  }
}

function httpFailure(status: number): AnalyticsFailure {
  if (status === UNAUTHORIZED_STATUS) return failure("UNAUTHORIZED", { status });
  if (status === BAD_GATEWAY_STATUS || status === GATEWAY_TIMEOUT_STATUS) {
    return failure("SERVICE_UNAVAILABLE", { status });
  }
  return failure("UPSTREAM_ERROR", { status });
}

function transportFailure(error: unknown): AnalyticsFailure {
  if (error instanceof Error && error.name === "TimeoutError") return failure("TIMEOUT");
  return failure("NETWORK", { detail: error instanceof Error ? error.message : String(error) });
}
