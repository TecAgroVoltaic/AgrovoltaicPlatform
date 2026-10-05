// Lo que estas pruebas protegen: que el hueco siga siendo un hueco al llegar al
// gráfico. Este proyecto ya dibujó una recta continua sobre los 126 días sin
// datos de enero a abril de 2025, y la corrección fue justamente conservar el
// bucket vacío en su lugar. Si el mapeo filtrara los nulls, el defecto volvería
// sin que nada fallara.
import { describe, expect, it } from "vitest";

import {
  describeCoverageOfSeries,
  describeTrend,
  toTimeSeriesData,
} from "@/app/components/analitica/series/seriesChart";
import type { SeriesPoint, VariableSeries } from "@/app/lib/analitica/contracts/series";

function point(timestamp: string, value: number | null, extra: Partial<SeriesPoint> = {}): SeriesPoint {
  return {
    timestamp,
    value,
    bandLower: null,
    bandUpper: null,
    movingAverage: null,
    trend: null,
    ...extra,
  };
}

function series(points: readonly SeriesPoint[], overrides: Partial<VariableSeries> = {}): VariableSeries {
  return {
    key: "potencia_pv1_w",
    label: "Potencia Inclinado (PV1)",
    unit: "W",
    points,
    bucketsWithData: points.filter((candidate) => candidate.value !== null).length,
    slope: { status: "measured", value: 0.376, count: 38, unit: "W/dia" },
    rSquared: 0.059,
    ...overrides,
  };
}

describe("toTimeSeriesData", () => {
  it("conserva el bucket vacío en su lugar en vez de saltárselo", () => {
    // Given los cuatro meses sin datos entre diciembre y mayo, tal como llegan
    const withGap = series([
      point("2024-12-01T00:00", 205.9),
      point("2025-01-01T00:00", null),
      point("2025-02-01T00:00", null),
      point("2025-05-01T00:00", 318.4),
    ]);

    // When se le da forma para el gráfico
    const data = toTimeSeriesData(withGap);

    // Then los nulls siguen ahí, en su posición: la línea se corta y no cruza
    expect(data.lines[0].points.map((candidate) => candidate.value)).toEqual([
      205.9,
      null,
      null,
      318.4,
    ]);
  });

  it("no ofrece una capa que llegó entera vacía", () => {
    // Given una serie corta cuya media móvil el backend no pudo calcular
    const short = series([point("2026-05-01T00:00", 10), point("2026-05-02T00:00", 12)]);

    // When se le da forma
    const data = toTimeSeriesData(short);

    // Then no hay media móvil: una entrada de leyenda sin curva debajo confunde
    expect(data.lines[0].movingAverage).toBeUndefined();
  });

  it("pasa la banda y la tendencia del backend tal cual, sin recalcular nada", () => {
    // Given un punto con sus dos bordes de banda y su tendencia ya resueltos
    const withLayers = series([
      point("2026-05-01T00:00", 100, { bandLower: 40, bandUpper: 160, trend: 95 }),
      point("2026-05-02T00:00", 120, { bandLower: 60, bandUpper: 180, trend: 96 }),
    ]);

    // When se le da forma
    const data = toTimeSeriesData(withLayers);

    // Then los números que se dibujan son exactamente los que llegaron
    expect(data.lines[0].deviationBand).toEqual([
      { timestamp: "2026-05-01T00:00", lower: 40, upper: 160 },
      { timestamp: "2026-05-02T00:00", lower: 60, upper: 180 },
    ]);
    expect(data.lines[0].trend?.map((candidate) => candidate.value)).toEqual([95, 96]);
  });
});

describe("describeTrend", () => {
  it("con pendiente medida la escribe con su unidad y su R²", () => {
    // Given un ajuste que el backend sí pudo hacer
    const text = describeTrend(series([point("2026-05-01T00:00", 1)]));

    // When se lee el pie del gráfico
    // Then aparecen la pendiente, su unidad y la bondad del ajuste
    expect(text).toContain("W/dia");
    expect(text).toContain("R²");
  });

  it("sin pendiente dice por qué, en vez de escribir un cero", () => {
    // Given un período sin ni una lectura, donde `metrica` devuelve None
    const empty = series([point("2025-02-01T00:00", null)], {
      slope: { status: "missing", count: 0, unit: "W/dia", reason: "sin_lecturas" },
      rSquared: null,
    });

    // When se lee el pie
    const text = describeTrend(empty);

    // Then se explica la ausencia y no aparece ningún número inventado
    expect(text).toContain("sin_lecturas");
    expect(text).not.toMatch(/\d/);
  });
});

describe("describeCoverageOfSeries", () => {
  it("cuenta los tramos con medición contra el total del rango", () => {
    // Given una serie de cuatro tramos con dos medidos
    const half = series([
      point("2025-01-01T00:00", null),
      point("2025-02-01T00:00", 1),
      point("2025-03-01T00:00", null),
      point("2025-04-01T00:00", 2),
    ]);

    // When se lee el pie
    // Then dice cuántos hay de cuántos, con los números del backend
    expect(describeCoverageOfSeries(half)).toContain("2 de 4 tramos");
  });
});
