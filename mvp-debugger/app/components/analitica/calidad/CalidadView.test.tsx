// Lo que protegen estas pruebas: los cuatro estados, que el vacío diga SIEMPRE
// por qué, y que la vista no pida lo que no está enseñando.
//
// En este producto el vacío es rutina (329 días de calendario sin una fila,
// cuatro meses de potencia AC en NULL), así que una pantalla en blanco sin
// explicación se lee como una aplicación rota y una tabla en cero MIENTE.
//
// Lo segundo es igual de concreto: `calidad/dias` pesa 221 KB y `arquitectura`
// 32 KB, y las dos viven en pestañas. Si alguien las devuelve a la carga inicial
// "para tenerlas listas", acá se rompe.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DAYS_WIRE,
  EMPTY_SUMMARY_WIRE,
  FINDINGS_WIRE,
  GLOSSARY_WIRE,
  SUMMARY_WIRE,
} from "@/app/components/analitica/calidad/fixtures";
import { failure } from "@/app/lib/analitica/errors";
import type { DateRange } from "@/app/lib/analitica/dateRange";

const { fetchMock, activeRange } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  activeRange: { current: null as DateRange | null },
}));

vi.mock("@/app/lib/analitica/client", () => ({ fetchAnalytics: fetchMock }));
vi.mock("@/app/lib/analitica/useDateRange", () => ({
  useDateRange: () => ({ range: activeRange.current }),
}));

const { CalidadView } = await import("@/app/components/analitica/calidad/CalidadView");

const IN_COVERAGE: DateRange = {
  from: "2025-09-01",
  toExclusive: "2026-06-02",
  granularity: "day",
};
const AFTER_COVERAGE: DateRange = {
  from: "2026-07-01",
  toExclusive: "2026-07-10",
  granularity: "day",
};

type WireRequest = {
  readonly path: string;
  readonly schema: { parse: (raw: unknown) => unknown };
};
type WirePayloads = Readonly<Record<string, unknown>>;

function serve(payloads: WirePayloads) {
  fetchMock.mockImplementation(async (request: WireRequest) => ({
    ok: true,
    data: request.schema.parse(payloads[request.path]),
  }));
}

const FULL_PAYLOADS: WirePayloads = {
  "calidad/resumen": SUMMARY_WIRE,
  "calidad/dias": DAYS_WIRE,
  arquitectura: GLOSSARY_WIRE,
  "calidad/hallazgos": FINDINGS_WIRE,
};

/** Qué rutas se pidieron, en orden, sin importar sus parámetros. */
function requestedPaths(): string[] {
  return fetchMock.mock.calls.map((call) => (call[0] as WireRequest).path);
}

beforeEach(() => {
  fetchMock.mockReset();
  activeRange.current = IN_COVERAGE;
});
afterEach(cleanup);

describe("CalidadView", () => {
  it("mientras espera lo dice, en vez de dejar la pantalla en blanco", () => {
    // Given las peticiones aún en vuelo
    fetchMock.mockImplementation(() => new Promise(() => {}));

    // When se pinta la vista
    render(<CalidadView />);

    // Then hay un aviso de carga y ningún veredicto
    expect(screen.getByRole("status")).toHaveTextContent(/cargando/i);
    expect(screen.queryByRole("region", { name: /Eje 1/ })).not.toBeInTheDocument();
  });

  it("al entrar pide SOLO lo que se ve, y en una sola tanda", async () => {
    // Given el período completo del histórico
    serve(FULL_PAYLOADS);

    // When se pinta la vista
    render(<CalidadView />);
    await screen.findByRole("region", { name: /Eje 1/ });

    // Then están los dos ejes, y ni los 221 KB de días ni el glosario salieron
    expect(screen.getByRole("region", { name: /Eje 2/ })).toBeInTheDocument();
    expect(requestedPaths()).toEqual(["calidad/resumen", "calidad/hallazgos"]);
  });

  it("los días se piden al abrir su pestaña, y una sola vez", async () => {
    // Given la vista ya pintada, sin haber tocado ninguna pestaña
    serve(FULL_PAYLOADS);
    render(<CalidadView />);
    await screen.findByRole("region", { name: /Eje 1/ });

    // When se abre "Día a día" y se vuelve a "Por variable"
    fireEvent.click(screen.getByRole("tab", { name: "Día a día" }));
    await screen.findByRole("list", { name: "Calidad del dato" });
    fireEvent.click(screen.getByRole("tab", { name: "Por variable" }));
    fireEvent.click(screen.getByRole("tab", { name: "Día a día" }));
    await screen.findByRole("list", { name: "Calidad del dato" });

    // Then salió una única lectura de días: volver a una pestaña ya vista no
    // puede costar otro viaje de 221 KB
    expect(requestedPaths().filter((path) => path === "calidad/dias")).toHaveLength(1);
  });

  it("«Qué está roto» trae el glosario que hasta entonces no hacía falta", async () => {
    // Given la vista pintada, con el glosario sin pedir
    serve(FULL_PAYLOADS);
    render(<CalidadView />);
    await screen.findByRole("region", { name: /Eje 1/ });

    // When se abre la pestaña que sí lo usa
    fireEvent.click(screen.getByRole("tab", { name: "Qué está roto" }));

    // Then llega y las 133 filas se explican con las palabras del servicio, en
    // vez de quedarse en "cargando" para siempre
    expect(
      await screen.findByText(/el inversor no se acopló a la red entre las 07:00/),
    ).toBeInTheDocument();
    expect(requestedPaths()).toContain("arquitectura");
  });

  it("un período sin ninguna fila se explica con el texto del servicio", async () => {
    // Given febrero de 2025, dentro del hueco de 126 días
    serve({ ...FULL_PAYLOADS, "calidad/resumen": EMPTY_SUMMARY_WIRE });

    // When se pinta la vista
    render(<CalidadView />);

    // Then el vacío llega con motivo, y no con una tabla de ceros
    expect(await screen.findByText(/el periodo no tiene datos/i)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /Eje 1/ })).not.toBeInTheDocument();
  });

  it("un fallo se anuncia y ofrece reintentar cuando reintentar sirve", async () => {
    // Given un servicio que agota el tiempo de espera
    fetchMock.mockResolvedValue({ ok: false, failure: failure("TIMEOUT") });

    // When se pinta la vista
    render(<CalidadView />);

    // Then hay alerta con el motivo y un botón de reintento
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/tardó demasiado/i);
    expect(screen.getByRole("button", { name: /reintentar/i })).toBeInTheDocument();
  });

  it("un rango fuera de la cobertura no se pregunta: se explica", () => {
    // Given julio de 2026, después de que el sistema dejara de reportar
    activeRange.current = AFTER_COVERAGE;
    serve(FULL_PAYLOADS);

    // When se pinta la vista
    render(<CalidadView />);

    // Then no se gasta ni una petición y se dice hasta dónde llega el dato
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/Fuera de la cobertura de la base/)).toBeInTheDocument();
  });
});
