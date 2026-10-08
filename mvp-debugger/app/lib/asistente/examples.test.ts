// Lo que protege: que ningún ejemplo del estado vacío apunte a un día sin datos.
// Con cobertura, cada fecha sale de la fuente que la pregunta consulta; sin
// cobertura, la pregunta va sin fecha y nunca con una inventada.
import { describe, expect, it } from "vitest";

import { buildExamples, describeCoverage, type ExampleCoverage } from "@/app/lib/asistente/examples";
import type { IntentKind } from "@/app/lib/asistente/intents";

// La radiación termina antes que lo eléctrico: así se ve que cada pregunta usa su fuente.
const COVERAGE: ExampleCoverage = {
  days: new Set(["2026-07-30", "2026-08-12", "2026-08-31"]),
  daysBySource: { electrical: ["2026-07-30", "2026-08-31"], radiation: ["2026-07-30", "2026-08-12"] },
  bounds: { from: "2024-11-10", toExclusive: "2026-09-01" },
};

function questionsByKind(examples: ReturnType<typeof buildExamples>): Record<IntentKind, string> {
  const questionOf = (kind: IntentKind) => examples.find((example) => example.kind === kind)?.question ?? "";
  return {
    query: questionOf("query"),
    chart: questionOf("chart"),
    download: questionOf("download"),
    diagnose: questionOf("diagnose"),
  };
}

describe("buildExamples", () => {
  it("con cobertura, cada pregunta usa el último día de su propia fuente", () => {
    // Given la cobertura sin alerta abierta
    // When se arman los ejemplos
    const questions = questionsByKind(buildExamples({ coverage: COVERAGE, latestOutageDate: null }));
    // Then la irradiancia apunta al último día de radiación, la potencia al último mes eléctrico
    expect(questions.query).toBe("¿Cómo estuvo la irradiancia el 12 ago 2026?");
    expect(questions.chart).toBe("Graficá la potencia de agosto 2026 por arreglo");
    expect(questions.download).toBe("Dame la temperatura de la última semana con datos en csv");
    expect(questions.diagnose).toBe("¿Qué pasó con la planta el 31 ago 2026?");
  });

  it("con una alerta de planta sin generar, el diagnóstico pregunta por su último día", () => {
    const questions = questionsByKind(
      buildExamples({ coverage: COVERAGE, latestOutageDate: "2026-08-26" }),
    );
    expect(questions.diagnose).toBe("¿Por qué el 26 ago 2026 la planta no generó?");
  });

  it("sin cobertura (cargando o con error) ninguna pregunta lleva fecha, pero sí la de la alerta", () => {
    // Given sin cobertura
    const withoutAlert = questionsByKind(buildExamples({ coverage: null, latestOutageDate: null }));
    // Then las cuatro preguntas son genéricas
    expect(withoutAlert).toEqual({
      query: "¿Cómo estuvo la irradiancia el último día con datos?",
      chart: "Graficá la potencia del último mes con datos por arreglo",
      download: "Dame la temperatura de la última semana con datos en csv",
      diagnose: "¿Qué pasó con la planta el último día con datos?",
    });
    // And la fecha de una alerta es real aunque la cobertura no haya llegado
    const withAlert = questionsByKind(buildExamples({ coverage: null, latestOutageDate: "2026-08-26" }));
    expect(withAlert.diagnose).toBe("¿Por qué el 26 ago 2026 la planta no generó?");
  });

  it("una fuente sin días no hereda la fecha de otra", () => {
    // Given radiación vacía aunque haya días eléctricos
    const noRadiation = { ...COVERAGE, daysBySource: { ...COVERAGE.daysBySource, radiation: [] } };
    const questions = questionsByKind(buildExamples({ coverage: noRadiation, latestOutageDate: null }));
    // Then la consulta de irradiancia va sin fecha
    expect(questions.query).toBe("¿Cómo estuvo la irradiancia el último día con datos?");
  });
});

describe("describeCoverage", () => {
  it("muestra el rango con el fin inclusivo, y sin cobertura no da fechas", () => {
    expect(describeCoverage(COVERAGE.bounds)).toBe(
      "Datos de la planta de San Carlos del 10 nov 2024 al 31 ago 2026.",
    );
    expect(describeCoverage(null)).toBe("Datos de la planta de San Carlos.");
  });
});
