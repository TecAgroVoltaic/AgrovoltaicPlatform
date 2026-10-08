// Lo que protege: que un evento se lea igual llegue como llegue partido por la
// red. Los cortes de trozo caen en cualquier byte, incluido en medio de un
// `\r\n` o de un carácter de varios bytes.
import { describe, expect, it } from "vitest";

import { readSseFrames, type SseFrame } from "@/app/lib/asistente/sse";

function bodyFrom(chunks: readonly (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
      controller.close();
    },
  });
}

async function collect(chunks: readonly (string | Uint8Array)[]): Promise<SseFrame[]> {
  const frames: SseFrame[] = [];
  for await (const frame of readSseFrames(bodyFrom(chunks))) frames.push(frame);
  return frames;
}

describe("readSseFrames", () => {
  it("lee eventos enteros separados por línea en blanco", async () => {
    // Given dos eventos en un solo trozo
    // When se leen
    const frames = await collect(['event: inicio\ndata: {"modelo":"m"}\n\nevent: texto\ndata: {"delta":"a"}\n\n']);
    // Then salen los dos, en orden, con su nombre y su data
    expect(frames).toEqual([
      { event: "inicio", data: '{"modelo":"m"}' },
      { event: "texto", data: '{"delta":"a"}' },
    ]);
  });

  it("reconstruye un evento partido en cualquier byte, incluso un \\r\\n y una tilde", async () => {
    // Given un evento con CRLF y "ó" (dos bytes en UTF-8) cortado byte a byte
    const bytes = new TextEncoder().encode('event: texto\r\ndata: {"delta":"acción"}\r\n\r\n');
    const chunks = Array.from(bytes, (byte) => Uint8Array.of(byte));
    // When se lee
    const frames = await collect(chunks);
    // Then es un único evento intacto, sin líneas en blanco falsas en los cortes
    expect(frames).toEqual([{ event: "texto", data: '{"delta":"acción"}' }]);
  });

  it("une varias líneas de data, ignora comentarios y lee el último bloque sin línea final", async () => {
    // Given un latido como comentario, data en dos líneas y un evento final sin "\n\n"
    const frames = await collect([": latido\n\n", "event: x\ndata: uno\ndata: dos\n\n", "event: fin\ndata: {}"]);
    // Then el comentario no produce evento y las dos líneas de data se unen con salto
    expect(frames).toEqual([
      { event: "x", data: "uno\ndos" },
      { event: "fin", data: "{}" },
    ]);
  });

  it("sin campo event el nombre es «message», y un bloque sin data se descarta", async () => {
    const frames = await collect(["data: hola\n\nevent: solo\n\n"]);
    expect(frames).toEqual([{ event: "message", data: "hola" }]);
  });
});
