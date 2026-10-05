// Lo que estas pruebas protegen: los cuatro estados de la Fig. 5, y sobre todo
// que el vacío diga CUÁL vacío es. Se ejercita la cadena entera (hook, cliente,
// esquema Zod y componente) contra payloads con la forma real del backend: un
// contrato que se rompa tiene que fallar acá y no en la pantalla de alguien.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VariableSeriesSection } from "@/app/components/analitica/series/VariableSeriesSection";
import type { CatalogVariable } from "@/app/lib/analitica/contracts/variables";
import type { DateRange } from "@/app/lib/analitica/dateRange";

vi.mock("@/app/components/charts/EChart", () => ({
  EChart: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="img" aria-label={ariaLabel} data-testid="lienzo" />
  ),
}));

const RANGE: DateRange = { from: "2026-05-01", toExclusive: "2026-06-02", granularity: "day" };

// Entradas del catálogo tal como las publica `GET /analitica/variables`.
function variable(overrides: Partial<CatalogVariable> = {}): CatalogVariable {
  return {
    key: "potencia_pv1_w",
    label: "Potencia PV1 (inclinado)",
    unit: "W",
    family: "electrico",
    from: null,
    until: null,
    innerGap: null,
    missingSource: null,
    plottable: true,
    ...overrides,
  };
}

const POWER = variable();
const REFLECTED = variable({
  key: "irradiancia_reflejada_wm2",
  label: "Irradiancia reflejada",
  unit: "W/m2",
  family: "radiacion",
  from: "2025-10-25",
});

type WirePoint = { t: string; valor: number | null };

function wireResponse(points: readonly WirePoint[], key = "potencia_pv1_w") {
  return {
    ventana: { desde: RANGE.from, hasta: RANGE.toExclusive, dias: 32, granularidad: "dia" },
    confianza: { dias_con_datos: 26 },
    buckets_media_movil: 7,
    series: [
      {
        clave: key,
        etiqueta: "Potencia PV1 (inclinado)",
        unidad: "W",
        relacion: "v_sc_electrico_corregido",
        n_con_dato: points.filter((point) => point.valor !== null).length,
        tendencia: {
          pendiente: { valor: 0.3762, n: 38, unidad: "W/dia" },
          intercepto: 260.3,
          r2: 0.0591,
        },
        puntos: points.map((point) => ({
          ...point,
          n: point.valor === null ? 0 : 42,
          minimo: null,
          maximo: null,
          desviacion: null,
          banda_inferior: null,
          banda_superior: null,
          media_movil: null,
          tendencia: 281.5,
        })),
      },
    ],
  };
}

