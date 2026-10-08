// Lo que protege: los rótulos que la persona lee en el Asistente. El costo no
// puede inventar un cero, el tiempo de cada paso tiene que ir a SU paso aunque
// una tool se repita, y el rango corto no puede perder ni duplicar el último día.
import { describe, expect, it } from "vitest";

import type { AgentStep } from "@/app/lib/asistente/contracts/chatEvents";
import { parseChartSpec } from "@/app/lib/asistente/contracts/chartSpec";
import { CHART_SPEC_BY_KIND } from "@/app/lib/asistente/fixtures";
import {
  chartSizeLabel,
  liveStepDurations,
  stepsSummary,
  threadCostUsd,
} from "@/app/lib/asistente/presentation";
import type { Thread } from "@/app/lib/asistente/threads";
import type { LiveStep } from "@/app/lib/asistente/turnReducer";

function tool(nombre: string, ms?: number): AgentStep {
  return { tipo: "tool", nombre, input: {}, salida: {}, error: false, ms };
}

function threadWithCosts(costs: readonly (number | undefined)[]): Thread {
  return {
    id: "h1",
    title: "t",
    context: "c",
    updatedAt: 0,
    messages: costs.map((cost) => ({
      rol: "assistant" as const,
      texto: "r",
      traza: { respuesta: "r", pasos: [], costo: cost === undefined ? undefined : { usd_total: cost } },
    })),
  };
}

describe("threadCostUsd", () => {
  it("suma el costo de todas las respuestas del hilo", () => {
    expect(threadCostUsd(threadWithCosts([0.0042, 0.01, undefined]))).toBeCloseTo(0.0142);
  });

  it("sin ninguna respuesta con costo devuelve null, no cero", () => {
    expect(threadCostUsd(threadWithCosts([undefined]))).toBeNull();
    expect(threadCostUsd(threadWithCosts([]))).toBeNull();
  });
});

describe("stepsSummary", () => {
  it("cuenta las consultas y usa el tiempo total del turno", () => {
    const steps = [tool("graficar", 300), { tipo: "modelo", texto: "x", solicita: [] } as AgentStep, tool("serie", 600)];
    expect(stepsSummary(steps, 900)).toBe("2 consultas · 0,9 s");
  });

  it("singular con una consulta y, sin total, la suma de las tools", () => {
    expect(stepsSummary([tool("graficar", 1800)], undefined)).toBe("1 consulta · 1,8 s");
  });

  it("sin tools ni tiempo lo dice sin inventar una duración", () => {
    expect(stepsSummary([], undefined)).toBe("sin consultas");
  });
});

describe("liveStepDurations", () => {
  it("empareja cada tool cerrada con su paso aunque el nombre se repita, y deja fuera la que corre", () => {
    // Given dos llamadas a la misma tool cerradas y una tercera corriendo
    const live: LiveStep[] = [
      { id: "a", toolName: "serie", label: "", status: "done" },
      { id: "b", toolName: "serie", label: "", status: "failed" },
      { id: "c", toolName: "graficar", label: "", status: "running" },
    ];
    // When se miden con los pasos cerrados
    const durations = liveStepDurations(live, [tool("serie", 300), tool("serie", 600)]);
    // Then cada una lleva la suya y la que corre no tiene duración
    expect(durations.get("a")).toBe(300);
    expect(durations.get("b")).toBe(600);
    expect(durations.has("c")).toBe(false);
  });
});

describe("chartSizeLabel", () => {
  it("cuenta lo que dibuja cada variante con su propio nombre", () => {
    const parsed = parseChartSpec(CHART_SPEC_BY_KIND.serie);
    const bars = parseChartSpec(CHART_SPEC_BY_KIND.carpeta);
    if (!parsed.ok || !bars.ok) throw new Error("fixture inválido");
    expect(chartSizeLabel(parsed.spec)).toBe("2 puntos");
    expect(chartSizeLabel(bars.spec)).toBe("2 celdas");
  });
});
