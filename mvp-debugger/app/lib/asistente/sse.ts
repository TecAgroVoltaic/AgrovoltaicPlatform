// Lector de Server-Sent Events sobre un cuerpo de fetch.
//
// No se usa `EventSource` porque solo sabe hacer GET y el chat es un POST con el
// historial en el cuerpo. Esto implementa lo que el contrato necesita del
// formato: bloques separados por línea en blanco, campos `event:` y `data:`
// (varias líneas de data se unen con salto), comentarios `:` ignorados, y
// finales de línea `\n` o `\r\n` (sse-starlette usa el segundo).

export type SseFrame = { readonly event: string; readonly data: string };

const DEFAULT_EVENT = "message";
const FRAME_SEPARATOR = "\n\n";

export async function* readSseFrames(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseFrame, void, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  // Un `\r` al final de un trozo puede ser la mitad de un `\r\n` que termina en
  // el siguiente: se guarda hasta saberlo, si no aparece una línea en blanco
  // falsa justo en el corte.
  let pendingCarriageReturn = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      const raw = pendingCarriageReturn + (done ? decoder.decode() : decoder.decode(value, { stream: true }));
      pendingCarriageReturn = !done && raw.endsWith("\r") ? "\r" : "";
      const complete = pendingCarriageReturn ? raw.slice(0, -1) : raw;
      buffer += complete.replace(/\r\n?/g, "\n");

      let boundary = buffer.indexOf(FRAME_SEPARATOR);
      while (boundary >= 0) {
        const frame = parseFrame(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + FRAME_SEPARATOR.length);
        if (frame) yield frame;
        boundary = buffer.indexOf(FRAME_SEPARATOR);
      }
      if (done) break;
    }
    // Un último bloque sin la línea en blanco final también es un evento.
    const tail = parseFrame(buffer);
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

/** Un bloque de líneas -> un evento. `null` si no trae `data` (solo
 * comentarios o un `event:` suelto, que el formato manda descartar). */
export function parseFrame(block: string): SseFrame | null {
  let event = DEFAULT_EVENT;
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    const rawValue = colon < 0 ? "" : line.slice(colon + 1);
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }
  return data.length ? { event, data: data.join("\n") } : null;
}
