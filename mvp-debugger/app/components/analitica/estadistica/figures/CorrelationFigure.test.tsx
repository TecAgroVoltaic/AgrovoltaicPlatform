// Lo que estas pruebas protegen: que la nube no se lea como más muestra de la
// que tiene. Los pares se forman por timestamp EXACTO y sobreviven pocos, de
// forma desigual entre meses; una nube densa y una nube sesgada se ven igual, y
// lo único que las distingue en pantalla es el número de pares del pie.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CorrelationFigure, toScatterData } from "@/app/components/analitica/estadistica/figures/CorrelationFigure";
import type { CorrelationResponse } from "@/app/lib/analitica/contracts/estadistica";

vi.mock("@/app/components/charts/EChart", () => ({
  EChart: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="img" aria-label={ariaLabel} data-testid="lienzo" />
  ),
}));

const PAIRS = 4388;
const X_READINGS = 57043;
const Y_READINGS = 28996;
const SLOPE = 0.635829;
const INTERCEPT = 107.4335;
const R_SQUARED = 0.3693;

const ENVELOPE = {
  window: { from: "2025-09-01", toExclusive: "2026-06-02", days: 274, granularity: "month" as const },
  confidence: {},
};

const X_VARIABLE = { key: "irradiancia_incidente_wm2", label: "Irradiancia incidente", unit: "W/m2" };
const Y_VARIABLE = { key: "potencia_pv1_w", label: "Potencia PV1 (inclinado)", unit: "W" };

function measured(value: number, unit: string) {
  return { status: "measured", value, count: PAIRS, unit } as const;
}

function missing(unit: string, reason: string) {
  return { status: "missing", count: 0, unit, reason } as const;
}

function correlationResponse(
  overrides: Partial<CorrelationResponse["payload"]> = {},
): CorrelationResponse {
  return {
    ...ENVELOPE,
    payload: {
      x: X_VARIABLE,
      y: Y_VARIABLE,
      pairs: PAIRS,
      xReadings: X_READINGS,
      yReadings: Y_READINGS,
      fit: {
        slope: measured(SLOPE, "W por W/m2"),
        intercept: measured(INTERCEPT, "W"),
        r2: measured(R_SQUARED, "adimensional"),
      },
      points: [
        [0, 0],
        [500, 425.9],
        [1000, 742.8],
      ],
      drawnPoints: 3,
      subsampled: false,
      note: "los pares se forman por timestamp EXACTO",
      ...overrides,
    },
  };
}

function renderFigure(response: CorrelationResponse) {
  render(
    <CorrelationFigure
      result={{ ok: true, data: response }}
      outOfCoverage={null}
      onRetry={vi.fn()}
      focusLabel="Potencia Inclinado (PV1)"
    />,
  );
}

describe("toScatterData", () => {
  it("usa el ajuste del backend y no vuelve a calcularlo", () => {
    // Given una respuesta con su recta ya ajustada
    const response = correlationResponse();

    // When se da forma a la nube
    const data = toScatterData(response);

    // Then la recta es exactamente la que vino, punto por punto
    expect(data.fit).toEqual({ slope: SLOPE, intercept: INTERCEPT, r2: R_SQUARED });
    expect(data.points).toHaveLength(3);
    expect(data.xUnit).toBe("W/m2");
  });

  it("sin ajuste no inventa una recta", () => {
    // Given una respuesta en que el backend no pudo ajustar
    const response = correlationResponse({
      fit: {
        slope: missing("W por W/m2", "pares_insuficientes"),
        intercept: missing("W", "pares_insuficientes"),
        r2: missing("adimensional", "pares_insuficientes"),
      },
    });

    // When se da forma a la nube
    const data = toScatterData(response);

    // Then no hay recta que dibujar y los puntos siguen ahí
    expect(data.fit).toBeNull();
    expect(data.points).toHaveLength(3);
  });
});

describe("CorrelationFigure", () => {
  it("publica cuántos pares sostienen la recta, no solo la ecuación", () => {
    // Given un ajuste sobre una fracción de las lecturas de cada lado
    renderFigure(correlationResponse());

    // When se lee el pie del gráfico
    const caption = screen.getByText(/pares de timestamp exacto/i);

    // Then están el R² y el tamaño real de la muestra emparejada
    expect(caption).toHaveTextContent(/R² = 0,369/);
    expect(caption).toHaveTextContent(/4.?388 pares/);
    expect(caption).toHaveTextContent(/57.?043 lecturas en X/);
    expect(caption).toHaveTextContent(/28.?996 en Y/);
  });

  it("avisa cuando la nube está adelgazada para dibujar", () => {
    // Given una respuesta submuestreada: se ajustó con más puntos de los que se ven
    renderFigure(correlationResponse({ drawnPoints: 1463, subsampled: true }));

    // When se lee el pie
    // Then dice cuántos puntos se dibujan de verdad
    expect(screen.getByText(/se dibujan 1.?463/i)).toBeInTheDocument();
  });

  it("sin un solo par cruzado, muestra el motivo del backend tal cual", () => {
    // Given dos variables que nunca coexistieron (el SP722 contra la potencia)
    const backendNote =
      "la ventana termina el 2025-12-02 y estas variables no existen antes del 2026-05-11";
    renderFigure(
      correlationResponse({
        pairs: 0,
        points: [],
        drawnPoints: 0,
        fit: {
          slope: missing("W por W/m2", "fuera_de_cobertura"),
          intercept: missing("W", "fuera_de_cobertura"),
          r2: missing("adimensional", "fuera_de_cobertura"),
        },
        note: backendNote,
      }),
    );

    // When se mira la pantalla
    // Then el vacío explica que no se solapan, y no se dibuja ninguna nube
    expect(screen.getByText(backendNote)).toBeInTheDocument();
    expect(screen.queryByTestId("lienzo")).not.toBeInTheDocument();
  });
});
