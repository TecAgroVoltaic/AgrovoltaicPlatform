// Lo que estas pruebas protegen: que la completitud no se pueda leer sin saber
// contra qué se midió. Lo eléctrico va a 5 min y la radiación a 15 s, así que dos
// tramos con la misma fracción pueden estar midiendo contra objetivos que
// difieren en veinte veces. Y que el cero siga siendo un cero: acá «cero filas
// registradas» es la medición, no una ausencia que haya que ocultar.
import { describe, expect, it } from "vitest";

import {
  describeCadence,
  describeCompleteness,
  longestGapsFirst,
  sourceLabel,
  toBarsData,
} from "@/app/components/analitica/series/completenessChart";
import type {
  CompletenessBucket,
  CompletenessSource,
  SourceSummary,
} from "@/app/lib/analitica/contracts/series";

function bucket(period: string, readings: number, expected: number): CompletenessBucket {
  return { period, readings, expected, cadenceSeconds: 300, cadenceOrigin: "measured" };
}

function summary(overrides: Partial<SourceSummary> = {}): SourceSummary {
  return {
    cadenceSeconds: 300,
    cadenceOrigin: "measured",
    calendarDays: 32,
    daysWithData: 26,
    readings: 3841,
    expectedReadings: 4825,
    completeness: 0.796,
    gaps: [],
    ...overrides,
  };
}

function source(buckets: readonly CompletenessBucket[], overrides: Partial<SourceSummary> = {}): CompletenessSource {
  return { key: "electrico", buckets, summary: summary(overrides) };
}

describe("toBarsData", () => {
  it("un tramo sin ninguna fila se dibuja como cero contra su objetivo", () => {
    // Given un día vacío que esperaba 149 lecturas y un día normal
    const data = toBarsData(source([bucket("2026-05-09", 0, 149), bucket("2026-05-10", 155, 149)]));

    // When se miran las dos series
    const registered = data.series[0].values;
    const expectedValues = data.series[1].values;

    // Then el cero viaja como cero (es la medición) y la barra de lo esperado
    // queda sola: es lo que hace visible el día en blanco
    expect(registered).toEqual([0, 155]);
    expect(expectedValues).toEqual([149, 149]);
    expect(data.categories).toEqual(["2026-05-09", "2026-05-10"]);
  });
});

describe("describeCadence", () => {
  it("dice la cadencia real contra la que se midió lo esperado", () => {
    // Given la radiación, con su cadencia medida sobre los saltos reales
    const text = describeCadence(summary({ cadenceSeconds: 15 }));

    // When se lee el pie
    // Then aparece el número de segundos y de dónde salió
    expect(text).toContain("15 s");
    expect(text).toMatch(/medida/i);
  });

  it("avisa cuando la cadencia es la nominal por no haber ni una fila", () => {
    // Given un período completamente vacío, donde no se pudo medir la cadencia
    const text = describeCadence(summary({ cadenceOrigin: "nominal" }));

    // When se lee el pie
    // Then el texto declara que el objetivo es una constante, no una medición
    expect(text).toMatch(/nominal/i);
    expect(text).toMatch(/ni una fila/i);
  });
});

describe("describeCompleteness", () => {
  it("da el conteo y los días, no solo el porcentaje", () => {
    // Given un resumen con 3.841 de 4.825 lecturas en 26 de 32 días
    const text = describeCompleteness(summary());

    // When se lee el pie
    // Then están los dos conteos y el tramo de calendario que cubren. El
    // separador de miles no se fija: lo pone el locale y cambia con el ICU.
    expect(text).toMatch(/3\D?841 de 4\D?825 lecturas/);
    expect(text).toContain("26 de 32 días");
  });
});

describe("longestGapsFirst", () => {
  it("pone el hueco más largo primero y no toca el arreglo original", () => {
    // Given los tres huecos reales del histórico, en el orden en que llegan
    const gaps = [
      { from: "2024-11-12", to: "2024-11-20", days: 9 },
      { from: "2024-12-30", to: "2025-05-03", days: 125 },
      { from: "2025-06-27", to: "2025-09-04", days: 70 },
    ];
    const original = source([], { gaps });

    // When se ordenan para mostrarlos
    const ordered = longestGapsFirst(original.summary);

    // Then manda el de 125 días y la respuesta del backend queda intacta
    expect(ordered.map((gap) => gap.days)).toEqual([125, 70, 9]);
    expect(original.summary.gaps.map((gap) => gap.days)).toEqual([9, 125, 70]);
  });
});

describe("sourceLabel", () => {
  it("traduce las fuentes conocidas y deja pasar una nueva sin romperse", () => {
    // Given las dos fuentes de hoy y una que el backend podría añadir mañana
    // When se piden sus nombres
    // Then las conocidas se leen en castellano y la desconocida no se pierde
    expect(sourceLabel("electrico")).toMatch(/inversor/i);
    expect(sourceLabel("radiacion")).toMatch(/piran/i);
    expect(sourceLabel("ambiental")).toBe("ambiental");
  });
});
