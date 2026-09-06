// Lo que fija esta prueba: que haber añadido la orientación horizontal no cambió
// NI UN DETALLE de lo que ya dibujaban las otras tres vistas.
//
// `BarsChart` lo usan seis figuras (completitud, energía mensual, método, PR
// estacional, perfil horario, irradiación) y ninguna pidió el cambio. Las
// opciones esperadas se capturaron del builder ANTES de tocarlo, así que si
// alguien altera el camino por defecto esto lo delata acá, en vez de que aparezca
// en producción en una vista ajena.
import { describe, expect, it } from "vitest";

import { buildBarsOption, type BarsData } from "@/app/components/charts/options/bars";
import {
  VERTICAL_ONE_SERIES,
  VERTICAL_TWO_SERIES,
} from "@/app/components/charts/options/barsBaseline";
import { PHONE_CANVAS, TEST_THEME } from "@/app/components/charts/options/fixtures";

/** Sin las funciones (los formateadores), que no se comparan por igualdad. */
function plain(option: unknown): unknown {
  return JSON.parse(JSON.stringify(option));
}

function firstSeries<T>(option: { readonly series?: unknown }): T {
  const series = option.series;
  return (Array.isArray(series) ? series[0] : series) as T;
}

describe("barras verticales, que es el comportamiento por defecto", () => {
  it("sin pedir orientación emite la misma opción de siempre, con una serie", () => {
    // Given los datos de un consumidor actual, con un hueco sin medir
    const data: BarsData = {
      categories: ["2026-01", "2026-02"],
      unit: "kWh",
      series: [{ id: "a", label: "Registradas", values: [10, null] }],
    };

    // When se construye la opción sin nombrar la orientación
    const option = buildBarsOption(data, TEST_THEME, PHONE_CANVAS);

    // Then coincide con la que se dibujaba antes de existir el eje horizontal
    expect(plain(option)).toEqual(VERTICAL_ONE_SERIES);
  });

  it("sin pedir orientación emite la misma opción de siempre, con dos series", () => {
    // Given dos series, que son las que encienden la leyenda
    const data: BarsData = {
      categories: ["2026-01", "2026-02"],
      unit: "lecturas",
      series: [
        { id: "a", label: "Registradas", values: [10, 0] },
        { id: "b", label: "Esperadas", values: [20, 30], color: "ceil" },
      ],
    };

    // When se construye la opción
    const option = buildBarsOption(data, TEST_THEME, PHONE_CANVAS);

    // Then la leyenda y el margen superior siguen exactamente igual
    expect(plain(option)).toEqual(VERTICAL_TWO_SERIES);
  });

  it("mantiene el formateador del tooltip, que la comparación estructural no ve", () => {
    // Given una serie cualquiera
    const option = buildBarsOption(
      { categories: ["2026-01"], unit: "kWh", series: [{ id: "a", label: "A", values: [10] }] },
      TEST_THEME,
      PHONE_CANVAS,
    );
    const tooltip = option.tooltip as { valueFormatter: (value: unknown) => string };

    // When se formatea un valor medido y un hueco
    // Then el decimal sale con la coma de es-CR y el hueco se sigue diciendo,
    // en vez de salir como un cero que se leería como "no produjo nada"
    expect(tooltip.valueFormatter(10.25)).toBe("10,3 kWh");
    expect(tooltip.valueFormatter(null)).toBe("sin dato");
  });

  it("sin cifras pedidas no añade ninguna etiqueta a las barras", () => {
    // Given una serie que no pidió `valueLabels`
    const option = buildBarsOption(
      { categories: ["2026-01"], unit: "kWh", series: [{ id: "a", label: "A", values: [1] }] },
      TEST_THEME,
      PHONE_CANVAS,
    );

    // When se mira la serie que va al lienzo
    // Then no aparece `label`: lo contrario llenaría de texto seis figuras ajenas
    expect(firstSeries(option)).not.toHaveProperty("label");
  });
});

describe("barras horizontales", () => {
  const RANKED: BarsData = {
    orientation: "horizontal",
    categories: ["energia_pv2_wh", "temperatura_inversor_c", "voltaje_pv1_v"],
    unit: "d",
    series: [
      {
        id: "usable-days",
        label: "Días utilizables",
        values: [74, 183, 298],
        valueLabels: ["74 d · 11,2 %", "183 d · 27,7 %", "298 d · 45,2 %"],
      },
    ],
  };

  it("pasa la categoría al eje Y y la deja leerse de arriba hacia abajo", () => {
    // Given un ranking que llega de la peor variable a la mejor
    // When se construye la opción horizontal
    const option = buildBarsOption(RANKED, TEST_THEME, PHONE_CANVAS);
    const axis = option.yAxis as { type: string; data: string[]; inverse?: boolean };

    // Then la peor queda ARRIBA: sin `inverse` ECharts la pondría abajo y la
    // lista se leería al revés de como viene ordenada
    expect((option.xAxis as { type: string }).type).toBe("value");
    expect(axis.type).toBe("category");
    expect(axis.inverse).toBe(true);
    expect(axis.data[0]).toBe("energia_pv2_wh");
  });

  it("escribe la cifra junto a cada barra, sin que haga falta el ratón", () => {
    // Given el mismo ranking, con su cifra ya formateada
    const option = buildBarsOption(RANKED, TEST_THEME, PHONE_CANVAS);
    const series = firstSeries<{
      label: { show: boolean; position: string; formatter: (params: unknown) => string };
    }>(option);

    // When se resuelve la etiqueta de la primera y la última barra
    // Then cada una lleva la suya escrita, pasado el extremo de la barra
    expect(series.label.show).toBe(true);
    expect(series.label.position).toBe("right");
    expect(series.label.formatter({ dataIndex: 0 })).toBe("74 d · 11,2 %");
    expect(series.label.formatter({ dataIndex: 2 })).toBe("298 d · 45,2 %");
  });

  it("reserva sitio a la derecha para esa cifra", () => {
    // Given barras horizontales con la cifra escrita al final
    const option = buildBarsOption(RANKED, TEST_THEME, PHONE_CANVAS);

    // When se mira el margen del área de dibujo
    // Then hay hueco: con el margen de siempre, la cifra de la barra más larga
    // quedaría cortada contra el borde
    expect((option.grid as { right: number }).right).toBeGreaterThan(16);
  });

  it("redondea el extremo por el que la barra crece, no el de arriba", () => {
    // Given una barra que crece hacia la derecha
    const option = buildBarsOption(RANKED, TEST_THEME, PHONE_CANVAS);
    const series = firstSeries<{ itemStyle: { borderRadius: number[] } }>(option);

    // When se lee el redondeo
    // Then va del lado derecho, no del superior como en las verticales
    expect(series.itemStyle.borderRadius).toEqual([0, 3, 3, 0]);
  });

  it("un índice sin etiqueta no pinta basura sobre el gráfico", () => {
    // Given menos etiquetas que barras, que es lo que dejaría un desfase
    const option = buildBarsOption(
      {
        orientation: "horizontal",
        categories: ["a", "b"],
        unit: "d",
        series: [{ id: "s", label: "S", values: [1, 2], valueLabels: ["uno"] }],
      },
      TEST_THEME,
      PHONE_CANVAS,
    );
    const series = firstSeries<{ label: { formatter: (params: unknown) => string } }>(option);

    // When se pide la etiqueta que falta
    // Then sale vacía, en vez de un "undefined" dibujado en el lienzo
    expect(series.label.formatter({ dataIndex: 1 })).toBe("");
    expect(series.label.formatter({})).toBe("");
  });
});
