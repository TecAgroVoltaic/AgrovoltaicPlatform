// Lo que estas pruebas protegen: que la estacionalidad no se invente.
//
// Un mes con la mitad de los días produce la mitad de la energía. Si entrara en
// la comparación al lado de un mes completo, la pantalla mostraría una
// estacionalidad que no existe; y si desapareciera sin decirlo, se leería como
// un mes sin sol. Las dos cosas son mentiras distintas y las dos importan.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MonthlyEnergyFigure } from "@/app/components/analitica/comparativa/MonthlyEnergyFigure";
import { SeasonalPrFigure } from "@/app/components/analitica/comparativa/SeasonalPrFigure";
import {
  arrayComparison,
  ENERGY_PATHS_WITHOUT_WARNING,
  performanceReport,
} from "@/app/components/analitica/comparativa/fixtures";

vi.mock("@/app/components/charts/EChart", () => ({
  EChart: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="img" aria-label={ariaLabel} data-testid="lienzo" />
  ),
}));

const NOT_ENOUGH_MONTHS = {
  suficiente: false,
  meses: [],
  descartados: [],
  cobertura_minima: 0.6,
  advertencia:
    "no se puede hablar de estacionalidad: solo 0 mes(es) llegan al 60% de dias con datos",
};

describe("MonthlyEnergyFigure", () => {
  it("nombra los meses que quedaron fuera y por qué", () => {
    // Given un período con un mes por debajo del mínimo de cobertura
    render(
      <MonthlyEnergyFigure result={{ ok: true, data: arrayComparison() }} onRetry={vi.fn()} />,
    );

    // When se lee el pie de la figura
    // Then el mes ausente aparece con su cobertura y su motivo
    expect(screen.getByText("2025-09")).toBeInTheDocument();
    expect(screen.getByText(/cobertura insuficiente/)).toBeInTheDocument();
    expect(screen.getByText(/no llegar al 60/)).toBeInTheDocument();
  });

  it("sin meses comparables muestra la advertencia del backend, no un gráfico vacío", () => {
    // Given un rango en que ningún mes llega al mínimo
    render(
      <MonthlyEnergyFigure
        result={{ ok: true, data: arrayComparison({ estacionalidad: NOT_ENOUGH_MONTHS }) }}
        onRetry={vi.fn()}
      />,
    );

    // When se mira el lugar del gráfico
    // Then está el texto que redactó el servicio, tal cual
    expect(screen.getByText(NOT_ENOUGH_MONTHS.advertencia)).toBeInTheDocument();
    expect(screen.queryByTestId("lienzo")).not.toBeInTheDocument();
  });
});

describe("SeasonalPrFigure", () => {
  it("arranca por el camino que no depende de ningún modelo", () => {
    // Given el informe del período
    render(<SeasonalPrFigure result={{ ok: true, data: performanceReport() }} onRetry={vi.fn()} />);

    // When se mira qué variante está elegida
    // Then es la integral contra la irradiancia medida, y las POA quedan marcadas
    expect(screen.getByRole("button", { name: /Integral · GHI horizontal/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getAllByText(/provisional/).length).toBeGreaterThan(0);
  });

  it("al elegir el camino del contador recuerda que los dos no se mezclan", () => {
    // Given la figura con la integral elegida
    render(<SeasonalPrFigure result={{ ok: true, data: performanceReport() }} onRetry={vi.fn()} />);

    // When se cambia al camino del contador
    fireEvent.click(screen.getByRole("button", { name: /Contador · GHI horizontal/ }));

    // Then el pie trae la advertencia del backend sobre el sesgo de esa muestra
    expect(screen.getByText(/NUNCA se mezclan/)).toBeInTheDocument();
  });

  it("sin advertencia el pie del contador queda en sus días, sin texto pegado", () => {
    // Given un período donde el contador cubre todos los días válidos
    const report = performanceReport({ fuente_energia: ENERGY_PATHS_WITHOUT_WARNING });
    render(<SeasonalPrFigure result={{ ok: true, data: report }} onRetry={vi.fn()} />);

    // When se cambia al camino del contador
    fireEvent.click(screen.getByRole("button", { name: /Contador · GHI horizontal/ }));

    // Then el pie dice solo la variante y sus días: ni «null» ni frase colgando
    expect(
      screen.getByText("Contador · GHI horizontal, 91 días válidos en el período."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/null/)).not.toBeInTheDocument();
  });
});
