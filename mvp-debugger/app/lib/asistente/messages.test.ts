// Lo que protege: el orden de los bloques de una respuesta, que el texto final
// no salga dos veces, y que el historial que viaja al backend nunca lleve turnos
// fallidos.
import { describe, expect, it } from "vitest";

import type { AgentStep } from "@/app/lib/asistente/contracts/chatEvents";
import { CHART_SPEC_BY_KIND, CHART_TOOL_INPUT, DESCARGA_SPEC } from "@/app/lib/asistente/fixtures";
import { buildBlocks, exportRequestMessage } from "@/app/lib/asistente/messageBlocks";
import { messageFromTurn, toWireHistory, type StoredMessage } from "@/app/lib/asistente/messages";
import { beginTurn, turnReducer } from "@/app/lib/asistente/turnReducer";

const model = (texto: string, stop_reason = "end_turn"): AgentStep => ({ tipo: "modelo", texto, solicita: [], stop_reason });
const tool = (salida: unknown, error = false): AgentStep => ({
  tipo: "tool", nombre: "graficar", input: { ...CHART_TOOL_INPUT }, salida, error,
});

describe("buildBlocks", () => {
  it("intercala texto, gráfico y descarga en el orden de los pasos, sin repetir el final", () => {
    // Given un turno intermedio, un gráfico, una descarga y el texto final
    const steps = [
      model("Grafico la potencia.", "tool_use"),
      tool({ _grafico: CHART_SPEC_BY_KIND.serie }),
      tool({ _descarga: DESCARGA_SPEC }),
      model("Listo."),
    ];
    // When se arman los bloques con la respuesta final
    const blocks = buildBlocks(steps, "Listo.");
    // Then salen en orden y el final aparece una sola vez
    expect(blocks.map((block) => block.kind)).toEqual(["text", "chart", "download", "text"]);
    expect(blocks[1]).toMatchObject({
      request: { variables: ["potencia_pv1_w"], from: "2026-08-01", toExclusive: "2026-09-01", granularity: null },
    });
  });

  it("agrega la respuesta al final si ningún paso la trae (p. ej. una negativa)", () => {
    const blocks = buildBlocks([], "No puedo responder a eso.");
    expect(blocks).toEqual([{ kind: "text", key: "final", markdown: "No puedo responder a eso." }]);
  });

  it("una tool fallida no aporta gráfico", () => {
    expect(buildBlocks([tool("variable desconocida", true)], "")).toEqual([]);
  });
});

describe("exportRequestMessage", () => {
  it("pide la exportación con las mismas variables y rango del gráfico", () => {
    const text = exportRequestMessage("Potencia PV1", {
      variables: ["potencia_pv1_w"], from: "2026-08-01", toExclusive: "2026-09-01", granularity: null,
    });
    expect(text).toContain("potencia_pv1_w");
    expect(text).toContain("desde 2026-08-01 hasta 2026-09-01");
  });
});

describe("toWireHistory", () => {
  it("quita el par entero de un turno fallido para no mandar dos preguntas seguidas", () => {
    const messages: StoredMessage[] = [
      { rol: "user", texto: "a" },
      { rol: "assistant", texto: "", fallo: { code: "NETWORK", message: "x" } },
      { rol: "user", texto: "b" },
    ];
    expect(toWireHistory(messages)).toEqual([{ rol: "user", texto: "b" }]);
  });
});

describe("messageFromTurn", () => {
  it("una respuesta cancelada conserva lo que alcanzó a llegar y dice por qué está incompleta", () => {
    let state = beginTurn();
    state = turnReducer(state, { type: "step", step: tool({ _grafico: CHART_SPEC_BY_KIND.serie }) });
    state = turnReducer(state, { type: "cancelled" });
    const message = messageFromTurn(state);
    expect(message?.fallo?.code).toBe("CANCELLED");
    expect(message?.traza?.pasos).toHaveLength(1);
  });

  it("un turno que no terminó no produce mensaje", () => {
    expect(messageFromTurn(beginTurn())).toBeNull();
  });
});
