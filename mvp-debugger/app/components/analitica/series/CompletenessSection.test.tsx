// Lo que estas pruebas protegen: que la Fig. 4 no se pueda leer sin su cadencia,
// y que un hueco de 125 días quede escrito y no solo insinuado por una zona en
// blanco de dos centímetros de eje. Se valida el payload REAL con el esquema
// real: si el backend cambia un nombre de campo, falla acá.
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CompletenessSection } from "@/app/components/analitica/series/CompletenessSection";
import type { DateRange } from "@/app/lib/analitica/dateRange";

vi.mock("@/app/components/charts/EChart", () => ({
  EChart: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="img" aria-label={ariaLabel} data-testid="lienzo" />
  ),
}));

const RANGE: DateRange = { from: "2024-11-10", toExclusive: "2026-06-02", granularity: "month" };
const LONGEST_GAP = { desde: "2024-12-30", hasta: "2025-05-03", dias: 125 };

function sourcePayload(cadence: number, gaps: readonly unknown[]) {
  return {
    cadencia_seg: cadence,
    cadencia_origen: "medida",
    dias_calendario: 569,
    dias_con_datos: 274,
    lecturas: 36469,
    lecturas_esperadas: 84000,
    completitud: 0.434,
    tramos_sin_datos: gaps,
  };
}

const WIRE_RESPONSE = {
  ventana: { desde: RANGE.from, hasta: RANGE.toExclusive, dias: 569, granularidad: "mes" },
  confianza: { dias_con_datos: 274 },
  granularidad_serie: "mes",
  granularidad_degradada: false,
  series: {
    electrico: [
      { periodo: "2024-11-01", lecturas: 174, esperadas: 4000, cadencia_seg: 300, cadencia_origen: "medida" },
      { periodo: "2025-01-01", lecturas: 0, esperadas: 4400, cadencia_seg: 300, cadencia_origen: "nominal" },
    ],
    radiacion: [
      { periodo: "2024-11-01", lecturas: 900, esperadas: 80000, cadencia_seg: 15, cadencia_origen: "medida" },
      { periodo: "2025-01-01", lecturas: 0, esperadas: 88000, cadencia_seg: 15, cadencia_origen: "nominal" },
    ],
  },
  resumen: {
    electrico: sourcePayload(300, [LONGEST_GAP, { desde: "2025-06-27", hasta: "2025-09-04", dias: 70 }]),
    radiacion: sourcePayload(15, [LONGEST_GAP]),
  },
  nota: "lo esperado se mide contra la cadencia REAL del período.",
};

const fetchStub = vi.fn();

beforeEach(() => vi.stubGlobal("fetch", fetchStub));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("CompletenessSection", () => {
  it("cada fuente trae la cadencia con que se midió lo esperado", async () => {
    // Given la respuesta real, con lo eléctrico a 300 s y la radiación a 15 s
    fetchStub.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(WIRE_RESPONSE), { status: 200 })),
    );

    // When se pinta la sección
    render(<CompletenessSection range={RANGE} />);

    // Then hay un gráfico por fuente y cada uno declara SU cadencia: sin eso, dos
    // completitudes iguales podrían medir contra objetivos veinte veces distintos
    expect(await screen.findByRole("img", { name: /inversor/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /piran/i })).toBeInTheDocument();
    expect(screen.getByText(/cada 300 s/)).toBeInTheDocument();
    expect(screen.getByText(/cada 15 s/)).toBeInTheDocument();
  });

  it("los tramos sin ninguna fila se escriben, del más largo al más corto", async () => {
    // Given un período que contiene el hueco de 125 días de enero a mayo de 2025
    fetchStub.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(WIRE_RESPONSE), { status: 200 })),
    );

    // When se pinta la sección
    render(<CompletenessSection range={RANGE} />);

    // Then el hueco aparece con sus fechas y su tamaño, encabezando la lista
    const gaps = await screen.findAllByText(/del 2024-12-30 al 2025-05-03 · 125 días/);
    expect(gaps.length).toBeGreaterThan(0);
    const list = screen.getByLabelText(/Tramos sin datos de Eléctrico/i);
    expect(list.firstElementChild).toHaveTextContent("125 días");
  });

  it("la nota metodológica del servicio no se pierde: vive tras el pliegue", async () => {
    // Given la respuesta real, que trae la nota de cómo se mide lo esperado
    fetchStub.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(WIRE_RESPONSE), { status: 200 })),
    );

    // When se pinta la sección
    render(<CompletenessSection range={RANGE} />);

    // Then la nota sigue en la página, dentro de un <details>: es correcta y
    // alguien la va a necesitar, pero es método y no va en medio de la lectura
    const summary = await screen.findByText("Cómo se mide lo esperado");
    expect(summary.tagName).toBe("SUMMARY");
    expect(screen.getByText(WIRE_RESPONSE.nota)).toBeInTheDocument();
  });

  it("una cadencia caída a la nominal se avisa VISIBLE, no dentro del pliegue", async () => {
    // Given una fuente cuyo tramo no tenía ni una fila con la que medir la cadencia
    const body = structuredClone(WIRE_RESPONSE);
    body.resumen.electrico.cadencia_origen = "nominal";
    fetchStub.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(body), { status: 200 })),
    );

    // When se pinta la sección
    render(<CompletenessSection range={RANGE} />);

    // Then el pie lo dice sin abrir nada: cambia lo que significa cada barra
    expect(await screen.findByText(/cadencia NOMINAL/)).toBeInTheDocument();
    expect(screen.getByText(/ni una fila con la que medirla/)).toBeInTheDocument();
  });

  it("si el servicio falla lo dice, en vez de mostrar una completitud vacía", async () => {
    // Given un servicio que responde 500
    fetchStub.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ detail: "consulta rota" }), { status: 500 })),
    );

    // When se pinta la sección
    render(<CompletenessSection range={RANGE} />);

    // Then se lee como alerta y no queda ningún gráfico que interpretar
    expect(await screen.findByRole("alert")).toHaveTextContent(/consulta rota/i);
    expect(screen.queryByTestId("lienzo")).not.toBeInTheDocument();
  });
});
