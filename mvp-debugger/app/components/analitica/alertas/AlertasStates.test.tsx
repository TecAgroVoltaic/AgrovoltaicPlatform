// Lo que protegen estas pruebas: que los tres vacíos se vean distintos (nunca
// evaluado, nada abierto, filtros sin coincidencias), que un servicio caído se
// lea como fallo con su detalle técnico y no como «no hay alertas», y que
// «Evaluar ahora» diga qué hizo o por qué no pudo.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ALERTS_PAGE_WIRE, ALERTS_SUMMARY_WIRE, EMPTY_ALERTS_PAGE_WIRE } from "@/app/lib/alertas/fixtures";
import { alertsPageSchema, alertsSummarySchema } from "@/app/lib/alertas/contracts";
import { failure } from "@/app/lib/analitica/errors";

const RANGE_SEARCH = "desde=2026-08-01&hasta=2026-09-01";
const navigation = vi.hoisted(() => ({ search: "", push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/alertas",
  useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
}));
vi.mock("@/app/components/analitica/SectionMenu", () => ({
  useSectionMenu: () => ({ open: false, openMenu: vi.fn(), closeMenu: vi.fn() }),
}));
vi.mock("@/app/lib/analitica/useDaysWithData", () => ({ useDaysWithData: () => ({ status: "loading" }) }));

const api = vi.hoisted(() => ({
  fetchAlertsPage: vi.fn(),
  fetchAlertsSummary: vi.fn(),
  fetchAlertDetail: vi.fn(),
  runAlertAction: vi.fn(),
  runEvaluation: vi.fn(),
}));
vi.mock("@/app/lib/alertas/client", () => api);

const { AlertasView } = await import("@/app/components/analitica/alertas/AlertasView");

const summaryWith = (overrides: Partial<typeof ALERTS_SUMMARY_WIRE> | { ultima_evaluacion: null } = {}) => ({
  ok: true,
  data: alertsSummarySchema.parse({ ...ALERTS_SUMMARY_WIRE, ...overrides }),
});
const emptyPage = () => ({ ok: true, data: alertsPageSchema.parse(EMPTY_ALERTS_PAGE_WIRE) });
const fullPage = () => ({ ok: true, data: alertsPageSchema.parse(ALERTS_PAGE_WIRE) });

function lastPushedParams(): URLSearchParams {
  return new URL(String(navigation.push.mock.calls.at(-1)?.[0]), "http://consola").searchParams;
}

beforeEach(() => {
  navigation.search = RANGE_SEARCH;
  navigation.push.mockReset();
  Object.values(api).forEach((mock) => mock.mockReset());
  api.fetchAlertsSummary.mockResolvedValue(summaryWith());
  api.fetchAlertsPage.mockResolvedValue(fullPage());
});

