// Lo que estas pruebas protegen: que un gráfico NUNCA se quede mudo. Carga,
// error y vacío tienen que decir qué pasa, y el vacío tiene que decir por qué.
// Con 329 días de calendario sin una sola fila, el vacío es rutina, y un lienzo
// en blanco sin explicación se lee como una aplicación rota.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TimeSeriesChart } from "@/app/components/charts/TimeSeriesChart";
import { emptyChart, errorChart, loadingChart, readyChart } from "@/app/components/charts/state";
import type { TimeSeriesData } from "@/app/components/charts/options/timeSeries";

// El lienzo de ECharts necesita canvas, que jsdom no tiene. Se sustituye por su
// marcador: lo que se prueba acá es qué decide pintar el marco, no cómo dibuja
// ECharts. El envoltorio real se ejercita en el navegador.
vi.mock("@/app/components/charts/EChart", () => ({
  EChart: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="img" aria-label={ariaLabel} data-testid="lienzo" />
  ),
}));

const TITLE = "Potencia PV1";

function serie(values: (number | null)[]): TimeSeriesData {
  return {
    unit: "W",
    lines: [
      {
        id: "pv1",
        label: "PV1",
        points: values.map((value, index) => ({
          timestamp: `2026-05-0${index + 1}T00:00:00+00:00`,
          value,
        })),
      },
    ],
  };
}

describe("TimeSeriesChart", () => {
  it("mientras carga lo dice, en vez de mostrar un hueco", () => {
    // Given una consulta en vuelo
    render(<TimeSeriesChart title={TITLE} state={loadingChart()} />);

    // When se mira la pantalla
    // Then hay un aviso de carga y ningún lienzo
    expect(screen.getByRole("status")).toHaveTextContent(/cargando/i);
    expect(screen.queryByTestId("lienzo")).not.toBeInTheDocument();
  });

  it("un fallo se anuncia y ofrece reintentar cuando hay algo que reintentar", () => {
    // Given una consulta que falló y un reintento disponible
    const retry = vi.fn();
    render(
      <TimeSeriesChart
        title={TITLE}
        state={errorChart("el servidor tardó demasiado en responder", retry)}
      />,
    );

    // When se pulsa el botón
    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));

    // Then el mensaje se leyó como alerta y el reintento se disparó
    expect(screen.getByRole("alert")).toHaveTextContent(/tardó demasiado/);
    expect(retry).toHaveBeenCalledOnce();
  });

  it("un vacío declarado explica su motivo", () => {
    // Given un rango fuera de la cobertura de la base
    render(
      <TimeSeriesChart
        title={TITLE}
        state={emptyChart("OUT_OF_COVERAGE", { hint: "Probá con mayo de 2026." })}
      />,
    );

    // When se mira la pantalla
    // Then aparece el motivo y la pista, y no hay lienzo que interpretar
    expect(screen.getByText(/fuera de la cobertura/i)).toBeInTheDocument();
    expect(screen.getByText(/probá con mayo/i)).toBeInTheDocument();
    expect(screen.queryByTestId("lienzo")).not.toBeInTheDocument();
  });

  it("con datos que existen pero son todos nulos NO dibuja: explica que están vacíos", () => {
    // Given la respuesta real de los cuatro meses con la potencia AC en NULL
    render(<TimeSeriesChart title={TITLE} state={readyChart(serie([null, null, null]))} />);

    // When se mira la pantalla
    // Then dice que todas las lecturas son nulas, y no pinta una línea en cero
    expect(screen.getByText(/todas las lecturas de esta variable son nulas/i)).toBeInTheDocument();
    expect(screen.queryByTestId("lienzo")).not.toBeInTheDocument();
  });

  it("un solo valor medido ya es motivo para dibujar, aunque sea cero", () => {
    // Given una serie con un cero medido de verdad (de noche) y el resto nulo
    render(<TimeSeriesChart title={TITLE} state={readyChart(serie([null, 0, null]))} />);

    // When se mira la pantalla
    // Then se dibuja: un cero medido es un dato, no una ausencia
    expect(screen.getByTestId("lienzo")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: TITLE })).toBeInTheDocument();
  });
});
