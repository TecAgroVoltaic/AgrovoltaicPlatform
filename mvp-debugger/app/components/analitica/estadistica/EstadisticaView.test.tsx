// Lo que estas pruebas protegen: el cableado de la vista.
//
// Dos cosas que no se ven mirando un gráfico suelto: que las cinco consultas
// salgan JUNTAS (en cascada la pantalla tardaría ocho segundos en vez de dos), y
// que una caída no arrastre a las demás (cuatro figuras buenas no se pierden
// porque la quinta falle).
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EstadisticaView } from "@/app/components/analitica/estadistica/EstadisticaView";
import type { AnalyticsRequest } from "@/app/lib/analitica/client";
import type { AnalyticsFailure } from "@/app/lib/analitica/errors";
import type { DateRange } from "@/app/lib/analitica/dateRange";

type Request = AnalyticsRequest<unknown>;

// El mock va tipado: sin tipo, `mock.calls` es `any[][]` y las afirmaciones
// sobre la query pasarían aunque el campo se llamara de otra forma.
const { fetchAnalytics } = vi.hoisted(() => ({
  fetchAnalytics: vi.fn<(request: Request) => Promise<unknown>>(),
}));

vi.mock("@/app/lib/analitica/client", () => ({ fetchAnalytics }));

const RANGE: DateRange = { from: "2025-09-01", toExclusive: "2026-06-02", granularity: "month" };

// El rango sale como objeto NUEVO en cada render, igual que lo haría cualquier
// llamador descuidado: si el hook dependiera de la identidad del objeto en vez de
// sus valores, esta vista consultaría sin parar y no pintaría nunca. No lo
// estabilices: esa inestabilidad es parte de lo que se está probando.
vi.mock("@/app/lib/analitica/useDateRange", () => ({
  useDateRange: () => ({
    range: { from: "2025-09-01", toExclusive: "2026-06-02", granularity: "month" },
    parse: { outcome: "parsed", range: RANGE },
    setRange: vi.fn(),
  }),
}));

vi.mock("@/app/components/charts/EChart", () => ({
  EChart: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="img" aria-label={ariaLabel} data-testid="lienzo" />
  ),
}));

const EXPECTED_PATHS = [
  "analitica/distribucion",
  "analitica/irradiacion",
  "analitica/crestas",
  "analitica/correlacion",
  "analitica/carpeta",
];

const NETWORK_FAILURE: AnalyticsFailure = {
  code: "NETWORK",
  message: "no se pudo contactar al servidor",
};
const TIMEOUT_FAILURE: AnalyticsFailure = {
  code: "TIMEOUT",
  message: "el servidor tardó demasiado en responder",
};

function requestedPaths(): string[] {
  return fetchAnalytics.mock.calls.map(([request]) => request.path);
}

/** La ÚLTIMA consulta a esa ruta: tras cambiar de foco, la vigente es esa. */
function requestFor(path: string): Request | undefined {
  return fetchAnalytics.mock.calls
    .map(([request]) => request)
    .filter((request) => request.path === path)
    .pop();
}

const FIGURE_SELECTOR = "figure.gr";
/** El punto de corte de globals.css: mira la VENTANA, que no sabe cuánto ancho
 *  se llevó la barra lateral. Esta vista mide su propia rejilla en su lugar. */
const VIEWPORT_BREAKPOINT_SELECTOR = ".gr-2";
const FIGURES_PER_BLOCK = [2, 2, 1];

/** Cuántas figuras trae cada bloque de primer nivel de la vista. Un bloque que
 *  ES la figura (la que ocupa la fila entera) cuenta como una. */
function figuresPerBlock(container: HTMLElement): number[] {
  return [...container.children]
    .map((block) =>
      block.matches(FIGURE_SELECTOR) ? 1 : block.querySelectorAll(FIGURE_SELECTOR).length,
    )
    .filter((count) => count > 0);
}

