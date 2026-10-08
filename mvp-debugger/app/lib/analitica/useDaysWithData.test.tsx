// Lo que protege: que el calendario sepa qué días tienen datos sin pedirlo dos
// veces, y que una falla o una base vacía nunca lo dejen sin poder elegir.
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetDaysWithDataCache, useDaysWithData } from "@/app/lib/analitica/useDaysWithData";

const DAYS_FIXTURE = {
  desde: "2026-05-20",
  hasta: "2026-05-26",
  n_dias: 3,
  dias: ["2026-05-20", "2026-05-21", "2026-05-25"],
  fuentes: { electrico: ["2026-05-20", "2026-05-21"], radiacion: ["2026-05-25"] },
};

function respondWith(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("useDaysWithData", () => {
  beforeEach(() => resetDaysWithDataCache());
  afterEach(() => vi.unstubAllGlobals());

  it("arranca cargando y termina con los días y los límites de la cobertura", async () => {
    // Given el endpoint responde con tres días
    const fetchMock = respondWith(DAYS_FIXTURE);
    // When se monta el hook
    const { result } = renderHook(() => useDaysWithData());
    // Then primero está cargando y luego tiene el conjunto de días
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    if (result.current.status !== "ready") throw new Error("estado inesperado");
    expect(result.current.days.has("2026-05-21")).toBe(true);
    expect(result.current.days.has("2026-05-22")).toBe(false);
    expect(result.current.bounds).toEqual({ from: "2026-05-20", toExclusive: "2026-05-26" });
    expect(fetchMock).toHaveBeenCalledWith("/api/historico/analitica/dias-con-datos", expect.anything());
  });

  it("dos formularios a la vez hacen una sola petición, y un montaje posterior no pide nada", async () => {
    const fetchMock = respondWith(DAYS_FIXTURE);
    const first = renderHook(() => useDaysWithData());
    renderHook(() => useDaysWithData());
    await waitFor(() => expect(first.result.current.status).toBe("ready"));
    // When se monta otro después de resolver / Then ya nace listo, sin pedir
    const later = renderHook(() => useDaysWithData());
    expect(later.result.current.status).toBe("ready");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("una base sin datos (desde y hasta en null) queda como «sin cobertura», no como error", async () => {
    respondWith({ desde: null, hasta: null, n_dias: 0, dias: [], fuentes: { electrico: [], radiacion: [] } });
    const { result } = renderHook(() => useDaysWithData());
    await waitFor(() => expect(result.current.status).toBe("empty"));
  });

  it("un error HTTP queda como error con código, y el próximo montaje reintenta", async () => {
    // Given el servicio responde 500
    const failing = respondWith({ detail: "boom" }, 500);
    const { result } = renderHook(() => useDaysWithData());
    await waitFor(() => expect(result.current.status).toBe("error"));
    if (result.current.status !== "error") throw new Error("estado inesperado");
    expect(result.current.failure.code).toBe("UPSTREAM_ERROR");
    expect(failing).toHaveBeenCalledTimes(1);
    // When el servicio vuelve y se monta otro formulario / Then vuelve a pedir
    respondWith(DAYS_FIXTURE);
    const retry = renderHook(() => useDaysWithData());
    await waitFor(() => expect(retry.result.current.status).toBe("ready"));
  });

  it("una respuesta que no cumple el contrato es un error, no una lista vacía", async () => {
    respondWith({ ...DAYS_FIXTURE, dias: ["2026-02-30"] });
    const { result } = renderHook(() => useDaysWithData());
    await waitFor(() => expect(result.current.status).toBe("error"));
    if (result.current.status !== "error") throw new Error("estado inesperado");
    expect(result.current.failure.code).toBe("MALFORMED_RESPONSE");
  });

  it("sin red queda como error de red", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    const { result } = renderHook(() => useDaysWithData());
    await waitFor(() => expect(result.current.status).toBe("error"));
    if (result.current.status !== "error") throw new Error("estado inesperado");
    expect(result.current.failure.code).toBe("NETWORK");
  });
});
