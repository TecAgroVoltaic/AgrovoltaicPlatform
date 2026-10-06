// Lo que protege: que las acciones de la tarjeta lleven a los MISMOS datos del
// gráfico (Series con su variable y rango, la descarga con su pedido) y que
// Ampliar abra el gráfico en un diálogo que se puede cerrar.
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChartCard } from "@/app/components/asistente/ChartCard";
import { CHART_SPEC_BY_KIND } from "@/app/lib/asistente/fixtures";
import type { ChartRequest } from "@/app/lib/asistente/messageBlocks";

vi.mock("@/app/components/charts/EChart", () => ({
  EChart: ({ ariaLabel }: { ariaLabel: string }) => <div role="img" aria-label={ariaLabel} />,
}));

const REQUEST: ChartRequest = {
  variables: ["potencia_pv1_w"],
  from: "2026-08-01",
  toExclusive: "2026-09-01",
  granularity: "dia",
};

function renderCard(request: ChartRequest | null, askDisabled = false) {
  const onAsk = vi.fn();
  render(<ChartCard spec={CHART_SPEC_BY_KIND.serie} request={request} onAsk={onAsk} askDisabled={askDisabled} />);
  return { onAsk };
}

describe("ChartCard", () => {
  it("«Abrir en Series» lleva la variable y el rango con que se pidió el gráfico", () => {
    renderCard(REQUEST);
    const link = screen.getByRole("link", { name: "Abrir en Series" });
    expect(link).toHaveAttribute("href", "/series?variables=potencia_pv1_w&desde=2026-08-01&hasta=2026-09-01&granularidad=dia");
  });

  it("el pie dice cuánto dibuja el gráfico y de qué variables sale", () => {
    renderCard(REQUEST);
    expect(screen.getByText("2 puntos · potencia_pv1_w")).toBeInTheDocument();
  });

  it("«Descargar estos datos» pide la exportación con el mismo pedido, y espera si hay otra respuesta", () => {
    const { onAsk } = renderCard(REQUEST);
    fireEvent.click(screen.getByRole("button", { name: "Descargar estos datos" }));
    expect(onAsk).toHaveBeenCalledWith(expect.stringContaining("desde 2026-08-01 hasta 2026-09-01"));
  });

  it("sin el pedido del gráfico no inventa acciones: solo el gráfico y su tamaño", () => {
    renderCard(null);
    expect(screen.getByRole("img", { name: "Potencia PV1" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Abrir en Series" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Descargar estos datos" })).toBeNull();
  });

  it("Ampliar abre el mismo gráfico en un diálogo modal y Cerrar lo cierra", () => {
    // Given la tarjeta con su gráfico
    renderCard(REQUEST);
    const zoom = screen.getByRole("button", { name: "Ampliar gráfico" });
    // When se amplía
    fireEvent.click(zoom);
    // Then el diálogo abierto tiene su propio lienzo del mismo gráfico
    const dialog = screen.getByRole("dialog", { name: "Potencia PV1, ampliado" });
    expect(dialog).toHaveAttribute("open");
    expect(within(dialog).getByRole("img", { name: "Potencia PV1" })).toBeInTheDocument();
    // And al cerrarlo se desmonta el lienzo ampliado
    fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar" }));
    expect(dialog).not.toHaveAttribute("open");
    expect(screen.getAllByRole("img", { name: "Potencia PV1" })).toHaveLength(1);
  });
});
