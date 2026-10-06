// Lo que protege: que cada variante llegue a una primitiva con su título, que un
// spec roto se diga en pantalla en vez de dibujarse a medias, y que el pie solo
// aparezca bajo un gráfico válido.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChartSpecRenderer } from "@/app/components/asistente/ChartSpecRenderer";
import { CHART_SPEC_BY_KIND, CHART_SPEC_KINDS } from "@/app/lib/asistente/fixtures";

vi.mock("@/app/components/charts/EChart", () => ({
  EChart: ({ ariaLabel }: { ariaLabel: string }) => <div role="img" aria-label={ariaLabel} />,
}));

describe("ChartSpecRenderer", () => {
  it.each(CHART_SPEC_KINDS)("dibuja la variante «%s» con su primitiva", (kind) => {
    const spec = CHART_SPEC_BY_KIND[kind];
    render(<ChartSpecRenderer spec={spec} />);
    expect(screen.getByRole("img", { name: String(spec.titulo) })).toBeInTheDocument();
  });

  it("un spec que no cumple el contrato muestra el motivo y no dibuja nada", () => {
    // Given un ChartSpec de barras con una barra de menos
    const broken = { ...CHART_SPEC_BY_KIND.barras, datos: { ...CHART_SPEC_BY_KIND.barras.datos, series: [{ id: "a", label: "A", values: [1] }] } };
    // When se pinta, con un pie pedido
    render(<ChartSpecRenderer spec={broken} footer={() => <button type="button">Descargar estos datos</button>} />);
    // Then se ve el error con la ruta del campo, sin lienzo y sin pie
    expect(screen.getByRole("alert")).toHaveTextContent("datos.series.0.values");
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("una serie sin líneas se muestra vacía con motivo", () => {
    const empty = { ...CHART_SPEC_BY_KIND.serie, datos: { unit: "W", lines: [] } };
    render(<ChartSpecRenderer spec={empty} />);
    expect(screen.getByText("Sin datos para este rango")).toBeInTheDocument();
  });
});
