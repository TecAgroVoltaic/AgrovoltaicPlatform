// El `error` de un `agent:tool_result` fallido. El runtime manda la observación
// sin el prefijo `Error: `; si la herramienta respondió HTTP no-2xx, es un JSON
// `{status, ok, data}` cuyo `data` es el cuerpo del backend:
// `{detail, codigo?, error, falla, _falla}` (fase 2). En error NO viaja `payload`,
// así que la falla con contexto sale de acá. Si no es JSON, se usa el texto.

export type ToolError = {
  /** Lo que se muestra en la traza como salida de la tool fallida. */
  readonly message: string;
  /** La falla de `fallas.describir`, si el backend la mandó. */
  readonly falla?: unknown;
};

const MESSAGE_KEYS = ["error", "detail"] as const;
const FAILURE_KEYS = ["falla", "_falla"] as const;

export function readToolError(error: unknown): ToolError | null {
  if (error === undefined || error === null || error === false || error === "") return null;
  if (typeof error !== "string") return { message: JSON.stringify(error) };
  const body = backendBodyOf(parseJson(error));
  if (!body) return { message: error };
  const message = firstString(body, MESSAGE_KEYS) ?? error;
  const falla = FAILURE_KEYS.map((key) => body[key]).find((value) => value !== undefined);
  return falla === undefined ? { message } : { message, falla };
}

/** El cuerpo del backend: `data` del envoltorio HTTP, o el objeto mismo. */
function backendBodyOf(parsed: unknown): Record<string, unknown> | null {
  if (!isRecord(parsed)) return null;
  return isRecord(parsed.data) ? parsed.data : parsed;
}

function firstString(body: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // No es JSON: un error de red o de la herramienta como texto plano. Quien
    // llama usa el texto tal cual.
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
