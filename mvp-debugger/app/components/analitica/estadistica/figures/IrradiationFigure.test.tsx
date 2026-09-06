// Lo que estas pruebas protegen: que un mes sin integral NO se dibuje como una
// barra en cero. "Ese mes no hubo sol" y "ese mes no se midió" son afirmaciones
// distintas, y con una barra de altura cero se vuelven la misma.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  IrradiationFigure,
  toIrradiationBars,
} from "@/app/components/analitica/estadistica/figures/IrradiationFigure";
import type { IrradiationResponse } from "@/app/lib/analitica/contracts/estadistica";

vi.mock("@/app/components/charts/EChart", () => ({
  EChart: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="img" aria-label={ariaLabel} data-testid="lienzo" />
  ),
}));

const UNIT = "kWh/m2";
const MARCH_IRRADIATION = 126.38;
const TOTAL = 752.13;

const ENVELOPE = {
  window: { from: "2026-03-01", toExclusive: "2026-05-01", days: 61, granularity: "month" as const },
  confidence: {},
};

const VARIABLE = { key: "irradiancia_incidente_wm2", label: "Irradiancia incidente", unit: "W/m2" };

function irradiationResponse(
  overrides: Partial<IrradiationResponse["payload"]> = {},
): IrradiationResponse {
  return {
    ...ENVELOPE,
    payload: {
      variable: VARIABLE,
      bars: [
        {
          month: "2026-03",
          daysWithData: 27,
          irradiation: { status: "measured", value: MARCH_IRRADIATION, count: 3919, unit: UNIT },
        },
        {
          month: "2026-04",
          daysWithData: 0,
          irradiation: { status: "missing", count: 0, unit: UNIT, reason: "sin_lecturas" },
        },
      ],
      total: { status: "measured", value: TOTAL, count: 56450, unit: UNIT },
      ...overrides,
    },
  };
}

describe("toIrradiationBars", () => {
  it("un mes sin integral va como hueco y no como cero", () => {
    // Given un mes medido y otro sin ninguna lectura
    const response = irradiationResponse();

    // When se arman las barras
    const { categories, series } = toIrradiationBars(response);

    // Then el mes vacío conserva su categoría y su valor es nulo, no cero
    expect(categories).toEqual(["2026-03", "2026-04"]);
    expect(series[0].values).toEqual([MARCH_IRRADIATION, null]);
  });
});

describe("IrradiationFigure", () => {
  it("el pie publica el total del rango y aclara que es una integral", () => {
    // Given un rango con total medido
    render(
      <IrradiationFigure
        result={{ ok: true, data: irradiationResponse() }}
        outOfCoverage={null}
        onRetry={vi.fn()}
      />,
    );

    // When se lee el pie
    // Then está el total con su unidad y la advertencia de que no es un promedio
    expect(screen.getByText(/752,13 kWh\/m2/)).toBeInTheDocument();
    expect(screen.getByText(/no un promedio/)).toBeInTheDocument();
  });

  it("sin total, lo dice en vez de escribir un cero", () => {
    // Given un rango sin ninguna lectura integrable
    render(
      <IrradiationFigure
        result={{
          ok: true,
          data: irradiationResponse({
            total: { status: "missing", count: 0, unit: UNIT, reason: "sin_lecturas" },
          }),
        }}
        outOfCoverage={null}
        onRetry={vi.fn()}
      />,
    );

    // When se lee el pie
    // Then avisa de la ausencia y no aparece ningún número inventado
    expect(screen.getByText(/Sin total del rango/)).toBeInTheDocument();
  });
});
