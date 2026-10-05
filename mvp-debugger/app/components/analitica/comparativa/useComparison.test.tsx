// Lo que estas pruebas protegen: el peso de la primera pantalla.
//
// El renglón día a día con su anexo pesa más de diez veces que las otras dos
// respuestas juntas. Si alguna vez se colara en la carga inicial nadie lo
// notaría mirando la pantalla (se ve igual), solo la red: por eso la garantía
// se afirma acá y no a ojo.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useComparison } from "@/app/components/analitica/comparativa/useComparison";
import {
  comparisonWire,
  performanceWire,
} from "@/app/components/analitica/comparativa/fixtures";
import type { DateRange } from "@/app/lib/analitica/dateRange";

const RANGE: DateRange = {
  from: "2025-09-01",
  toExclusive: "2026-06-02",
  granularity: "week",
};

const INITIAL_REQUESTS = 2;
const WITH_DETAIL_REQUESTS = 3;

function Probe() {
  const { comparison, report, detail, requestDetail } = useComparison(RANGE);
  return (
    <>
      <button type="button" onClick={requestDetail}>
        Cargar el detalle
      </button>
      <p data-testid="estado">
        {[comparison, report, detail].map((result) => (result ? "1" : "0")).join("")}
      </p>
    </>
  );
}

const fetchStub = vi.fn();

function bodyFor(url: string): unknown {
  return url.includes("comparativa") ? comparisonWire() : performanceWire();
}

beforeEach(() => {
  fetchStub.mockImplementation((url: string) =>
    Promise.resolve(new Response(JSON.stringify(bodyFor(url)), { status: 200 })),
  );
  vi.stubGlobal("fetch", fetchStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("useComparison", () => {
  it("la carga inicial pide dos respuestas y ninguna trae el detalle diario", async () => {
    // Given la vista recién abierta
    render(<Probe />);

    // When terminan las consultas de la primera pantalla
    await screen.findByText("110");

    // Then salieron las dos juntas y ninguna pidió el renglón día a día
    expect(fetchStub).toHaveBeenCalledTimes(INITIAL_REQUESTS);
    const urls = fetchStub.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.includes("analitica/comparativa"))).toBe(true);
    expect(urls.some((url) => url.includes("analitica/rendimiento"))).toBe(true);
    expect(urls.every((url) => !url.includes("detalle"))).toBe(true);
  });

  it("el detalle diario sale solo cuando alguien lo pide", async () => {
    // Given la primera pantalla ya cargada
    render(<Probe />);
    await screen.findByText("110");

    // When se pide el detalle
    fireEvent.click(screen.getByRole("button", { name: "Cargar el detalle" }));

    // Then recién ahí sale la tercera consulta, y es la pesada
    await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(WITH_DETAIL_REQUESTS));
    expect(String(fetchStub.mock.calls[WITH_DETAIL_REQUESTS - 1][0])).toContain("detalle=true");
    await screen.findByText("111");
  });
});
