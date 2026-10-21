// El cuerpo SSE de Flow → un cuerpo SSE con los eventos de la consola. Se
// traduce a medida que llega (pull), sin juntar nada: la lista de pasos en vivo
// tiene que avanzar evento por evento.
import { formatSseEvent, type ConsoleEvent } from "@/app/lib/asistente/flow/consoleEvents";
import { FlowTurnTranslator, type FlowFailureLog } from "@/app/lib/asistente/flow/translator";
import { readSseFrames } from "@/app/lib/asistente/sse";

export type FlowStreamOptions = {
  readonly model: string;
  /** La llamada a Flow. Se aborta al terminar la respuesta o cuando quien
   *  preguntaba se va (desde acá, o desde la ruta con la señal del request). */
  readonly upstreamControl: AbortController;
  readonly logFailure: FlowFailureLog;
  readonly logInterruption: (error: unknown) => void;
};

export function translateFlowStream(
  upstream: ReadableStream<Uint8Array>,
  { model, upstreamControl, logFailure, logInterruption }: FlowStreamOptions,
): ReadableStream<Uint8Array> {
  const translator = new FlowTurnTranslator(model, logFailure);
  const frames = readSseFrames(upstream);
  const encoder = new TextEncoder();
  const encode = (event: ConsoleEvent) => encoder.encode(formatSseEvent(event));
  const stop = () => upstreamControl.abort();

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encode(translator.start()));
    },
    async pull(controller) {
      try {
        // Se sigue leyendo hasta tener algo que entregar: un `pull` que vuelve
        // sin encolar nada no se vuelve a llamar, y los eventos de Flow que no se
        // traducen (`node:start`, `agent:thinking`…) dejarían el stream colgado.
        for (;;) {
          const next = await frames.next();
          const events = next.done ? [] : translator.translate(next.value);
          events.forEach((event) => controller.enqueue(encode(event)));
          // Después de `fin`/`error` no queda nada útil: se cierra y se corta
          // Flow en vez de esperar a que el runtime cierre su lado.
          if (next.done || translator.finished) {
            controller.close();
            stop();
            return;
          }
          if (events.length) return;
        }
      } catch (error) {
        // Lo cortamos nosotros porque quien preguntaba se fue: no es un fallo, y
        // `error` (a diferencia de `close`) no lanza si el stream ya se canceló.
        if (upstreamControl.signal.aborted) {
          controller.error(error);
          return;
        }
        // Un corte a mitad: sin `fin` el cliente lo muestra como respuesta
        // interrumpida, que es lo que pasó.
        logInterruption(error);
        controller.close();
      }
    },
    cancel() {
      // El navegador cerró la conexión (botón «Detener», pestaña cerrada): el
      // agente de Flow no tiene que seguir gastando tokens para nadie.
      stop();
    },
  });
}
