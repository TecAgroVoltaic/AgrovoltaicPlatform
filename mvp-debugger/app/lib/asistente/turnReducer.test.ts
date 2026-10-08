// Lo que protege: el estado en vivo de una respuesta. Se alimenta con el stream
// REAL (parser + validación + traducción) sobre fixtures del contrato, así que
// un cambio en cualquiera de esas capas se nota acá.
import { describe, expect, it } from "vitest";

import { chartTurnEvents, sseEvent, streamedResponse } from "@/app/lib/asistente/fixtures";
import { streamChat, type ChatStreamEvent } from "@/app/lib/asistente/stream";
import { beginTurn, turnReducer, type TurnState } from "@/app/lib/asistente/turnReducer";

async function replay(frames: readonly string[], stopAfter = Infinity): Promise<TurnState> {
  const fetchImpl = async () => streamedResponse(frames);
  let state = beginTurn();
  let seen = 0;
  for await (const event of streamChat({ messages: [] }, new AbortController().signal, { httpFetch: fetchImpl })) {
    if (seen++ >= stopAfter) break;
    state = turnReducer(state, event);
  }
  return state;
}

const TOOL_START: ChatStreamEvent = { type: "toolStart", id: "t1", name: "graficar", input: {} };

describe("turnReducer", () => {
  it("muestra la tool corriendo con su etiqueta y la marca hecha cuando llega su paso", async () => {
    // Given el turno hasta justo después de `tool_inicio` (inicio, delta, paso, tool_inicio)
    const running = await replay(chartTurnEvents(), 4);
    // Then la tool figura en curso con una etiqueta legible
    expect(running.status).toBe("streaming");
    if (running.status !== "streaming") return;
    expect(running.progress.liveSteps).toEqual([
      { id: "toolu_1", toolName: "graficar", label: "Armando el gráfico", status: "running" },
    ]);
    // When llega el paso de la tool
    const afterStep = await replay(chartTurnEvents(), 5);
    // Then queda hecha
    expect(afterStep.status === "streaming" && afterStep.progress.liveSteps[0].status).toBe("done");
  });

  it("el texto intermedio de un turno que pide una tool no queda como buffer pendiente", async () => {
    // Given el delta del turno intermedio y su paso de modelo con stop_reason tool_use
    const state = await replay(chartTurnEvents(), 3);
    // Then el buffer se vació: ese texto vive en el paso, en su lugar del progreso
    expect(state.status === "streaming" && state.progress.streamingText).toBe("");
  });

  it("acumula los deltas del turno final mientras llegan", async () => {
    const state = await replay(chartTurnEvents(), 7);
    expect(state.status === "streaming" && state.progress.streamingText).toBe("La potencia **subió** a fin de mes.");
  });

  it("al recibir `fin` el texto y los pasos son los de `fin`, no los acumulados", async () => {
    // Given deltas que no coinciden con la respuesta autoritativa
    const frames = [
      sseEvent("texto", { delta: "borrador" }),
      sseEvent("fin", { respuesta: "Respuesta final.", pasos: [] }),
    ];
    // When termina
    const state = await replay(frames);
    // Then manda `fin.respuesta`
    expect(state.status).toBe("done");
    expect(state.status === "done" && state.progress.streamingText).toBe("Respuesta final.");
  });

  it("una tool que falla no corta el turno: queda marcada como fallida y el turno sigue", () => {
    let state = turnReducer(beginTurn(), TOOL_START);
    state = turnReducer(state, {
      type: "step",
      step: { tipo: "tool", nombre: "graficar", input: {}, salida: "variable desconocida", error: true },
    });
    expect(state.status).toBe("streaming");
    expect(state.status === "streaming" && state.progress.liveSteps[0].status).toBe("failed");
  });

  it("una tool sin etiqueta propia se anuncia con el genérico", () => {
    const state = turnReducer(beginTurn(), { ...TOOL_START, name: "tool_nueva" });
    expect(state.status === "streaming" && state.progress.liveSteps[0].label).toBe("Ejecutando tool_nueva");
  });

  it.each([
    ["cancelled", { type: "cancelled" }],
    ["failed", { type: "failure", failure: { code: "AGENT_ERROR", message: "x" } }],
  ] as const)("al terminar en %s ninguna tool queda girando", (status, event) => {
    const state = turnReducer(turnReducer(beginTurn(), TOOL_START), event);
    expect(state.status).toBe(status);
    expect(state.status !== "idle" && state.progress.liveSteps[0].status).toBe("failed");
  });

  it("un evento después del desenlace no reabre el turno", () => {
    const cancelled = turnReducer(beginTurn(), { type: "cancelled" });
    expect(turnReducer(cancelled, { type: "textDelta", delta: "tarde" })).toBe(cancelled);
  });
});
