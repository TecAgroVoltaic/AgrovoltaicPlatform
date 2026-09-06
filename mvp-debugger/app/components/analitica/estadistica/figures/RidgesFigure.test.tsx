// Lo que estas pruebas protegen: que la comparación entre sensores sea honesta.
// Un sensor que no entra en el dibujo tiene que decirse (si no, la figura parece
// comparar a todos), y las crestas tienen que compartir escala (si no, un sensor
// con cuatro lecturas se ve tan alto como el que tiene veinte mil).
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  RidgesFigure,
  excludedGroups,
  toRidgelineData,
} from "@/app/components/analitica/estadistica/figures/RidgesFigure";
import type { DensityGroup, RidgesResponse } from "@/app/lib/analitica/contracts/estadistica";

vi.mock("@/app/components/charts/EChart", () => ({
  EChart: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="img" aria-label={ariaLabel} data-testid="lienzo" />
  ),
}));

const THRESHOLD = 60;
const TALL_PEAK = 0.05;
const SHORT_PEAK = 0.01;
const TAIL = 0.0133;

const ENVELOPE = {
  window: { from: "2025-09-01", toExclusive: "2026-06-02", days: 274, granularity: "month" as const },
  confidence: {},
};

function group(overrides: Partial<DensityGroup> = {}): DensityGroup {
  return {
    key: "temp_inclinado",
    label: "Temperatura módulo inclinado",
    readings: 17377,
    usedReadings: 5792,
    density: [0, TALL_PEAK, 0],
    tailProbability: { status: "measured", value: TAIL, count: 5792, unit: "probabilidad" },
    outOfCoverage: null,
    ...overrides,
  };
}

function ridgesResponse(groups: DensityGroup[]): RidgesResponse {
  return {
    ...ENVELOPE,
    payload: { unit: "C", grid: [0, 45, 90], threshold: THRESHOLD, groups },
  };
}

describe("toRidgelineData", () => {
  it("escala las crestas al pico común, así el sensor bajo se ve bajo", () => {
    // Given dos sensores cuyas densidades difieren en un factor de cinco
    const response = ridgesResponse([
      group(),
      group({ key: "temp_vertical", label: "Temperatura módulo vertical", density: [0, SHORT_PEAK, 0] }),
    ]);

    // When se arman las crestas
    const { curves, threshold } = toRidgelineData(response);

    // Then la más alta llega a 1 y la otra conserva su proporción
    expect(curves[0].density[1]).toBe(1);
    expect(curves[1].density[1]).toBeCloseTo(SHORT_PEAK / TALL_PEAK);
    expect(threshold).toEqual({ value: THRESHOLD, label: `umbral ${THRESHOLD} C` });
  });

  it("lleva la probabilidad de cola de cada sensor a su etiqueta", () => {
    // Given un sensor con probabilidad medida de pasar del umbral
    const response = ridgesResponse([group()]);

    // When se arman las crestas
    const { curves } = toRidgelineData(response);

    // Then la probabilidad viaja con la curva
    expect(curves[0].tailProbability).toBe(TAIL);
  });

  it("deja fuera del dibujo al sensor sin densidad, nombrándolo", () => {
    // Given un sensor que no existía en la ventana
    const response = ridgesResponse([
      group(),
      group({
        key: "irradiancia_incidente_sp722_wm2",
        label: "Irradiancia incidente SP722",
        density: null,
        outOfCoverage: "la ventana termina el 2025-12-02 y estas variables no existen antes del 2026-05-11",
      }),
    ]);

    // When se arman las crestas y se pregunta quién quedó fuera
    const { curves } = toRidgelineData(response);
    const excluded = excludedGroups(response);

    // Then solo se dibuja el que tiene densidad, y el otro queda anunciado
    expect(curves).toHaveLength(1);
    expect(excluded).toHaveLength(1);
    expect(excluded[0]).toMatch(/SP722.*no existen antes del 2026-05-11/);
  });
});

describe("RidgesFigure", () => {
  it("nombra debajo del gráfico a los sensores que no entraron", () => {
    // Given una comparación en que un sensor se quedó sin lecturas
    render(
      <RidgesFigure
        result={{
          ok: true,
          data: ridgesResponse([
            group(),
            group({ key: "temp_vertical", label: "Temperatura módulo vertical", density: null }),
          ]),
        }}
        outOfCoverage={null}
        onRetry={vi.fn()}
      />,
    );

    // When se mira debajo de la figura
    // Then el sensor ausente aparece con su motivo
    expect(screen.getByText(/Fuera de la comparación/)).toHaveTextContent(
      /Temperatura módulo vertical: sin lecturas suficientes/,
    );
  });

  it("si ningún sensor tiene densidad, el vacío explica por qué", () => {
    // Given los dos sensores fuera de su ventana
    const reason = "la ventana empieza el 2026-06-01 y estas variables dejaron de registrarse";
    render(
      <RidgesFigure
        result={{
          ok: true,
          data: ridgesResponse([group({ density: null, outOfCoverage: reason })]),
        }}
        outOfCoverage={null}
        onRetry={vi.fn()}
      />,
    );

    // When se mira la pantalla
    // Then el motivo del backend está escrito y no hay lienzo
    expect(screen.getByText(new RegExp(reason))).toBeInTheDocument();
    expect(screen.queryByTestId("lienzo")).not.toBeInTheDocument();
  });
});
