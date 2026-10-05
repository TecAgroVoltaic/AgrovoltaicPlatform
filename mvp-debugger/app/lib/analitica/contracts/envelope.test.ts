// La confusión que estas pruebas impiden: `valor: null` (no hay dato) leído como
// cero. Con cuatro meses de potencia AC en NULL, ese descuido convierte el
// tablero en una mentira que no falla en ningún lado.
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { analysisResponse, windowSchema } from "@/app/lib/analitica/contracts/envelope";
import { formatMetric, isMeasured, metricSchema } from "@/app/lib/analitica/contracts/metric";

const responseSchema = analysisResponse({ energia: metricSchema });

const ventana = {
  desde: "2026-05-01",
  hasta: "2026-06-01",
  dias: 31,
  granularidad: "dia",
};

function sobre(energia: unknown) {
  return { ventana, confianza: { fuente: "v_sc_electrico_corregido" }, energia };
}

describe("sobre de análisis", () => {
  it("traduce la ventana del backend a los nombres del frontend", () => {
    // Given una respuesta con la ventana en español
    const raw = sobre({ valor: 12.5, n: 288, unidad: "kWh" });

    // When se valida en la frontera
    const parsed = responseSchema.parse(raw);

    // Then la ventana llega traducida y con el fin exclusivo bien nombrado
    expect(parsed.window).toEqual({
      from: "2026-05-01",
      toExclusive: "2026-06-01",
      days: 31,
      granularity: "day",
    });
  });

  it("conserva el bloque de confianza, que viaja dentro del payload", () => {
    // Given una respuesta con su bloque de fiabilidad
    const parsed = responseSchema.parse(sobre({ valor: 1, n: 2, unidad: "kWh" }));

    // When se lee la confianza
    // Then está, sin que el frontend le invente forma
    expect(parsed.confidence).toEqual({ fuente: "v_sc_electrico_corregido" });
  });

  it("rechaza una granularidad que el backend no define", () => {
    // Given una ventana con un grano desconocido
    const raw = { ...sobre({ valor: 1, n: 1, unidad: "kWh" }), ventana: { ...ventana, granularidad: "quincena" } };

    // When se valida
    const result = responseSchema.safeParse(raw);

    // Then falla en la frontera y no llega a ninguna vista
    expect(result.success).toBe(false);
  });

  it("expone el esquema de la ventana suelto, para leerla fuera del sobre", () => {
    // Given solo el bloque `ventana` de una respuesta
    // When se valida con el esquema exportado
    const parsed = windowSchema.parse(ventana);

    // Then llega traducido igual que dentro del sobre: nadie interpreta
    // `desde`/`hasta`/`granularidad` a mano en su vista
    expect(parsed).toEqual({ from: "2026-05-01", toExclusive: "2026-06-01", days: 31, granularity: "day" });
  });

  it("rechaza un sobre sin ventana: sin período, ningún número significa nada", () => {
    // Given una respuesta a la que le falta el sobre
    const result = responseSchema.safeParse({ energia: { valor: 1, n: 1, unidad: "kWh" } });

    // When / Then no pasa la validación
    expect(result.success).toBe(false);
  });
});

describe("métrica", () => {
  it("un valor nulo llega como ausente, sin campo que se pueda pintar", () => {
    // Given el escalar que el backend manda cuando no hay dato
    const parsed = responseSchema.parse(
      sobre({ valor: null, n: 0, unidad: "W", motivo: "la columna no vino en el CSV" }),
    );

    // When se consulta la métrica
    const energia = parsed.payload.energia;

    // Then es "missing", trae el motivo, y no hay ningún número que confundir
    expect(energia.status).toBe("missing");
    expect(isMeasured(energia)).toBe(false);
    expect(energia).not.toHaveProperty("value");
    if (energia.status === "missing") {
      expect(energia.reason).toBe("la columna no vino en el CSV");
    }
  });

  it("un cero medido NO es un dato ausente", () => {
    // Given una noche entera: potencia cero, medida de verdad
    const parsed = responseSchema.parse(sobre({ valor: 0, n: 288, unidad: "W" }));

    // When se consulta la métrica
    const energia = parsed.payload.energia;

    // Then es un valor medido, y vale cero
    expect(energia.status).toBe("measured");
    if (energia.status === "measured") expect(energia.value).toBe(0);
    expect(formatMetric(energia)).toBe("0");
  });

  it("un valor sin muestras se trata como ausente aunque venga un número", () => {
    // Given una respuesta que contradice el contrato (n = 0 con valor)
    const parsed = responseSchema.parse(sobre({ valor: 42, n: 0, unidad: "W" }));

    // When se consulta la métrica
    // Then gana la prudencia: un promedio de cero muestras no es un número
    expect(parsed.payload.energia.status).toBe("missing");
  });

  it("sin motivo declarado, igual explica por qué no hay dato", () => {
    // Given un nulo sin motivo (el backend no siempre lo manda)
    const parsed = responseSchema.parse(sobre({ valor: null, n: 12, unidad: "W" }));

    // When se lee el motivo
    const energia = parsed.payload.energia;

    // Then hay un texto que mostrar, nunca un hueco mudo
    expect(energia.status).toBe("missing");
    if (energia.status === "missing") expect(energia.reason.length).toBeGreaterThan(0);
  });

  it("la ausencia se muestra como texto, jamás como un cero", () => {
    // Given una métrica ausente
    const ausente = metricSchema.parse({ valor: null, n: 0, unidad: "kWh" });

    // When se formatea para la pantalla
    // Then no aparece ningún número
    expect(formatMetric(ausente)).toBe("sin dato");
  });

  it("rechaza una métrica sin unidad: un número sin unidad no es una medida", () => {
    // Given un escalar al que le falta la unidad
    const result = z.object({ m: metricSchema }).safeParse({ m: { valor: 1, n: 1 } });

    // When / Then no pasa la frontera
    expect(result.success).toBe(false);
  });
});
