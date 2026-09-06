// La regla que fija esta prueba: cada cresta DICE de qué sensor es.
//
// El pie de la figura promete "entre paréntesis, la probabilidad de pasar del
// umbral", y durante un tiempo el eje Y salió entero en blanco: `min: -0.25` con
// `interval: 1` ponía las marcas en -0,25 / 0,75 / 1,75, el formateador buscaba
// la curva número 2,25, no existía, y devolvía cadena vacía. Un eje vacío no se
// ve como un error, se ve como un diseño, y por eso pasó una revisión humana.
import { describe, expect, it } from "vitest";

import { buildRidgelineOption, type RidgelineData } from "@/app/components/charts/options/ridgeline";
import { PHONE_CANVAS, TEST_THEME } from "@/app/components/charts/options/fixtures";

const THREE_SENSORS: RidgelineData = {
  unit: "°C",
  curves: [
    { id: "inv", label: "Inversor", x: [10, 20], density: [0.2, 1], tailProbability: 0.123 },
    { id: "pan", label: "Panel", x: [10, 20], density: [0.4, 0.9], tailProbability: 0 },
    { id: "amb", label: "Ambiente", x: [10, 20], density: [0.1, 0.5], tailProbability: null },
  ],
};

type ValueAxis = {
  readonly axisLabel: {
    readonly customValues?: readonly number[];
    readonly formatter: (value: number) => string;
  };
  readonly axisTick: { readonly customValues?: readonly number[] };
};

function verticalAxis(data: RidgelineData): ValueAxis {
  return buildRidgelineOption(data, TEST_THEME, PHONE_CANVAS).yAxis as unknown as ValueAxis;
}

/** Lo que el lector ve escrito en el eje, de la fila de ARRIBA hacia abajo: la
 * primera curva se dibuja en lo alto, que es el orden en que llegan. */
function rowLabels(data: RidgelineData): readonly string[] {
  const axis = verticalAxis(data);
  return (axis.axisLabel.customValues ?? []).map((value) => axis.axisLabel.formatter(value));
}

describe("etiquetas del eje de sensores", () => {
  it("nombra las tres filas, de arriba hacia abajo y en el orden que llegan", () => {
    // Given tres sensores, el primero de los cuales se dibuja arriba
    // When se resuelven las etiquetas del eje
    const labels = rowLabels(THREE_SENSORS);

    // Then ninguna sale vacía, y cada una nombra a su sensor
    expect(labels).toHaveLength(3);
    expect(labels.every((label) => label.trim().length > 0)).toBe(true);
    expect(labels[0]).toContain("Inversor");
    expect(labels[2]).toContain("Ambiente");
  });

  it("escribe la probabilidad de cola que promete el pie de la figura", () => {
    // Given un sensor con probabilidad de cola medida
    // When se lee su etiqueta (la de arriba del todo)
    const labels = rowLabels(THREE_SENSORS);

    // Then la cifra aparece en porcentaje, con la coma de es-CR
    expect(labels[0]).toBe("Inversor (cola 12,3 %)");
  });

  it("una cola de cero se escribe, en vez de callarse como si faltara", () => {
    // Given un sensor que NUNCA pasó del umbral: cero medido, no ausencia
    // When se lee su etiqueta
    const labels = rowLabels(THREE_SENSORS);

    // Then dice 0 %: callarlo lo haría indistinguible de un sensor sin dato
    expect(labels[1]).toBe("Panel (cola 0 %)");
  });

  it("un sensor sin probabilidad medida queda con su nombre y nada más", () => {
    // Given un sensor cuya cola el backend no calculó
    // When se lee su etiqueta
    const labels = rowLabels(THREE_SENSORS);

    // Then no se inventa un paréntesis vacío ni un cero que no se midió
    expect(labels[2]).toBe("Ambiente");
  });

  it("pone una marca por fila y ninguna entre medio", () => {
    // Given los tres sensores
    // When se leen las marcas declaradas del eje
    const axis = verticalAxis(THREE_SENSORS);

    // Then caen en las líneas base de las crestas, que son ENTERAS, una por
    // sensor y en el orden en que se dibujan (la primera curva, arriba del todo,
    // se apoya en la línea base más alta). Es el detalle que hacía fallar todo:
    // con marcas fraccionarias no hay curva que buscar y la etiqueta sale vacía
    expect(axis.axisLabel.customValues).toEqual([2, 1, 0]);
    expect(axis.axisTick.customValues).toEqual([2, 1, 0]);
  });

  it("una marca que no es una fila no pinta basura", () => {
    // Given un valor fuera de las líneas base, que es lo que dejaría un cambio
    // futuro del margen del eje
    const axis = verticalAxis(THREE_SENSORS);

    // When se le pide etiqueta
    // Then sale vacía, en vez de un "undefined" dibujado en el lienzo
    expect(axis.axisLabel.formatter(2.25)).toBe("");
  });

  it("un solo sensor también se nombra", () => {
    // Given el caso límite de una única cresta
    const data: RidgelineData = {
      unit: "°C",
      curves: [{ id: "inv", label: "Inversor", x: [10, 20], density: [0.2, 1] }],
    };

    // When se resuelven las etiquetas
    // Then la única fila lleva su nombre
    expect(rowLabels(data)).toEqual(["Inversor"]);
  });
});

describe("el eje contiene el umbral", () => {
  /** Lo REAL: el umbral son 60 °C y la temperatura más alta que el sitio
   * registró en el último mes son 58,4. El caso normal, no el raro. */
  const BELOW_THRESHOLD: RidgelineData = {
    unit: "C",
    threshold: { value: 60, label: "umbral 60 C" },
    curves: [
      { id: "inc", label: "Inclinado", x: [4.2, 30, 58.4], density: [0.1, 1, 0.2] },
      { id: "ver", label: "Vertical", x: [4.2, 30, 55.1], density: [0.2, 0.9, 0.1] },
    ],
  };

  function horizontalAxis(data: RidgelineData) {
    return buildRidgelineOption(data, TEST_THEME, PHONE_CANVAS).xAxis as {
      readonly min?: number;
      readonly max?: number;
    };
  }

  it("estira el eje pasado el umbral cuando nada lo alcanzó", () => {
    // Given un umbral por encima de todo lo medido
    // When se construye el eje de la magnitud
    const axis = horizontalAxis(BELOW_THRESHOLD);

    // Then el eje llega MÁS ALLÁ del umbral. Sin esto ECharts lo ajusta a los
    // datos, la línea del umbral cae fuera de la rejilla y no se dibuja: la
    // figura promete una referencia y enseña un lienzo sin ella
    expect(axis.max).toBeGreaterThan(60);
  });

  it("no toca el eje cuando el umbral cae dentro de lo medido", () => {
    // Given un umbral que las lecturas sí cruzan
    const crossed: RidgelineData = {
      ...BELOW_THRESHOLD,
      threshold: { value: 40, label: "umbral 40 C" },
    };

    // When se construye el eje
    const axis = horizontalAxis(crossed);

    // Then se deja en manos de ECharts, que redondea los cortes mejor que
    // cualquier cuenta a mano
    expect(axis.max).toBeUndefined();
    expect(axis.min).toBeUndefined();
  });
});
