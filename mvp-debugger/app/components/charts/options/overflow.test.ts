// La regla que fija esta prueba: NADA de lo que el gráfico escribe termina fuera
// del lienzo, encima de otro texto, ni encima de la trama.
//
// Se mide sobre el gráfico RENDERIZADO (ver `chartGeometry`), no sobre la opción:
// estos defectos son de geometría y una prueba que no mida geometría no los ve.
//
// El ancho es el más angosto en que se usan estos gráficos (`PHONE_CANVAS`, 286
// px, medido con la ventana en 360). No es un detalle de la prueba: la opción se
// CONSTRUYE con ese ancho, porque desde que los gráficos responden al contenedor
// la opción de un teléfono no es la misma que la de un monitor.
import { describe, expect, it } from "vitest";

import { buildBarsOption } from "@/app/components/charts/options/bars";
import { buildCalendarHeatmapOption } from "@/app/components/charts/options/calendarHeatmap";
import { buildRidgelineOption } from "@/app/components/charts/options/ridgeline";
import { buildScatterFitOption } from "@/app/components/charts/options/scatterFit";
import { buildTimeSeriesOption } from "@/app/components/charts/options/timeSeries";
import {
  drawnTexts,
  outsideCanvas,
  overlappingPairs,
} from "@/app/components/charts/options/chartGeometry";
import {
  LAPTOP_CANVAS,
  PHONE_CANVAS,
  PHONE_HEATMAP_CANVAS,
  TEST_THEME,
} from "@/app/components/charts/options/fixtures";

/** Una línea de texto: la distancia mínima para que dos cosas se lean aparte. */
const READABLE_GAP = 8;

/** El nombre más largo del sistema, medido: 324 px de texto sobre un lienzo de
 * teléfono de 286. Optimizar para nombres cortos sería optimizar para un caso
 * que este producto no tiene. */
const LONG_VARIABLE = "Energía AC acumulada de vida (contador, kWh)";

/** El mapa que dibuja de verdad la vista: un mes de días por 24 horas. El tamaño
 * importa, con tres columnas las fechas caen lejos del centro y la colisión con
 * la escala de color se esquiva de casualidad. */
function monthHeatmap() {
  const days = Array.from({ length: 30 }, (_, day) =>
    `2026-05-${String(day + 1).padStart(2, "0")}`);
  const hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
  return buildCalendarHeatmapOption(
    {
      unit: "W/m2",
      columns: days,
      rows: hours,
      cells: days.flatMap((_, column) =>
        hours.map((_, row) => ({
          column,
          row,
          value: row > 5 && row < 18 ? 38 + column * row : null,
        }))),
    },
    TEST_THEME,
  );
}

/** Una variable con sus tres curvas derivadas, que es lo que dibuja Series: son
 * las CUATRO entradas de leyenda que no entran en un teléfono. */
