// Lo que protegen estas pruebas: que la lista y las cifras digan lo que publica
// el servicio, y que pestañas y filtros se escriban en la URL sin perder el
// rango. Los vacíos, el error y «Evaluar ahora» están en AlertasStates.test.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ALERTS_PAGE_WIRE, ALERTS_SUMMARY_WIRE } from "@/app/lib/alertas/fixtures";
import { alertsPageSchema, alertsSummarySchema } from "@/app/lib/alertas/contracts";

const RANGE_SEARCH = "desde=2026-08-01&hasta=2026-09-01";
const navigation = vi.hoisted(() => ({ search: "", push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/alertas",
  useSearchParams: () => new URLSearchParams(navigation.search),
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
}));
// La cabecera trae el botón del menú y el chip de rango: sin proveedor ni red.
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

describe("la lista", () => {
  it("cada fila dice gravedad, cifra clave, variable, fechas, días y estado", async () => {
    // Given dos alertas abiertas en el rango / When se monta la vista
    render(<AlertasView />);

    // Then la fila del inversor tiene lo necesario para decidir si abrirla
    const row = await screen.findByRole("button", { name: /Inversor sin generar con sol pleno/ });
    expect(row).toHaveTextContent("Grave");
    expect(row).toHaveTextContent(/GHI máx 1\s?043,5 W\/m²/);
    expect(row).toHaveTextContent("todas las AC");
    expect(row).toHaveTextContent("26 – 31 ago · 2 días");
    expect(row).toHaveTextContent("Nueva");
    // And la grave sin ver se destaca; el aviso en seguimiento, no
    expect(row).toHaveAttribute("data-unseen", "true");
    expect(screen.getByRole("button", { name: /Sensor DS18B20/ })).not.toHaveAttribute("data-unseen");
    expect(screen.getByText(/1 a 2 de 23 alertas en el período/)).toBeInTheDocument();
  });

  it("las cuatro cifras salen del resumen y la cabecera dice cuándo se evaluó", async () => {
    // Given el resumen del contrato (3 graves de 6 abiertas, 2 en seguimiento, 7 resueltas)
    render(<AlertasView />);

    // Then cada cifra es la del resumen; los avisos son abiertas menos graves
    const summary = await screen.findByLabelText("Resumen de alertas");
    await waitFor(() => expect(within(summary).getByText("Graves abiertas").nextSibling).toHaveTextContent("3"));
    expect(within(summary).getByText("Avisos abiertos").nextSibling).toHaveTextContent("3");
    expect(within(summary).getByText("En seguimiento").nextSibling).toHaveTextContent("2");
    expect(within(summary).getByText("Resueltas").nextSibling).toHaveTextContent("7");
    expect(within(summary).getByText("3 nuevas sin ver en total")).toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveTextContent(/evaluadas hace/);
  });

  it("abrir una alerta deja su id en la URL para poder compartir la ficha", async () => {
    render(<AlertasView />);
    fireEvent.click(await screen.findByRole("button", { name: /Inversor sin generar/ }));
    expect(lastPushedParams().get("alerta")).toBe("41");
  });
});

describe("pestañas y filtros", () => {
  it("las pestañas muestran los conteos del resumen y marcan la del estado de la URL", async () => {
    // Given la URL en «en seguimiento»
    navigation.search = `${RANGE_SEARCH}&estado=en_seguimiento`;
    render(<AlertasView />);

    // Then esa pestaña está elegida y cada una cuenta lo suyo
    const tabs = await screen.findByRole("tablist", { name: "Estado de las alertas" });
    await waitFor(() => expect(within(tabs).getByRole("tab", { name: /Abiertas/ })).toHaveTextContent("6"));
    expect(within(tabs).getByRole("tab", { name: /En seguimiento/ })).toHaveAttribute("aria-selected", "true");
    expect(within(tabs).getByRole("tab", { name: /Cerradas/ })).toHaveTextContent("11");
    expect(within(tabs).getByRole("tab", { name: /Todas/ })).toHaveTextContent("17");
  });

  it("elegir Cerradas escribe los dos estados cerrados, conserva el rango y vuelve a la página uno", async () => {
    // Given la página dos de las abiertas
    navigation.search = `${RANGE_SEARCH}&offset=20`;
    render(<AlertasView />);

    // When se elige la pestaña Cerradas
    fireEvent.click(await screen.findByRole("tab", { name: /Cerradas/ }));

    // Then la URL lleva el corte, el rango sigue y el desplazamiento viejo no
    const params = lastPushedParams();
    expect(params.get("estado")).toBe("resuelta,descartada");
    expect(params.get("desde")).toBe("2026-08-01");
    expect(params.has("offset")).toBe(false);
  });

  it("las flechas mueven el foco entre pestañas sin cambiar la URL", async () => {
    render(<AlertasView />);
    const open = await screen.findByRole("tab", { name: /Abiertas/ });
    open.focus();
    fireEvent.keyDown(open, { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: /Todas/ })).toHaveFocus();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("un estado suelto que llega por un enlace viejo se ve como chip y se puede quitar", async () => {
    // Given un enlace que filtra solo las nuevas
    navigation.search = `${RANGE_SEARCH}&estado=nueva`;
    render(<AlertasView />);

    // Then ninguna pestaña miente estar elegida, y el chip vuelve a las abiertas
    const chip = await screen.findByRole("button", { name: "Quitar el filtro de estado Nueva" });
    expect(screen.getAllByRole("tab").every((tab) => tab.getAttribute("aria-selected") === "false")).toBe(true);
    fireEvent.click(chip);
    expect(lastPushedParams().has("estado")).toBe(false);
  });

  it("apagar el chip Avisos deja solo las graves en la URL", async () => {
    render(<AlertasView />);
    const warnings = await screen.findByRole("button", { name: "Avisos" });
    expect(warnings).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(warnings);
    expect(lastPushedParams().get("severidad")).toBe("grave");
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
