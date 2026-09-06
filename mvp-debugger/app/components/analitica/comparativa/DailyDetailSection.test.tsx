// Lo que estas pruebas protegen: que el anexo pesado no viaje solo, y que
// cuando viaja explique por qué cada día quedó fuera.
//
// Los 31 días descartados no son un detalle de auditoría: son la diferencia
// entre 228 días con dato y los 197 con que se calcula el PR. Sin su motivo, el
// número parece salir de todo el período.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DailyDetailSection } from "@/app/components/analitica/comparativa/DailyDetailSection";
import { performanceReport } from "@/app/components/analitica/comparativa/fixtures";

vi.mock("@/app/components/charts/EChart", () => ({
  EChart: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="img" aria-label={ariaLabel} data-testid="lienzo" />
  ),
}));

const DETAILED_REPORT = () =>
  performanceReport({
    por_dia: [
      {
        dia: "2025-09-05",
        valido: true,
        pr: {
          por_fuente: {
            contador: { inclinado: 0.897, vertical: 0.698 },
            integral: { inclinado: 0.938, vertical: 0.75 },
          },
        },
      },
    ],
    dias: {
      con_dato: 228,
      validos: 197,
      descartados: 31,
      detalle_descartados: [
        {
          dia: "2025-09-22",
          motivos_descarte: ["cobertura_insuficiente", "desfase_excesivo"],
          cobertura_radiacion: 0.241,
          cobertura_electrico: 0.502,
          desfase_h: 3.167,
        },
      ],
    },
  });

describe("DailyDetailSection", () => {
  it("no trae nada hasta que se lo piden", () => {
    // Given la vista recién abierta
    render(
      <DailyDetailSection
        result={null}
        requested={false}
        onRequest={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    // When se mira la sección
    // Then solo hay una invitación a cargarlo, y ningún gráfico
    expect(screen.getByRole("button", { name: "Cargar el detalle diario" })).toBeInTheDocument();
    expect(screen.queryByTestId("lienzo")).not.toBeInTheDocument();
  });

  it("el botón pide el detalle una sola vez", () => {
    // Given la sección sin pedir
    const onRequest = vi.fn();
    render(
      <DailyDetailSection result={null} requested={false} onRequest={onRequest} onRetry={vi.fn()} />,
    );

    // When se pulsa el botón
    fireEvent.click(screen.getByRole("button", { name: "Cargar el detalle diario" }));

    // Then se avisa al hook, que es quien decide cuándo consultar
    expect(onRequest).toHaveBeenCalledTimes(1);
  });

  it("con el detalle cargado, cada día descartado trae su motivo", () => {
    // Given el anexo del backend
    render(
      <DailyDetailSection
        result={{ ok: true, data: DETAILED_REPORT() }}
        requested
        onRequest={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    // When se lee la tabla de descartados
    // Then el día aparece con sus dos motivos y su desfase, en prosa
    expect(screen.getByText("2025-09-22")).toBeInTheDocument();
    expect(
      screen.getByText("cobertura insuficiente, desfase entre radiación y eléctrico"),
    ).toBeInTheDocument();
    expect(screen.getByText("3,17")).toBeInTheDocument();
    expect(screen.getByText(/228 días con dato, 197 días válidos, 31 días fuera/)).toBeInTheDocument();
  });

  it("mientras el detalle viene en camino, lo dice", () => {
    // Given el detalle ya pedido pero todavía en vuelo
    render(
      <DailyDetailSection result={null} requested onRequest={vi.fn()} onRetry={vi.fn()} />,
    );

    // When se mira la sección
    // Then hay estado de carga y ningún lienzo a medio dibujar
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("lienzo")).not.toBeInTheDocument();
  });
});