function respondWith(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const fetchStub = vi.fn();

beforeEach(() => vi.stubGlobal("fetch", fetchStub));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("VariableSeriesSection", () => {
  it("mientras la petición viaja lo dice, en vez de mostrar un lienzo vacío", () => {
    // Given una petición que todavía no volvió
    fetchStub.mockReturnValue(new Promise(() => {}));

    // When se pinta la sección
    render(<VariableSeriesSection range={RANGE} variable={POWER} />);

    // Then hay aviso de carga y no hay gráfico que interpretar
    expect(screen.getByRole("status")).toHaveTextContent(/cargando/i);
    expect(screen.queryByTestId("lienzo")).not.toBeInTheDocument();
  });

  it("un fallo del servicio se anuncia y se puede reintentar", async () => {
    // Given un servicio que responde 500
    fetchStub.mockImplementation(() => respondWith({ detail: "se cayó la consulta" }, 500));
    render(<VariableSeriesSection range={RANGE} variable={POWER} />);
    await screen.findByRole("alert");

    // When se pulsa reintentar
    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }));

    // Then el error se leyó como alerta y la consulta se repitió
    await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("alert")).toHaveTextContent(/se cayó la consulta/i);
  });

  it("un rechazo por ventana demasiado fina se explica y NO ofrece reintentar", async () => {
    // Given el 422 real del servicio cuando el rango por hora pasa del techo
    fetchStub.mockImplementation(() =>
      respondWith(
        {
          detail: "569 dias por hora pasan del techo de 1500 puntos; usa una granularidad mas gruesa",
          codigo: "ventana_demasiado_fina",
        },
        422,
      ),
    );

    // When se pinta la sección
    render(<VariableSeriesSection range={RANGE} variable={POWER} />);

    // Then se lee qué hacer, y no hay botón que repita el mismo rechazo
    expect(await screen.findByRole("alert")).toHaveTextContent(/granularidad mas gruesa/i);
    expect(screen.queryByRole("button", { name: /reintentar/i })).not.toBeInTheDocument();
  });

  it("una variable que no existía en el rango NO se pide, y el vacío lo explica", async () => {
    // Given la irradiancia reflejada (desde el 2025-10-25) y un rango de 2025-01
    const before: DateRange = { from: "2025-01-01", toExclusive: "2025-02-01", granularity: "day" };

    // When se pinta la sección
    render(<VariableSeriesSection range={before} variable={REFLECTED} />);

    // Then se explica que nunca coexistieron y no se gastó ni una petición
    expect(await screen.findByText(/nunca coexistieron/i)).toBeInTheDocument();
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("la variable existía pero no hubo ni una lectura: eso es otro vacío", async () => {
    // Given un rango en que todos los tramos vuelven en null
    fetchStub.mockImplementation(() =>
      respondWith(wireResponse([{ t: "2026-05-01T00:00", valor: null }])),
    );

    // When se pinta la sección
    render(<VariableSeriesSection range={RANGE} variable={POWER} />);

    // Then el mensaje separa «no hubo lecturas» de «la variable no existía»
    expect(await screen.findByText(/no hay ni una lectura suya/i)).toBeInTheDocument();
    expect(screen.queryByText(/nunca coexistieron/i)).not.toBeInTheDocument();
  });

  it("el hueco interior se avisa aunque la curva se vea entera", async () => {
    // Given la energía DC del contador, con cuatro meses en blanco EN MEDIO, y un
    // rango donde sí hay datos
    const meter = variable({
      key: "energia_pv1_wh",
      label: "Energía DC del día, Inclinado",
      unit: "kWh",
      innerGap: "solo 144 dias con dato, y NI UNO entre 2025-11 y 2026-02",
    });
    fetchStub.mockImplementation(() =>
      respondWith(wireResponse([{ t: "2026-05-01T00:00", valor: 4.2 }], meter.key)),
    );

    // When se pinta la sección
    render(<VariableSeriesSection range={RANGE} variable={meter} />);

    // Then se dibuja Y el aviso sigue ahí: `dato_desde`/`dato_hasta` no pueden
    // expresar un agujero interior, y una curva entera no lo delata sola
    expect(await screen.findByTestId("lienzo")).toBeInTheDocument();
    expect(screen.getByText(/NI UNO entre 2025-11 y 2026-02/)).toBeInTheDocument();
  });

  it("con datos dibuja, y el pie dice cuántos tramos quedaron huecos", async () => {
    // Given una serie con un tramo medido y otro vacío en medio
    fetchStub.mockImplementation(() =>
      respondWith(
        wireResponse([
          { t: "2026-05-01T00:00", valor: 205.9 },
          { t: "2026-05-02T00:00", valor: null },
          { t: "2026-05-03T00:00", valor: 318.4 },
        ]),
      ),
    );

    // When se pinta la sección
    render(<VariableSeriesSection range={RANGE} variable={POWER} />);

    // Then hay gráfico y el pie declara los huecos en vez de disimularlos
    expect(await screen.findByTestId("lienzo")).toBeInTheDocument();
    expect(screen.getByText(/2 de 3 tramos con medición/)).toBeInTheDocument();
  });
});
