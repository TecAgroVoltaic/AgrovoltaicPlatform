"use client";
// Cliente de `POST /chat/stream` (contrato §3): manda el historial y entrega los
// eventos YA validados y traducidos, uno por uno, como generador asíncrono.
//
// Nunca lanza. Todo desenlace es un evento terminal (`done`, `failure` o
// `cancelled`) y después de él el generador termina: quien consume no necesita
// un try/catch para enterarse de que algo salió mal, y no hay forma de que un
// error de red deje la interfaz "pensando" para siempre.
import { servidorApagado } from "@/app/lib/client";
import type { HttpFetch } from "@/app/lib/analitica/client";
import {
  FAILURE_MESSAGE,
  describeError,
  failed,
  toEvent,
  type ChatStreamEvent,
  type WireMessage,
} from "@/app/lib/asistente/streamEvents";
import { readSseFrames } from "@/app/lib/asistente/sse";

export type { ChatFailure, ChatFailureCode, ChatStreamEvent, WireMessage } from "@/app/lib/asistente/streamEvents";

export const CHAT_STREAM_URL = "/api/historico/chat/stream";

/** Sin un solo evento en este tiempo, el stream se da por colgado. Holgado a
 * propósito: una tool sobre AgroDash puede tardar decenas de segundos sin que
 * el backend emita nada entre `tool_inicio` y su `paso`. */
export const DEFAULT_IDLE_TIMEOUT_MS = 120_000;

export type ChatStreamRequest = {
  readonly messages: readonly WireMessage[];
  /** Qué está mirando la persona (rango de la vista). Viaja como `contexto`. */
  readonly context?: string;
};

export type ChatStreamDeps = {
  readonly httpFetch?: HttpFetch;
  readonly idleTimeoutMs?: number;
};

const UNAUTHORIZED_STATUS = 401;
const NOT_FOUND_STATUS = 404;

export async function* streamChat(
  request: ChatStreamRequest,
  signal: AbortSignal,
  { httpFetch = globalThis.fetch, idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS }: ChatStreamDeps = {},
): AsyncGenerator<ChatStreamEvent, void, undefined> {
  const connection = new AbortController();
  let idleExpired = false;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const armIdleTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleExpired = true;
      connection.abort();
    }, idleTimeoutMs);
  };
  const forwardAbort = () => connection.abort();
  signal.addEventListener("abort", forwardAbort, { once: true });

  try {
    armIdleTimer();
    const response = await httpFetch(CHAT_STREAM_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({ mensajes: request.messages, contexto: request.context }),
      cache: "no-store",
      signal: connection.signal,
    });
    if (!response.ok) {
      yield await httpFailure(response);
      return;
    }
    if (!response.body) {
      yield failed("INTERRUPTED");
      return;
    }
    for await (const frame of readSseFrames(response.body)) {
      armIdleTimer();
      const event = toEvent(frame);
      if (!event) continue;
      yield event;
      if (event.type === "done" || event.type === "failure") return;
    }
    yield failed("INTERRUPTED");
  } catch (error) {
    if (signal.aborted) yield { type: "cancelled" };
    else if (idleExpired) yield failed("IDLE_TIMEOUT");
    else yield failed("NETWORK", `${FAILURE_MESSAGE.NETWORK} (${describeError(error)})`);
  } finally {
    clearTimeout(idleTimer);
    signal.removeEventListener("abort", forwardAbort);
    // Cerrar la conexión al terminar por cualquier camino: después de `fin` no
    // queda nada que leer, y un stream abierto retiene el socket.
    connection.abort();
  }
}

async function httpFailure(response: Response): Promise<ChatStreamEvent> {
  const body: unknown = await response.json().catch(() => null);
  const detail = readDetail(body);
  if (response.status === UNAUTHORIZED_STATUS) return failed("UNAUTHORIZED");
  if (servidorApagado({ status: response.status, ok: false, data: body })) return failed("SERVICE_UNAVAILABLE");
  if (response.status === NOT_FOUND_STATUS) return failed("NOT_DEPLOYED");
  return failed("HTTP_ERROR", detail ?? `${FAILURE_MESSAGE.HTTP_ERROR} (HTTP ${response.status})`);
}

/** FastAPI responde `{detail}`; el proxy y la puerta del chat, `{error}`. */
function readDetail(body: unknown): string | null {
  if (body === null || typeof body !== "object") return null;
  const detail = "detail" in body ? body.detail : "error" in body ? body.error : null;
  return typeof detail === "string" && detail ? detail : null;
}
