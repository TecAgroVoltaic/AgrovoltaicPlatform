// `agent:tool_result` de Flow → el `paso` de tool que arma `lazo.ejecutar_tool`
// en el backend. Es lo que leen `buildBlocks` (salida con las claves `_`), la
// lista de pasos en vivo (`error`) y la traza (`ms`, `falla`).
import { readToolError } from "@/app/lib/asistente/flow/toolError";
import type { ToolResultEvent } from "@/app/lib/asistente/flow/flowEvents";

export type ToolStep = Readonly<Record<string, unknown>> & { readonly error: boolean };

export function toolStepFrom(result: ToolResultEvent): ToolStep {
  const toolError = readToolError(result.error);
  // Sin `ok` (runtime anterior a la fase 1) solo cuenta como falla si trae error.
  const failed = result.ok === undefined ? toolError !== null : !result.ok;
  const falla = failed ? toolError?.falla : undefined;
  return {
    tipo: "tool",
    nombre: result.toolName,
    input: result.input,
    // En el backend la salida de una tool fallida es el texto del error. Con
    // `payloadTruncated` no llega payload: el paso queda sin bloques visuales.
    salida: withReport(result.payload) ?? (failed ? toolError?.message : undefined) ?? {},
    error: failed,
    ...(result.ms === undefined ? {} : { ms: result.ms }),
    ...(falla === undefined ? {} : { falla }),
    ...(result.payloadTruncated ? { salida_truncada: true } : {}),
  };
}

/** El informe de `preparar_informe` va en `descarga` (sin `_`, lo lee el LLM), así
 *  que el backend manda una copia en `_informe` para Flow: vuelve a `descarga`,
 *  que es el marcador que lee `MARKER_EXTRACTORS`. */
function withReport(payload: unknown): unknown {
  if (typeof payload !== "object" || payload === null || !("_informe" in payload)) return payload;
  const { _informe, ...rest } = payload as Record<string, unknown>;
  return { ...rest, descarga: _informe };
}
