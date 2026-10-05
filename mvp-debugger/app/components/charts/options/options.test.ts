// La regla que estas pruebas fijan: un hueco llega hasta el lienzo COMO hueco.
// Si en algún punto de la traducción a opciones de ECharts un `null` se
// convirtiera en 0, el gráfico dibujaría producción donde no hubo medición y
// nadie lo notaría, porque un cero se ve perfectamente normal.
import { describe, expect, it } from "vitest";

import { buildBarsOption } from "@/app/components/charts/options/bars";
import { buildBoxPlotOption } from "@/app/components/charts/options/boxPlot";
import { buildCalendarHeatmapOption } from "@/app/components/charts/options/calendarHeatmap";
import { buildTimeSeriesOption } from "@/app/components/charts/options/timeSeries";
import { describeFit } from "@/app/components/charts/options/scatterFit";
import { PHONE_CANVAS, TEST_THEME } from "@/app/components/charts/options/fixtures";
import type { ChartOption } from "@/app/components/charts/echarts";

function seriesData(option: ChartOption, index: number): unknown[] {
  const series = option.series;
  const list = Array.isArray(series) ? series : [series];
  const data = list[index]?.data;
  return Array.isArray(data) ? data : [];
}

describe("serie temporal", () => {
  it("deja los huecos como nulos y no los rellena con cero", () => {
    // Given una serie con un hueco en medio
    const option = buildTimeSeriesOption(
      {
        unit: "W",
        lines: [{
          id: "pv1",
          label: "PV1",
          points: [
            { timestamp: "2026-05-01T00:00:00+00:00", value: 10 },
            { timestamp: "2026-05-02T00:00:00+00:00", value: null },
          ],
        }],
      },
      TEST_THEME,
      PHONE_CANVAS,
    );

    // When se leen los puntos que van al lienzo
    const points = seriesData(option, 0);

    // Then el hueco sigue siendo un hueco
    expect(points).toEqual([
      ["2026-05-01T00:00:00+00:00", 10],
      ["2026-05-02T00:00:00+00:00", null],
    ]);
  });

  it("la banda de desviación se corta donde falta un extremo", () => {
    // Given una banda con un punto incompleto
    const option = buildTimeSeriesOption(
      {
        unit: "W",
        lines: [{
          id: "pv1",
          label: "PV1",
          points: [{ timestamp: "2026-05-01T00:00:00+00:00", value: 10 }],
          deviationBand: [
            { timestamp: "2026-05-01T00:00:00+00:00", lower: 8, upper: 12 },
            { timestamp: "2026-05-02T00:00:00+00:00", lower: 8, upper: null },
          ],
        }],
      },
      TEST_THEME,
      PHONE_CANVAS,
    );

    // When se lee el grosor de la banda (la serie apilada encima de la base)
    const thickness = seriesData(option, 1);

    // Then el punto incompleto no inventa un grosor
    expect(thickness).toEqual([
      ["2026-05-01T00:00:00+00:00", 4],
      ["2026-05-02T00:00:00+00:00", null],
    ]);
  });
});

describe("box plot", () => {
  it("un mes sin muestras deja el hueco en el eje, no una caja aplastada en cero", () => {
    // Given dos meses, uno con datos y otro sin ninguna muestra
    const option = buildBoxPlotOption(
      {
        unit: "°C",
        boxes: [
          { label: "2026-01", min: 1, q1: 2, median: 3, q3: 4, max: 5, count: 100 },
          { label: "2026-02", min: 0, q1: 0, median: 0, q3: 0, max: 0, count: 0 },
        ],
      },
      TEST_THEME,
    );

    // When se leen las cajas
    const boxes = seriesData(option, 0);

    // Then el mes vacío usa el valor vacío de ECharts y el otro sus cinco números
    expect(boxes[0]).toEqual([1, 2, 3, 4, 5]);
    expect(boxes[1]).toEqual(["-", "-", "-", "-", "-"]);
  });
});

describe("mapa de calor", () => {
  it("una celda sin medición viaja como nula para que no se pinte", () => {
    // Given una hora medida y una hora sin dato
    const option = buildCalendarHeatmapOption(
      {
        unit: "W/m²",
        columns: ["2026-05-01"],
        rows: ["11", "12"],
        cells: [
          { column: 0, row: 0, value: 820 },
          { column: 0, row: 1, value: null },
        ],
      },
      TEST_THEME,
    );

    // When se leen las celdas
    const cells = seriesData(option, 0);

    // Then la celda sin dato conserva su nulo
    expect(cells).toEqual([[0, 0, 820], [0, 1, null]]);
  });
});

describe("ajuste lineal", () => {
  it("publica la ecuación con su signo y el R²", () => {
    // Given un ajuste con intersección negativa
    const texto = describeFit({ slope: 1.234, intercept: -5.6, r2: 0.87 }, "W/m²", "W");

    // When se lee el pie del gráfico
    // Then la ecuación se lee tal como se escribiría a mano
    expect(texto).toContain("y = 1,234·x − 5,6");
    expect(texto).toContain("R² = 0,87");
  });
});

describe("el globo del tooltip", () => {
  /** Los cinco tooltips que la consola dibuja, con datos mínimos. */
  const TOOLTIPS = {
    "serie temporal": buildTimeSeriesOption(
      {
        unit: "W",
        lines: [{ id: "a", label: "A", points: [{ timestamp: "2026-05-01T00:00:00+00:00", value: 1 }] }],
      },
      TEST_THEME,
      PHONE_CANVAS,
    ),
    barras: buildBarsOption(
      { categories: ["2026-01"], unit: "kWh", series: [{ id: "a", label: "A", values: [1] }] },
      TEST_THEME,
      PHONE_CANVAS,
    ),
    "caja y bigotes": buildBoxPlotOption(
      { unit: "W", boxes: [{ label: "2026-01", min: 1, q1: 2, median: 3, q3: 4, max: 5, count: 9 }] },
      TEST_THEME,
    ),
    "mapa de calor": buildCalendarHeatmapOption(
      { unit: "W", columns: ["2026-05-01"], rows: ["11"], cells: [{ column: 0, row: 0, value: 8 }] },
      TEST_THEME,
    ),
  };

  it("se queda dentro del lienzo en todos los gráficos", () => {
    // Given cada uno de los tooltips de la consola
    for (const [nombre, option] of Object.entries(TOOLTIPS)) {
      const tooltip = option.tooltip as { readonly confine?: boolean };

      // When se lee si está confinado
      // Then lo está. En un teléfono, el globo de un dato del borde derecho se
      // dibujaría fuera de la pantalla, y la página no desplaza en horizontal:
      // el dato sencillamente no existiría para quien mira
      expect(tooltip.confine, nombre).toBe(true);
    }
  });
});
