// Sustitutos para las pruebas del Asistente: un almacenamiento en memoria, un
// stream que se alimenta desde la prueba y la lectura del cuerpo de un pedido.
// Solo para pruebas, como `fixtures.ts`.
import type { Mock } from "vitest";

export function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

/** Un stream que se abre ahora y se alimenta desde la prueba. Se corta como lo
 * corta la red al abortar: con un `AbortError` en la lectura. */
export function controllableStream() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const body = new ReadableStream<Uint8Array>({
    start(streamController) {
      controller = streamController;
    },
  });
  const response = new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
  return {
    /** Para `httpFetch`: entrega la respuesta y la corta si abortan el pedido. */
    fetch: async (_url: string, init?: RequestInit) => {
      init?.signal?.addEventListener("abort", () => controller?.error(new DOMException("aborted", "AbortError")));
      return response;
    },
    push: (frame: string) => controller?.enqueue(encoder.encode(frame)),
    close: () => controller?.close(),
  };
}

type ChatRequestBody = { mensajes: { rol: string; texto: string }[]; contexto: string };

export function requestBody(httpFetch: Mock, call: number): ChatRequestBody {
  const init: unknown = httpFetch.mock.calls[call]?.[1];
  const body = init && typeof init === "object" && "body" in init ? String(init.body) : "{}";
  return JSON.parse(body);
}
