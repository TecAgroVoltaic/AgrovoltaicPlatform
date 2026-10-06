// Los eventos del chat ya traducidos (lo que consume la interfaz) y cómo se
// leen desde el cable (contrato §3). Separado de `stream.ts`, que solo se ocupa
// de la conexión.
import type { ZodError, ZodType } from "zod";

import {
  agentStepSchema,
  chatResultSchema,
  errorEventSchema,
  startEventSchema,
  textEventSchema,
  toolStartEventSchema,
  type AgentStep,
  type ChatResult,
} from "@/app/lib/asistente/contracts/chatEvents";
import { describeFirstIssue } from "@/app/lib/asistente/contracts/issues";
import type { SseFrame } from "@/app/lib/asistente/sse";
import { MSG_APAGADO } from "@/app/lib/horario";

export type WireMessage = { readonly rol: "user" | "assistant"; readonly texto: string };

export type ChatFailureCode =
  /** El fetch ni salió o se cortó la conexión a mitad. */
  | "NETWORK"
  /** Pasó `DEFAULT_IDLE_TIMEOUT_MS` sin ningún evento. */
  | "IDLE_TIMEOUT"
  | "UNAUTHORIZED"
  /** El servidor de datos está apagado (horario) o no responde. */
  | "SERVICE_UNAVAILABLE"
  /** El servicio desplegado todavía no tiene `/chat/stream`. */
  | "NOT_DEPLOYED"
  /** Otro 4xx/5xx: la puerta del chat cerrada (503), el freno de consumo (429)... */
  | "HTTP_ERROR"
  /** Llegó un evento conocido con un `data` que no cumple el contrato. */
  | "MALFORMED_EVENT"
  /** El stream terminó sin `fin` ni `error`. */
  | "INTERRUPTED"
  /** El backend mandó un evento `error`. */
  | "AGENT_ERROR";

export type ChatFailure = {
  readonly code: ChatFailureCode;
  /** En castellano, para la pantalla. */
  readonly message: string;
};

export type ChatStreamEvent =
  | { readonly type: "start"; readonly model: string | null }
  | {
      readonly type: "toolStart";
      readonly id: string;
      readonly name: string;
      readonly input: Readonly<Record<string, unknown>>;
    }
  | { readonly type: "step"; readonly step: AgentStep }
  | { readonly type: "textDelta"; readonly delta: string }
  | { readonly type: "done"; readonly result: ChatResult }
  | { readonly type: "failure"; readonly failure: ChatFailure }
  | { readonly type: "cancelled" };


export const FAILURE_MESSAGE: Readonly<Record<ChatFailureCode, string>> = {
  NETWORK: "se cortó la conexión con el servidor",
  IDLE_TIMEOUT: "el asistente dejó de responder; podés reintentar",
  UNAUTHORIZED: "la sesión venció: recargá la página para volver a entrar",
  SERVICE_UNAVAILABLE: MSG_APAGADO,
  NOT_DEPLOYED:
    "el servicio histórico desplegado es una versión anterior sin respuestas en vivo: hay que reconstruir su contenedor",
  HTTP_ERROR: "el servicio del asistente devolvió un error",
  MALFORMED_EVENT: "el asistente respondió con un formato inesperado",
  INTERRUPTED: "la respuesta se cortó antes de terminar",
  AGENT_ERROR: "el asistente falló al responder",
};

export function failed(code: ChatFailureCode, message: string = FAILURE_MESSAGE[code]): ChatStreamEvent {
  return { type: "failure", failure: { code, message } };
}

type Decoded = { readonly ok: true; readonly event: ChatStreamEvent } | { readonly ok: false; readonly error: ZodError };
type Decoder = (json: unknown) => Decoded;

/** Une el esquema de un `data` con su traducción, para que cada evento quede
 * tipado por su propio esquema sin castear. */
function decoder<TData>(schema: ZodType<TData>, translate: (data: TData) => ChatStreamEvent): Decoder {
  return (json) => {
    const parsed = schema.safeParse(json);
    return parsed.success ? { ok: true, event: translate(parsed.data) } : { ok: false, error: parsed.error };
  };
}

/** Nombre del evento en el cable -> cómo se lee. */
const DECODERS: Readonly<Record<string, Decoder>> = {
  inicio: decoder(startEventSchema, (data) => ({ type: "start", model: data.modelo ?? null })),
  tool_inicio: decoder(toolStartEventSchema, (data) => ({
    type: "toolStart",
    id: data.id,
    name: data.nombre,
    input: data.input,
  })),
  paso: decoder(agentStepSchema, (step) => ({ type: "step", step })),
  texto: decoder(textEventSchema, (data) => ({ type: "textDelta", delta: data.delta })),
  fin: decoder(chatResultSchema, (result) => ({ type: "done", result })),
  error: decoder(errorEventSchema, (data) => failed("AGENT_ERROR", data.mensaje || FAILURE_MESSAGE.AGENT_ERROR)),
};

/** `null` = evento que este cliente no conoce. Se salta en vez de fallar para
 * que el backend pueda sumar eventos (un latido, por ejemplo) sin romper a los
 * clientes ya desplegados. */
export function toEvent(frame: SseFrame): ChatStreamEvent | null {
  if (!Object.hasOwn(DECODERS, frame.event)) return null;
  let json: unknown;
  try {
    json = JSON.parse(frame.data);
  } catch (error) {
    return malformed(frame.event, describeError(error));
  }
  const decoded = DECODERS[frame.event](json);
  return decoded.ok ? decoded.event : malformed(frame.event, describeFirstIssue(decoded.error));
}

function malformed(eventName: string, detail: string): ChatStreamEvent {
  return failed("MALFORMED_EVENT", `${FAILURE_MESSAGE.MALFORMED_EVENT} (${eventName}: ${detail})`);
}

export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
