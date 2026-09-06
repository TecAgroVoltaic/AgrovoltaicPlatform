// Lo que protegen estas pruebas: que la primera página NO se vuelva a pedir
// (sería una cascada disfrazada), que un filtro sin resultados diga por qué está
// vacío, y que cambiar de filtro VUELVA a la primera página.
//
// Lo último no es cosmética: con 28.509 hallazgos, conservar el desplazamiento
// al filtrar deja a la persona en la página nueve de un resultado de tres,
// mirando un vacío que parece un fallo de la aplicación.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DAYS_WIRE, FINDINGS_WIRE } from "@/app/components/analitica/calidad/fixtures";
import type { FindingsQuery } from "@/app/components/analitica/calidad/useFindingsQuery";
import type { DateRange } from "@/app/lib/analitica/dateRange";
import {
  findingsPageSchema,
  qualityDaysSchema,
} from "@/app/lib/analitica/contracts/calidad";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock("@/app/lib/analitica/client", () => ({ fetchAnalytics: fetchMock }));

const { FindingsBrowser } = await import("@/app/components/analitica/calidad/FindingsBrowser");
const { FIRST_QUERY } = await import("@/app/components/analitica/calidad/useFindingsQuery");

const RANGE: DateRange = { from: "2025-09-01", toExclusive: "2026-06-02", granularity: "day" };
const days = qualityDaysSchema.parse(DAYS_WIRE);
const firstPage = findingsPageSchema.parse(FINDINGS_WIRE);

function Harness({ knownDays = days }: { readonly knownDays?: typeof days }) {
  const [query, setQuery] = useState<FindingsQuery>(FIRST_QUERY);
  return (
    <FindingsBrowser
      range={RANGE}
      firstPage={firstPage}
      days={knownDays}
      query={query}
      onQueryChange={setQuery}
    />
  );
}

/** Página vacía o llena, con la paginación que publica el servicio. */
function pageOf(overrides: Record<string, unknown>) {
  return { ...FINDINGS_WIRE, ...overrides };
}

// Con cuerpo de bloque a propósito: `beforeEach` toma una función devuelta como
// desmontaje y la ejecutaría sin argumentos, o sea llamaría al propio mock.
beforeEach(() => {
  fetchMock.mockReset();
});
afterEach(cleanup);

describe("FindingsBrowser", () => {
  it("la primera página ya vino con la carga única: no se vuelve a pedir", () => {
    // Given la página que llegó con el resto de la vista
    render(<Harness />);

    // When se pinta sin tocar ningún filtro
    // Then no sale ni una petición más
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getAllByText(/1 a 1 de 26.023 hallazgos/).length).toBeGreaterThan(0);
  });

  it("filtrar sin resultados explica el vacío en vez de quedarse mudo", async () => {
    // Given un filtro de gravedad que el período no tiene
    fetchMock.mockImplementation(
      async ({ schema }: { schema: { parse: (raw: unknown) => unknown } }) => ({
        ok: true,
        data: schema.parse(
          pageOf({
            total: 0,
            devueltos: 0,
            truncado: false,
            pagina: { offset: 0, limite: 50, hay_mas: false, siguiente_offset: null },
            hallazgos: [],
          }),
        ),
      }),
    );
    render(<Harness />);

    // When se elige "Informativo"
    fireEvent.change(screen.getByLabelText("Gravedad"), { target: { value: "info" } });

    // Then hay una petición con ese filtro y el vacío llega con motivo
    expect(await screen.findByText(/Ningún hallazgo coincide con los filtros/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0].query).toMatchObject({ severidad: "info" });
  });

  it("pasar de página pide el desplazamiento que dictó el servicio", async () => {
    // Given una primera página que dice `siguiente_offset: 50`
    fetchMock.mockImplementation(
      async ({ schema }: { schema: { parse: (raw: unknown) => unknown } }) => ({
        ok: true,
        data: schema.parse(
          pageOf({
            pagina: { offset: 50, limite: 50, hay_mas: false, siguiente_offset: null },
          }),
        ),
      }),
    );
    render(<Harness />);

    // When se pulsa "Siguientes"
    fireEvent.click(screen.getAllByRole("button", { name: /Siguientes/ })[0]);

    // Then se pide ESE desplazamiento, no uno calculado acá
    await screen.findAllByText(/51 a 51 de/);
    expect(fetchMock.mock.calls[0][0].query).toMatchObject({ offset: "50", limite: "50" });
  });

  it("filtrar después de avanzar vuelve a la primera página", async () => {
    // Given que ya se avanzó a la página dos
    fetchMock.mockImplementation(
      async ({ schema }: { schema: { parse: (raw: unknown) => unknown } }) => ({
        ok: true,
        data: schema.parse(
          pageOf({ pagina: { offset: 50, limite: 50, hay_mas: true, siguiente_offset: 100 } }),
        ),
      }),
    );
    render(<Harness />);
    fireEvent.click(screen.getAllByRole("button", { name: /Siguientes/ })[0]);
    await screen.findAllByText(/51 a 51 de/);

    // When se cambia la gravedad
    fireEvent.change(screen.getByLabelText("Gravedad"), { target: { value: "critical" } });

    // Then la consulta nueva arranca en 0: quedarse en 50 mostraría un vacío falso
    await screen.findAllByText(/51 a 51 de/);
    const last = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0];
    expect(last.query).toMatchObject({ offset: "0", severidad: "grave" });
  });

  it("mientras los días no llegan, su filtro se ve deshabilitado y dice por qué", () => {
    // Given los días, que son una lectura aparte y todavía en vuelo
    render(<Harness knownDays={[]} />);

    // When se mira el filtro por día
    const dayFilter = screen.getByLabelText("Día evaluado");

    // Then está deshabilitado con su motivo: una lista vacía se leería como
    // "este período no tiene días"
    expect(dayFilter).toBeDisabled();
    expect(dayFilter).toHaveTextContent(/todavía no llegaron/);
  });
});
