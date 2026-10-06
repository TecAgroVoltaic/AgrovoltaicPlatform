// Lo que protege: que TODO desenlace del stream termine en un evento terminal
// tipado (done, failure con código, cancelled), nunca en una excepción ni en una
// interfaz esperando para siempre.
import { describe, expect, it, vi } from "vitest";

import {
  chartTurnEvents,
  hangingFetch,
  sseEvent,
  streamedResponse,
} from "@/app/lib/asistente/fixtures";
import { CHAT_STREAM_URL, streamChat, type ChatStreamEvent } from "@/app/lib/asistente/stream";

const REQUEST = { messages: [{ rol: "user", texto: "Graficá la potencia de agosto" }], context: "ctx" } as const;

async function run(
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response>,
  signal: AbortSignal = new AbortController().signal,
  idleTimeoutMs?: number,
): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = [];
  for await (const event of streamChat(REQUEST, signal, { httpFetch: fetchImpl, idleTimeoutMs })) events.push(event);
  return events;
}

const respondWith = (response: Response) =>
  vi.fn(async (_url: string, _init?: RequestInit) => response);

describe("streamChat", () => {
  it("hace POST al proxy con el historial y el contexto, y traduce los eventos en orden", async () => {
    // Given un backend que responde un turno con gráfico
    const fetchImpl = respondWith(streamedResponse(chartTurnEvents()));
    // When se consume el stream
    const events = await run(fetchImpl);
    // Then pidió por POST a /api/historico/chat/stream con el cuerpo del contrato
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(CHAT_STREAM_URL);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ mensajes: REQUEST.messages, contexto: "ctx" });
    // And los eventos salen traducidos y terminan en `done`
    expect(events.map((event) => event.type)).toEqual([
      "start", "textDelta", "step", "toolStart", "step", "textDelta", "textDelta", "step", "done",
    ]);
  });

  it("salta los eventos que no conoce sin cortar el stream", async () => {
    const events = await run(
      respondWith(streamedResponse([sseEvent("latido", {}), ...chartTurnEvents()])),
    );
    expect(events.at(-1)?.type).toBe("done");
  });

  it.each([
    ["data que no es JSON", "event: texto\ndata: {roto\n\n"],
    ["data que no cumple el contrato", sseEvent("tool_inicio", { nombre: "graficar" })],
  ])("con %s termina en MALFORMED_EVENT", async (_case, frame) => {
    const events = await run(respondWith(streamedResponse([frame, ...chartTurnEvents()])));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "failure", failure: { code: "MALFORMED_EVENT" } });
  });

  it("un evento `error` del backend termina en AGENT_ERROR con su mensaje", async () => {
    const events = await run(respondWith(streamedResponse([sseEvent("error", { mensaje: "límite diario alcanzado" })])));
    expect(events).toEqual([
      { type: "failure", failure: { code: "AGENT_ERROR", message: "límite diario alcanzado" } },
    ]);
  });

  it("si el stream se corta sin `fin` ni `error`, termina en INTERRUPTED", async () => {
    const events = await run(respondWith(streamedResponse([sseEvent("inicio", { modelo: "m" })])));
    expect(events.at(-1)).toMatchObject({ type: "failure", failure: { code: "INTERRUPTED" } });
  });

  it.each([
    [503, { error: "El chat del Agente Histórico está desactivado" }, "HTTP_ERROR", "El chat del Agente Histórico está desactivado"],
    [502, { error: "servicio inaccesible: ECONNREFUSED" }, "SERVICE_UNAVAILABLE", undefined],
    [401, {}, "UNAUTHORIZED", undefined],
    [404, { detail: "Not Found" }, "NOT_DEPLOYED", undefined],
    [429, { detail: "demasiadas consultas" }, "HTTP_ERROR", "demasiadas consultas"],
  ])("HTTP %i -> %s", async (status, body, code, message) => {
    const response = new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    const [event] = await run(respondWith(response));
    expect(event).toMatchObject({ type: "failure", failure: { code } });
    if (message && event.type === "failure") expect(event.failure.message).toBe(message);
  });

  it("si el fetch ni sale, termina en NETWORK", async () => {
    const events = await run(vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    expect(events).toEqual([
      { type: "failure", failure: { code: "NETWORK", message: expect.stringContaining("Failed to fetch") } },
    ]);
  });

  it("cancelar desde afuera termina en `cancelled`, no en error", async () => {
    // Given un stream que no manda nada
    const controller = new AbortController();
    const pending = run(hangingFetch(), controller.signal);
    // When la persona pulsa Detener
    controller.abort();
    // Then el desenlace es una cancelación
    expect(await pending).toEqual([{ type: "cancelled" }]);
  });

  it("sin ningún evento durante el tiempo de espera, termina en IDLE_TIMEOUT", async () => {
    const events = await run(hangingFetch(), new AbortController().signal, 20);
    expect(events).toEqual([{ type: "failure", failure: expect.objectContaining({ code: "IDLE_TIMEOUT" }) }]);
  });
});