describe("los tres vacíos", () => {
  it("nunca evaluado: lo dice, ofrece evaluar y Calidad, y no muestra cifras ni filtros", async () => {
    // Given un evaluador que nunca corrió y una lista vacía
    api.fetchAlertsSummary.mockResolvedValue(summaryWith({ ultima_evaluacion: null }));
    api.fetchAlertsPage.mockResolvedValue(emptyPage());

    // When se monta la vista
    render(<AlertasView />);

    // Then el panel explica por qué no hay nada y qué hacer
    const panel = await screen.findByRole("status", { name: "Las alertas todavía no se evaluaron" });
    expect(within(panel).getByRole("button", { name: "Evaluar ahora" })).toBeEnabled();
    expect(within(panel).getByRole("link", { name: "Ver hallazgos en Calidad" })).toHaveAttribute("href", "/calidad");
    expect(screen.getByRole("banner")).toHaveTextContent("sin evaluar todavía");
    expect(screen.queryByLabelText("Resumen de alertas")).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("evaluado y sin abiertas: lo dice con la evaluación y lleva a Cerradas", async () => {
    // Given un período sin alertas abiertas, ya evaluado
    api.fetchAlertsPage.mockResolvedValue(emptyPage());
    render(<AlertasView />);

    // Then no es un error ni un «no se evaluó»
    const panel = await screen.findByRole("status", { name: "Nada pide atención en este período" });
    expect(panel).toHaveTextContent(/1 – 31 ago 2026 · diaria · evaluado/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // When se pide ver las cerradas / Then la URL pasa a esa pestaña
    fireEvent.click(within(panel).getByRole("button", { name: "Ver cerradas" }));
    expect(lastPushedParams().get("estado")).toBe("resuelta,descartada");
  });

  it("filtros sin coincidencias: lo dice así y Limpiar filtros vuelve al defecto", async () => {
    // Given un filtro de gravedad que no deja nada
    navigation.search = `${RANGE_SEARCH}&severidad=grave&q=xyz`;
    api.fetchAlertsPage.mockResolvedValue(emptyPage());
    render(<AlertasView />);

    // When se limpian los filtros
    const panel = await screen.findByRole("status", { name: "Ninguna coincide con los filtros" });
    fireEvent.click(within(panel).getByRole("button", { name: "Limpiar filtros" }));

    // Then la URL conserva el rango y pierde los filtros
    const params = lastPushedParams();
    expect(params.get("desde")).toBe("2026-08-01");
    expect(params.has("severidad")).toBe(false);
    expect(params.has("q")).toBe(false);
  });
});

describe("el servicio falla", () => {
  it("muestra el fallo con su detalle técnico y Reintentar vuelve a pedir", async () => {
    // Given un servicio que responde 500 la primera vez
    api.fetchAlertsPage
      .mockResolvedValueOnce({
        ok: false,
        failure: failure("UPSTREAM_ERROR", { status: 500, message: 'relation "alertas" does not exist' }),
      })
      .mockResolvedValueOnce(fullPage());
    render(<AlertasView />);

    // Then el panel dice quién falló, y el detalle trae método, ruta y código
    const panel = await screen.findByRole("alert", { name: "No se pudieron cargar las alertas" });
    expect(panel).toHaveTextContent("El servicio de alertas respondió con un error");
    expect(within(panel).getByText("Detalle técnico")).toBeInTheDocument();
    expect(panel).toHaveTextContent('GET /alertas → 500 · UPSTREAM_ERROR · relation "alertas" does not exist');
    expect(panel).toHaveTextContent(/último intento hace \d+ s/);

    // When se reintenta / Then vuelve a pedir y aparece la lista
    fireEvent.click(within(panel).getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("button", { name: /Inversor sin generar/ })).toBeInTheDocument();
    expect(api.fetchAlertsPage).toHaveBeenCalledTimes(2);
  });
});

describe("Evaluar ahora", () => {
  it("corre sobre el período, avisa cuántas creó y actualizó, y refresca lista y resumen", async () => {
    // Given la vista cargada y un evaluador que crea dos y actualiza una
    let finish: (value: unknown) => void = () => undefined;
    api.runEvaluation.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<AlertasView />);
    await screen.findByRole("button", { name: /Inversor sin generar/ });

    // When se pulsa en la cabecera
    fireEvent.click(within(screen.getByRole("banner")).getByRole("button", { name: "Evaluar ahora" }));

    // Then mientras corre lo dice y no deja lanzar otra
    expect(within(screen.getByRole("banner")).getByRole("button", { name: "Evaluando…" })).toBeDisabled();
    expect(api.runEvaluation).toHaveBeenCalledWith(expect.objectContaining({ from: "2026-08-01", toExclusive: "2026-09-01" }));

    // When termina
    finish({ ok: true, data: { created: 2, updated: 1, reviewed: 4, warning: null } });

    // Then el aviso dice qué hizo y la lista y el resumen se vuelven a pedir
    expect(await screen.findByText("2 creadas · 1 actualizada")).toBeInTheDocument();
    await waitFor(() => expect(api.fetchAlertsPage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(api.fetchAlertsSummary).toHaveBeenCalledTimes(2));
  });

  it("si el evaluador falla lo dice y no refresca nada", async () => {
    // Given un evaluador caído
    api.runEvaluation.mockResolvedValue({ ok: false, failure: failure("NETWORK") });
    render(<AlertasView />);
    await screen.findByRole("button", { name: /Inversor sin generar/ });

    // When se pulsa Evaluar ahora
    fireEvent.click(within(screen.getByRole("banner")).getByRole("button", { name: "Evaluar ahora" }));

    // Then el aviso explica el fallo y el botón vuelve a estar disponible
    expect(await screen.findByText(/La evaluación no corrió\. El servicio de alertas no respondió/)).toBeInTheDocument();
    expect(within(screen.getByRole("banner")).getByRole("button", { name: "Evaluar ahora" })).toBeEnabled();
    expect(api.fetchAlertsPage).toHaveBeenCalledTimes(1);
  });
});
