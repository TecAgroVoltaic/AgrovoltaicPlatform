// Lo que protegen estas pruebas: que la lista diga POR QUÉ está vacía, que un
// servicio caído no se confunda con «no hay alertas», y que filtros y ficha se
// escriban en la URL sin perder el rango.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ALERTS_PAGE_WIRE,
  ALERTS_SUMMARY_WIRE,
  EMPTY_ALERTS_PAGE_WIRE,
} from "@/app/lib/alertas/fixtures";
import { alertsPageSchema, alertsSummarySchema } from "@/app/lib/alertas/contracts";
import { failure } from "@/app/lib/analitica/errors";

const RANGE_SEARCH = "desde=2026-08-01&hasta=2026-09-01";
const navigation = vi.hoisted(() => ({
  search: "",
  push: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/alertas",
  useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
}));

const api = vi.hoisted(() => ({
  fetchAlertsPage: vi.fn(),
  fetchAlertsSummary: vi.fn(),
  fetchAlertDetail: vi.fn(),
  runAlertAction: vi.fn(),
}));
vi.mock("@/app/lib/alertas/client", () => api);

const { AlertasView } = await import("@/app/components/analitica/alertas/AlertasView");
const { SEARCH_DEBOUNCE_MS } = await import("@/app/components/analitica/alertas/SearchBox");

function lastPushedParams(): URLSearchParams {
  const url = String(navigation.push.mock.calls.at(-1)?.[0]);
  return new URL(url, "http://consola").searchParams;
}

beforeEach(() => {
  navigation.search = RANGE_SEARCH;
  navigation.push.mockReset();
  navigation.replace.mockReset();
  Object.values(api).forEach((mock) => mock.mockReset());
  api.fetchAlertsSummary.mockResolvedValue({ ok: true, data: alertsSummarySchema.parse(ALERTS_SUMMARY_WIRE) });
  api.fetchAlertsPage.mockResolvedValue({ ok: true, data: alertsPageSchema.parse(ALERTS_PAGE_WIRE) });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("AlertasView", () => {
  it("pinta una línea por alerta con gravedad, estado, variable, días y ocurrencias", async () => {
    // Given dos alertas abiertas en el rango
    // When se monta la vista
    render(<AlertasView />);

    // Then cada fila dice lo necesario para decidir si abrirla
    const row = await screen.findByRole("button", { name: /Inversor sin generar con sol pleno/ });
    expect(row).toHaveTextContent("Grave");
    expect(row).toHaveTextContent("Nueva");
    expect(row).toHaveTextContent("día entero");
    expect(row).toHaveTextContent("2026-08-26 a 2026-08-31");
    expect(row).toHaveTextContent("2 días");
    expect(screen.getByText(/1 a 2 de 23 alertas/)).toBeInTheDocument();
  });

  it("sin alertas abiertas lo dice así, y no como un fallo", async () => {
    // Given un rango sin alertas
    api.fetchAlertsPage.mockResolvedValue({ ok: true, data: alertsPageSchema.parse(EMPTY_ALERTS_PAGE_WIRE) });

    // When se monta la vista
    render(<AlertasView />);

    // Then el vacío tiene su motivo y no hay ningún aviso de error
    expect(await screen.findByText("No hay alertas abiertas en este rango.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("si el servicio no responde lo dice, y Reintentar vuelve a pedir", async () => {
    // Given un servicio caído la primera vez
    api.fetchAlertsPage
      .mockResolvedValueOnce({ ok: false, failure: failure("NETWORK") })
      .mockResolvedValueOnce({ ok: true, data: alertsPageSchema.parse(ALERTS_PAGE_WIRE) });
    render(<AlertasView />);
    const problem = await screen.findByRole("alert");
    expect(problem).toHaveTextContent("El servicio de alertas no respondió");

    // When se reintenta
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    // Then vuelve a pedir y aparece la lista
    expect(await screen.findByRole("button", { name: /Inversor sin generar/ })).toBeInTheDocument();
    expect(api.fetchAlertsPage).toHaveBeenCalledTimes(2);
  });

  it("filtrar escribe la URL, conserva el rango y vuelve a la primera página", async () => {
    // Given la página dos de la lista
    navigation.search = `${RANGE_SEARCH}&offset=20`;
    render(<AlertasView />);
    await screen.findByRole("button", { name: /Inversor sin generar/ });

    // When se filtra por gravedad
    fireEvent.change(screen.getByLabelText("Gravedad"), { target: { value: "critical" } });

    // Then la URL lleva el filtro y el rango, y no el desplazamiento viejo
    const params = lastPushedParams();
    expect(params.get("severidad")).toBe("grave");
    expect(params.get("desde")).toBe("2026-08-01");
    expect(params.has("offset")).toBe(false);
  });

  it("abrir una alerta deja su id en la URL para poder compartir la ficha", async () => {
    // Given la lista cargada
    render(<AlertasView />);
    const row = await screen.findByRole("button", { name: /Inversor sin generar/ });

    // When se abre la fila
    fireEvent.click(row);

    // Then la URL apunta a esa alerta
    expect(lastPushedParams().get("alerta")).toBe("41");
  });

  it("la búsqueda espera a que se deje de escribir y no llena el historial", async () => {
    // Given la vista cargada
    render(<AlertasView />);
    await screen.findByRole("button", { name: /Inversor sin generar/ });
    vi.useFakeTimers();

    // When se escribe una palabra de corrido
    const search = screen.getByLabelText("Buscar");
    fireEvent.change(search, { target: { value: "inv" } });
    fireEvent.change(search, { target: { value: "inversor" } });
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });

    // Then sale una sola escritura, con replace, y con la palabra completa
    expect(navigation.replace).toHaveBeenCalledTimes(1);
    expect(String(navigation.replace.mock.calls[0][0])).toContain("q=inversor");
    expect(navigation.push).not.toHaveBeenCalled();
  });
});
