// Lo que estas pruebas protegen: que la prosa que el backend YA redactó llegue a
// la pantalla, y que el código con el que se DECIDE no se mezcle con ella.
//
// El servicio manda las dos cosas: `motivo` es un código (`sin_lecturas`) que
// alguna vista compara para elegir qué pintar, y `explicacion` es el castellano
// ya escrito («no hay ni una lectura de esta variable en la ventana pedida»).
// Si se conserva una sola, o las vistas reescriben el texto a mano y se
// desincronizan del servicio, o la pantalla termina mostrando `sin_lecturas`.
import { describe, expect, it } from "vitest";

import { explainMissing, metricSchema } from "@/app/lib/analitica/contracts/metric";

const MISSING_CODE = "sin_lecturas";
const MISSING_PROSE = "no hay ni una lectura de esta variable en la ventana pedida";

function parseMissing(raw: Record<string, unknown>) {
  const metric = metricSchema.parse({ valor: null, n: 0, unidad: "kWh", ...raw });
  if (metric.status !== "missing") throw new Error("se esperaba una métrica ausente");
  return metric;
}

describe("metricSchema", () => {
  it("conserva el código y la prosa por separado, sin que uno tape al otro", () => {
    // Given el escalar tal como lo manda `/analitica/resumen` en un rango vacío
    const metric = parseMissing({ motivo: MISSING_CODE, explicacion: MISSING_PROSE });

    // When se lee la métrica ausente
    // Then `reason` sigue siendo el código (hay vistas que lo comparan) y la
    // explicación viaja aparte, lista para mostrarse
    expect(metric.reason).toBe(MISSING_CODE);
    expect(metric.explanation).toBe(MISSING_PROSE);
    expect(explainMissing(metric)).toBe(MISSING_PROSE);
  });

  it("sin explicación cae al motivo, que en ese caso ya es texto legible", () => {
    // Given un nulo sin `explicacion` (no todo endpoint la manda)
    const metric = parseMissing({ n: 12, motivo: null });

    // When se pregunta qué mostrar
    // Then hay una frase, nunca un hueco mudo ni un `undefined`
    expect(metric.explanation).toBeUndefined();
    expect(explainMissing(metric)).toBe(metric.reason);
    expect(explainMissing(metric).length).toBeGreaterThan(0);
  });

  it("una explicación vacía no se cuela como texto de pantalla", () => {
    // Given un backend que manda la explicación en blanco
    const metric = parseMissing({ motivo: MISSING_CODE, explicacion: "" });

    // When se pregunta qué mostrar
    // Then se usa el motivo: una casilla con la cadena vacía se lee como rota
    expect(metric.explanation).toBeUndefined();
    expect(explainMissing(metric)).toBe(MISSING_CODE);
  });

  it("un valor medido también conserva su explicación", () => {
    // Given un escalar con dato y con la nota del backend
    const metric = metricSchema.parse({
      valor: 12.5,
      n: 288,
      unidad: "kWh",
      explicacion: "medido sobre 288 muestras del período",
    });

    // When se lee
    // Then el campo es el mismo en los dos estados: una vista que muestra la
    // nota no tiene que preguntar antes si hubo número
    expect(metric.status).toBe("measured");
    expect(metric.explanation).toBe("medido sobre 288 muestras del período");
  });
});
