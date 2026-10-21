// El motor Flow del chat: recibe el pedido de la consola, llama al canal web
// del agente en Visione Flow con la clave del lado servidor y devuelve su
// respuesta ya traducida a los eventos de la consola. SOLO servidor.
//
// Los fallos ANTES del stream salen como JSON `{error}` con un status que el
// cliente muestra con detalle (`HTTP_ERROR`). No se usan 502/504 a propósito:
// el cliente los lee como «servidor de datos apagado por horario», que acá
// sería falso.
import { randomUUID } from "node:crypto";

import { FLOW_MODEL_LABEL, readFlowConfig } from "@/app/lib/asistente/flow/flowConfig";
import { toFlowRequest } from "@/app/lib/asistente/flow/flowRequest";
import { translateFlowStream } from "@/app/lib/asistente/flow/flowStream";

const STATUS_BAD_REQUEST = 400;
const STATUS_MISCONFIGURED = 500;
const STATUS_UPSTREAM_FAILED = 503;
const STATUS_RATE_LIMITED = 429;
const RETRY_AFTER_HEADER = "retry-after";

const SSE_HEADERS: Record<string, string> = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache, no-transform",
  "x-accel-buffering": "no",
};

const LOG_PREFIX = "[asistente/flow]";

function jsonError(message: string, status: number, headers?: Record<string, string>): Response {
  return Response.json({ error: message }, { status, headers });
}

/** El límite de llamadas del canal web: se dice cuánto esperar, no «error». */
function rateLimited(upstream: Response): Response {
  const retryAfter = upstream.headers.get(RETRY_AFTER_HEADER);
  const wait = retryAfter ? ` en ${retryAfter} s` : " en unos segundos";
  return jsonError(
    `el agente de Visione Flow recibió demasiadas consultas: probá de nuevo${wait}`,
    STATUS_RATE_LIMITED,
    retryAfter ? { [RETRY_AFTER_HEADER]: retryAfter } : undefined,
  );
}

export async function flowChat(req: Request): Promise<Response> {
  const configRead = readFlowConfig();
  if (!configRead.ok) return jsonError(`motor Flow sin configurar: falta ${configRead.missing}`, STATUS_MISCONFIGURED);

  const body: unknown = await req.json().catch(() => null);
  if (body === null) return jsonError("pedido inválido: el cuerpo no es JSON", STATUS_BAD_REQUEST);
  const parsed = toFlowRequest(body, randomUUID);
  if (!parsed.ok) return jsonError(parsed.error, STATUS_BAD_REQUEST);

  // Un controlador propio y no solo `req.signal`: además de cuando se va el
  // navegador, la llamada se corta cuando la respuesta ya terminó.
  const upstreamControl = new AbortController();
  req.signal.addEventListener("abort", () => upstreamControl.abort(), { once: true });

  let upstream: Response;
  try {
    upstream = await fetch(configRead.config.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
        "x-api-key": configRead.config.key,
      },
      body: JSON.stringify(parsed.request),
      cache: "no-store",
      signal: upstreamControl.signal,
    });
  } catch (error) {
    console.error(LOG_PREFIX, "Visione Flow inaccesible", error);
    return jsonError("no se pudo conectar con el agente de Visione Flow", STATUS_UPSTREAM_FAILED);
  }

  if (upstream.status === STATUS_RATE_LIMITED) return rateLimited(upstream);
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    console.error(LOG_PREFIX, `Visione Flow respondió HTTP ${upstream.status}`, detail);
    return jsonError(`el agente de Visione Flow respondió HTTP ${upstream.status}`, STATUS_UPSTREAM_FAILED);
  }

  const translated = translateFlowStream(upstream.body, {
    model: FLOW_MODEL_LABEL,
    upstreamControl,
    logFailure: (code, detail) => console.error(LOG_PREFIX, code, detail),
    logInterruption: (error) => console.error(LOG_PREFIX, "el stream de Flow se cortó", error),
  });
  return new Response(translated, { status: 200, headers: SSE_HEADERS });
}
