// Lo que esta prueba protege: que el método que contradice al resto se muestre
// CON su tamaño de muestra y con su unidad, que no es la del PR.
//
// Emparejar por marca de tiempo exacta conserva una fracción de las lecturas del
// período. Mostrar ese número solo, o esconderlo, son las dos formas de mentir
// con él: al lado de las lecturas que conserva se entiende por qué discrepa.
// Quién queda arriba se afirma en `cuts.test.ts` y en `MethodSection.test.tsx`.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PointToPointPanel } from "@/app/components/analitica/comparativa/PointToPointPanel";
import { arrayComparison } from "@/app/components/analitica/comparativa/fixtures";

describe("PointToPointPanel", () => {
  it("muestra el cruce con las lecturas que conserva y sin llamarlo Performance Ratio", () => {
    // Given el cruce punto a punto del período
    render(
      <PointToPointPanel
        comparison={{ ok: true, data: arrayComparison() }}
        onRetry={vi.fn()}
      />,
    );

    // When se lee el panel
    // Then están los dos valores con su unidad propia, la muestra que cada uno
    // conserva y la nota del backend que impide leerlo como un PR
    expect(screen.getByText("0,883")).toBeInTheDocument();
    expect(screen.getAllByText(/kWh por kWh\/m2/).length).toBeGreaterThan(0);
    expect(
      screen.getByText(/3.041 lecturas emparejadas, de 28.996 del período/),
    ).toBeInTheDocument();
    expect(screen.getByText(/NO es un Performance Ratio/)).toBeInTheDocument();
  });
});