function longNamedSeries(canvas: { readonly width: number }) {
  const points = Array.from({ length: 20 }, (_, index) => ({
    timestamp: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00+00:00`,
    value: 2500 + index,
  }));
  return buildTimeSeriesOption(
    {
      unit: "kWh",
      lines: [{
        id: "energia",
        label: LONG_VARIABLE,
        points,
        trend: points,
        movingAverage: points,
        deviationBand: points.map((point) => ({
          timestamp: point.timestamp,
          lower: point.value - 20,
          upper: point.value + 20,
        })),
      }],
    },
    TEST_THEME,
    canvas,
  );
}

describe("la unidad del eje entra en el lienzo", () => {
  it("la unidad del eje X no se sale por la derecha", () => {
    // Given la nube de puntos de la Fig. 8, cuyo eje X se mide en W/m2
    const option = buildScatterFitOption(
      {
        points: [{ x: 0, y: 5 }, { x: 500, y: 380 }, { x: 1000, y: 720 }],
        fit: { slope: 0.72, intercept: -3.1, r2: 0.94 },
        xUnit: "W/m2",
        yUnit: "W",
      },
      TEST_THEME,
    );

    // When se dibuja
    // Then "W/m2" se lee entero: antes arrancaba en el extremo del eje y crecía
    // hacia afuera, así que salía cortado contra el filo del lienzo
    expect(outsideCanvas(option, PHONE_CANVAS)).toEqual([]);
  });

  it("la unidad del eje Y tampoco se sale por la izquierda", () => {
    // Given la irradiación mensual, con la unidad más larga del tablero y
    // números cortos al lado, que es lo que deja el eje pegado al borde
    const option = buildBarsOption(
      {
        categories: ["2026-03", "2026-04"],
        unit: "kWh/m2",
        series: [{ id: "irr", label: "Irradiación", values: [126.38, null] }],
      },
      TEST_THEME,
      PHONE_CANVAS,
    );

    // When se dibuja
    // Then entra: alinear el nombre contra el eje sin reservarle sitio movería
    // el defecto de un borde al otro en vez de arreglarlo
    expect(outsideCanvas(option, PHONE_CANVAS)).toEqual([]);
  });
});

describe("las marcas del gráfico de crestas entran en el lienzo", () => {
  it("la etiqueta del umbral no se sale, aunque el umbral caiga contra el tope", () => {
    // Given un umbral EN el tope del eje, que es donde cae por construcción: el
    // sensor se satura en su máximo, así que el umbral y el mayor valor medido
    // son el mismo número y la línea queda pegada al borde de la rejilla
    const option = buildRidgelineOption(
      {
        unit: "°C",
        threshold: { value: 100, label: "umbral 100 °C" },
        curves: [{
          id: "inversor", label: "Temperatura inversor",
          x: [0, 40, 80, 100],
          density: [0.1, 0.6, 1, 0.2],
          tailProbability: 0.123,
        }],
      },
      TEST_THEME,
      PHONE_CANVAS,
    );

    // When se dibuja
    // Then el texto del umbral se lee entero
    expect(outsideCanvas(option, PHONE_CANVAS)).toEqual([]);
  });

  it("el nombre de un sensor entra aunque mida más que el lienzo", () => {
    // Given los tres sensores REALES de la Fig. 7, cuyo nombre con la cola mide
    // 230 px sobre un lienzo de 286. Antes se dibujaban empezando en x = −45 y
    // el de arriba se leía "raturá modulo inclinado"
    const option = buildRidgelineOption(
      {
        unit: "C",
        threshold: { value: 60, label: "umbral 60 C" },
        curves: [
          { id: "inc", label: "Temperatura modulo inclinado", x: [0, 30, 60], density: [0.1, 1, 0.2], tailProbability: 0.0123 },
          { id: "ver", label: "Temperatura modulo vertical", x: [0, 30, 60], density: [0.2, 0.9, 0.1], tailProbability: 0.004 },
          { id: "inv", label: "Temperatura del inversor", x: [0, 30, 60], density: [0.3, 0.8, 0.4], tailProbability: 0.21 },
        ],
      },
      TEST_THEME,
      PHONE_CANVAS,
    );

    // When se dibuja en el lienzo más angosto
    // Then los tres nombres entran, partidos en varias líneas si hace falta:
    // recortarlos se comería la probabilidad de cola, que va al final
    expect(outsideCanvas(option, PHONE_CANVAS)).toEqual([]);
  });
});

describe("la escala de color del mapa de calor no pisa el eje", () => {
  it("ningún texto queda encima de otro", () => {
    // Given el mapa de un mes, con extremos de cuatro cifras
    const option = monthHeatmap();

    // When se dibuja
    // Then nada se pisa: con la barra de color de 10 px de LARGO, el mínimo y el
    // máximo salían pegados entre sí y encima de una fecha
    expect(overlappingPairs(option, PHONE_HEATMAP_CANVAS)).toEqual([]);
    expect(outsideCanvas(option, PHONE_HEATMAP_CANVAS)).toEqual([]);
  });

  it("la escala queda debajo de las fechas, separada y no rozándolas", () => {
    // Given el mismo mapa
    const boxes = drawnTexts(monthHeatmap(), PHONE_HEATMAP_CANVAS);
    const datesBottom = Math.max(
      ...boxes.filter((box) => box.text.startsWith("2026-")).map((box) => box.bottom),
    );
    const below = boxes.filter((box) => box.top >= datesBottom);

    // When se mide lo que se dibuja por debajo de las fechas
    // Then ahí está la escala, y a una línea de distancia. No alcanza con que no
    // se toquen: a 1 px se salvaban por casualidad, y cualquier diferencia de
    // fuente entre este render y el del navegador las volvería a juntar
    expect(below.length).toBeGreaterThan(0);
    expect(Math.min(...below.map((box) => box.top)) - datesBottom)
      .toBeGreaterThanOrEqual(READABLE_GAP);
  });
});

describe("la leyenda no invade la trama ni se corta", () => {
  it("cabe en una sola fila con el nombre más largo del sistema", () => {
    // Given la variable de nombre más largo con sus tres curvas derivadas, en el
    // lienzo de un teléfono
    const option = longNamedSeries(PHONE_CANVAS);
    const gridTop = (option.grid as { readonly top: number }).top;
    const legendRows = drawnTexts(option, PHONE_CANVAS).filter((box) => box.top < gridTop);

    // When se mide dónde termina la leyenda
    // Then ni un renglón baja del borde superior de la trama. Con la leyenda
    // simple los ítems que no entraban se apilaban en una segunda fila a 29 px,
    // por debajo de los 34 px que la rejilla reserva, y se sentaban encima de la
    // curva a la vez que tapaban la unidad del eje
    expect(legendRows.length).toBeGreaterThan(0);
    expect(Math.max(...legendRows.map((box) => box.bottom))).toBeLessThanOrEqual(gridTop);
  });

  it("nada de lo que escribe se sale ni se pisa, ni en un teléfono ni en un portátil", () => {
    // Given el mismo gráfico a los dos anchos que la consola usa de verdad
    for (const canvas of [PHONE_CANVAS, LAPTOP_CANVAS]) {
      const option = longNamedSeries(canvas);

      // When se dibuja
      // Then no hay texto fuera del lienzo ni encima de otro. A 286 px la
      // leyenda pagina y a 754 entra entera: las dos tienen que quedar limpias
      expect(outsideCanvas(option, canvas)).toEqual([]);
      expect(overlappingPairs(option, canvas)).toEqual([]);
    }
  });
});