describe("EstadisticaView", () => {
  // Sin esto, las consultas de una prueba se cuentan en la siguiente y el orden
  // de ejecución decidiría el resultado. Con cuerpo de bloque a propósito: si
  // devolviera el mock, vitest lo tomaría por una función de limpieza.
  beforeEach(() => {
    fetchAnalytics.mockReset();
  });

  it("pide las cinco fuentes de una vez, sin encadenarlas", () => {
    // Given cinco consultas que todavía no responden
    fetchAnalytics.mockReturnValue(new Promise(() => {}));

    // When se abre la vista
    render(<EstadisticaView />);

    // Then las cinco ya salieron: ninguna esperó a la anterior
    expect(requestedPaths()).toEqual(EXPECTED_PATHS);
  });

  // Medido el 2026-09-01 con la barra lateral desplegada: a 1100 px de ventana
  // el punto de corte de globals daba dos columnas de 351 px de lienzo, y con la
  // barra plegada 437 px. La misma ventana, dos figuras distintas. Por eso el
  // reparto se decide por el ancho de la rejilla y no por el de la ventana.
  it("reparte las figuras de a dos y deja la carpeta sola, sin el corte de ventana", () => {
    // Given cinco consultas que todavía no responden
    fetchAnalytics.mockReturnValue(new Promise(() => {}));

    // When se abre la vista
    const { container } = render(<EstadisticaView />);

    // Then las cuatro comparables van en pares y la carpeta ocupa su fila entera
    expect(figuresPerBlock(container)).toEqual(FIGURES_PER_BLOCK);
    // Y ninguna rejilla queda atada al ancho de la ventana
    expect(container.querySelector(VIEWPORT_BREAKPOINT_SELECTOR)).toBeNull();
  });

  it("una fuente caída no se lleva puestas a las otras", async () => {
    // Given cuatro consultas que fallan y el mapa de calor que también
    fetchAnalytics.mockImplementation(async ({ path }) => ({
      ok: false,
      failure: path === "analitica/carpeta" ? TIMEOUT_FAILURE : NETWORK_FAILURE,
    }));

    // When se abre la vista
    render(<EstadisticaView />);

    // Then cada figura anuncia SU fallo por separado, y siguen siendo cinco
    const alerts = await screen.findAllByRole("alert");
    expect(alerts).toHaveLength(EXPECTED_PATHS.length);
    expect(screen.getByText(/tardó demasiado/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /reintentar/i })).toHaveLength(
      EXPECTED_PATHS.length,
    );
  });

  it("cambiar la variable en foco vuelve a pedir su distribución y su carpeta", async () => {
    // Given la vista abierta con la potencia del Inclinado en foco
    fetchAnalytics.mockReturnValue(new Promise(() => {}));
    render(<EstadisticaView />);
    expect(requestFor("analitica/distribucion")?.query).toEqual({ variable: "potencia_pv1_w" });

    // When se elige el albedo
    fireEvent.click(screen.getByRole("button", { name: "Albedo" }));

    // Then las dos figuras que siguen al foco se piden con la nueva clave
    await waitFor(() => {
      expect(requestFor("analitica/distribucion")?.query).toEqual({ variable: "albedo" });
    });
    expect(requestFor("analitica/carpeta")?.query).toEqual({ variable: "albedo" });
    // Y la irradiancia mensual sigue siendo la incidente: no depende del foco.
    expect(requestFor("analitica/irradiacion")?.query).toEqual({
      variable: "irradiancia_incidente_wm2",
    });
  });

  it("con la irradiancia en foco, la dispersión no la enfrenta consigo misma", () => {
    // Given la vista abierta
    fetchAnalytics.mockReturnValue(new Promise(() => {}));
    render(<EstadisticaView />);

    // When se pone la irradiancia incidente en foco
    fireEvent.click(screen.getByRole("button", { name: "Irradiancia incidente" }));

    // Then el eje Y de la dispersión cae a la potencia del Inclinado
    expect(requestFor("analitica/correlacion")?.query).toEqual({
      x: "irradiancia_incidente_wm2",
      y: "potencia_pv1_w",
    });
  });
});
