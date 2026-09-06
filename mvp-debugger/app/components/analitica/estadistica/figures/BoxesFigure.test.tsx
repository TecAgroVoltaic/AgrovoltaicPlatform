// Lo que estas pruebas protegen: que un mes sin lecturas se vea como un HUECO y
// no como una caja aplastada en cero. En este histórico faltan meses enteros, y
// una caja en cero diría que la planta midió cero, que es otra cosa.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BoxesFigure, toBoxPlotData } from "@/app/components/analitica/estadistica/figures/BoxesFigure";
import type { DistributionResponse, MonthlyBox } from "@/app/lib/analitica/contracts/estadistica";

vi.mock("@/app/components/charts/EChart", () => ({
  EChart: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="img" aria-label={ariaLabel} data-testid="lienzo" />
  ),
}));

const ENVELOPE = {
  window: { from: "2026-02-01", toExclusive: "2026-04-01", days: 59, granularity: "month" as const },
  confidence: {},
};

const OUTLIER_MAXIMUM = 26503162;
const UPPER_WHISKER = 959.5;

const FULL_MONTH: MonthlyBox = {
  month: "2026-02",
  count: 3343,
  minimum: 0,
  q1: 2.23,
  median: 132.28,
  q3: 386.06,
  // El máximo absoluto es una fila del piranómetro mezclada con las del inversor.
  maximum: OUTLIER_MAXIMUM,
  lowerWhisker: 0,
  upperWhisker: UPPER_WHISKER,
};

const EMPTY_MONTH: MonthlyBox = {
  month: "2026-03",
  count: 0,
  minimum: null,
  q1: null,
  median: null,
  q3: null,
  maximum: null,
  lowerWhisker: null,
  upperWhisker: null,
};

function distributionResponse(boxes: MonthlyBox[]): DistributionResponse {
  return {
    ...ENVELOPE,
    payload: {
      variable: { key: "potencia_pv1_w", label: "Potencia PV1 (inclinado)", unit: "W" },
      iqrFactor: 1.5,
      boxes,
    },
  };
}

describe("toBoxPlotData", () => {
  it("cierra la caja en el bigote de la valla IQR, no en el máximo absoluto", () => {
    // Given un mes con un pico imposible del piranómetro mezclado
    const response = distributionResponse([FULL_MONTH]);

    // When se da forma a las cajas
    const [box] = toBoxPlotData(response).boxes;

    // Then la caja llega hasta el bigote, que es lo que deja ver la distribución
    expect(box.max).toBe(UPPER_WHISKER);
    expect(box.max).not.toBe(OUTLIER_MAXIMUM);
    expect(box.count).toBe(FULL_MONTH.count);
  });

  it("un mes sin muestras sigue en el eje, pero sin caja", () => {
    // Given un mes con lecturas y otro sin ninguna
    const response = distributionResponse([FULL_MONTH, EMPTY_MONTH]);

    // When se da forma a las cajas
    const { boxes } = toBoxPlotData(response);

    // Then el mes vacío conserva su lugar en el eje y no dibuja nada
    expect(boxes.map((box) => box.label)).toEqual(["2026-02", "2026-03"]);
    expect(boxes[1].count).toBe(0);
  });
});

describe("BoxesFigure", () => {
  it("el pie dice con qué criterio se marcan los atípicos y cuántos meses tienen muestra", () => {
    // Given un rango de dos meses con uno solo medido
    render(
      <BoxesFigure
        result={{ ok: true, data: distributionResponse([FULL_MONTH, EMPTY_MONTH]) }}
        outOfCoverage={null}
        onRetry={vi.fn()}
        focusLabel="Potencia Inclinado (PV1)"
      />,
    );

    // When se lee el pie
    // Then están el criterio IQR y cuánto del rango tiene muestra de verdad
    expect(screen.getByText(/1,5·IQR/)).toBeInTheDocument();
    expect(screen.getByText(/1 de 2 meses con muestras/)).toBeInTheDocument();
  });

  it("con todos los meses vacíos, el gráfico explica el vacío", () => {
    // Given un rango en que ningún mes dejó lecturas
    render(
      <BoxesFigure
        result={{ ok: true, data: distributionResponse([EMPTY_MONTH]) }}
        outOfCoverage={null}
        onRetry={vi.fn()}
        focusLabel="Potencia Inclinado (PV1)"
      />,
    );

    // When se mira la pantalla
    // Then hay un motivo escrito y ningún lienzo
    expect(screen.getByText(/Sin datos para este rango/i)).toBeInTheDocument();
    expect(screen.queryByTestId("lienzo")).not.toBeInTheDocument();
  });
});
