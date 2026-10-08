// Lo que protegen estas pruebas: que la ficha muestre la evidencia (cifras con
// nombre y unidad, días afectados) y el historial, que cada acción dé señal
// mientras corre y refresque al terminar, que el seguimiento exija nota y lleve
// la próxima revisión, que «olvidar» pida confirmación en línea y que un 409 se
// lea como lo que es.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { alertDetailSchema, alertSchema } from "@/app/lib/alertas/contracts";
import { ALERT_DETAIL_WIRE, INVERTER_ALERT_WIRE } from "@/app/lib/alertas/fixtures";
import { failure } from "@/app/lib/analitica/errors";

const api = vi.hoisted(() => ({
  fetchAlertsPage: vi.fn(),
  fetchAlertsSummary: vi.fn(),
  fetchAlertDetail: vi.fn(),
  runAlertAction: vi.fn(),
  INVALID_TRANSITION_MESSAGE: "Esa acción ya no aplica.",
}));
vi.mock("@/app/lib/alertas/client", () => api);

const { AlertDrawer } = await import("@/app/components/analitica/alertas/AlertDrawer");

const ALERT_ID = 41;
const detail = alertDetailSchema.parse(ALERT_DETAIL_WIRE);

function detailIn(status: string) {
  return alertDetailSchema.parse({ ...ALERT_DETAIL_WIRE, alerta: { ...INVERTER_ALERT_WIRE, estado: status } });
}

function renderDrawer() {
  const onChanged = vi.fn();
  const onClose = vi.fn();
  render(<AlertDrawer alertId={ALERT_ID} onClose={onClose} onChanged={onChanged} />);
  return { onChanged, onClose };
}

/** Una promesa que la prueba resuelve cuando quiere: deja ver el estado de carga. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  Object.values(api).forEach((mock) => typeof mock === "function" && mock.mockReset());
  api.fetchAlertDetail.mockResolvedValue({ ok: true, data: detail });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("la ficha de una alerta", () => {
  it("muestra descripción, enlaces con el rango e historial", async () => {
    // Given la ficha del inversor parado
    // When se abre
    renderDrawer();

    // Then está todo lo que hace falta para decidir
    const dialog = await screen.findByRole("dialog", { name: "Inversor sin generar con sol pleno" });
    expect(within(dialog).getByText(/no exportó energía en todo el día/)).toBeInTheDocument();
    expect(dialog).toHaveTextContent("26 – 31 ago 2026 · 2 ocurrencias");
    expect(within(dialog).getByRole("link", { name: "Ver en Calidad" })).toHaveAttribute(
      "href",
      "/calidad?desde=2026-08-26&hasta=2026-09-01",
    );
    // And el asistente se abre con el rango de la alerta, fin exclusivo
    expect(within(dialog).getByRole("link", { name: "Preguntar al asistente" })).toHaveAttribute(
      "href",
      "/asistente?desde=2026-08-26&hasta=2026-09-01&granularidad=dia",
    );
    const history = within(dialog).getByRole("region", { name: /Historial/ });
    expect(within(history).getByText("Creada: 26 ago 2026")).toBeInTheDocument();
    expect(within(history).getByText("Nueva ocurrencia: 31 ago 2026")).toBeInTheDocument();
  });

  it("«Qué significa» despliega la explicación del tipo de alerta", async () => {
    renderDrawer();
    const toggle = await screen.findByRole("button", { name: "Qué significa" });
    expect(screen.getByText(/suele ser una falla del equipo/)).not.toBeVisible();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/suele ser una falla del equipo/)).toBeVisible();
  });

  it("las cifras clave salen de la evidencia, con nombre legible y unidad si se conoce", async () => {
    // Given una evidencia con una cifra del evaluador y otras que no conoce
    renderDrawer();

    // Then la conocida se lee como «GHI máx» con W/m², las otras con su nombre crudo
    const figures = await screen.findByRole("region", { name: "Cifras clave" });
    const ghi = within(figures).getByText("GHI máx").nextSibling;
    expect(ghi).toHaveTextContent(/^1\s?043,5W\/m²$/);
    expect(within(figures).getByText("codigo_error").nextSibling).toHaveTextContent("302");
    expect(within(figures).getByText("nota_equipo").nextSibling).toHaveTextContent("—");
  });

  it("los días afectados se marcan en la tira del mes, y se dicen en palabras", async () => {
    // Given una alerta vista el 26 y el 31 de agosto
    renderDrawer();

    // Then hay una tira de agosto del 26 al 31 con esos dos días marcados
    const strip = await screen.findByRole("region", { name: "Días afectados · agosto 2026" });
    expect(strip.querySelectorAll("li")).toHaveLength(6);
    expect(Array.from(strip.querySelectorAll('li[data-affected="true"]')).map((day) => day.textContent)).toEqual([
      "26",
      "31",
    ]);
    expect(strip).toHaveTextContent("Con la condición: 26, 31 de agosto 2026.");
  });

  it("una nueva ofrece aprobar y olvidar, nada más", async () => {
    // Given una alerta nueva / When se abre
    renderDrawer();
    const actions = await screen.findByRole("region", { name: "Acciones sobre la alerta" });

    // Then los botones son los de su estado
    const labels = within(actions).getAllByRole("button").map((button) => button.textContent);
    expect(labels).toEqual(["Aprobar", "Olvidar"]);
  });

  it("aprobar muestra progreso y al terminar refresca ficha, lista y contador", async () => {
    // Given un servicio que tarda en aprobar
    const pending = deferred<unknown>();
    api.runAlertAction.mockReturnValue(pending.promise);
    const { onChanged } = renderDrawer();
    fireEvent.click(await screen.findByRole("button", { name: "Aprobar" }));

    // When está en curso
    // Then el botón lo dice y no se puede pulsar de nuevo
    expect(screen.getByRole("button", { name: "Aprobando…" })).toBeDisabled();

    // When termina
    api.fetchAlertDetail.mockResolvedValue({ ok: true, data: detailIn("reconocida") });
    pending.resolve({ ok: true, alert: alertSchema.parse({ ...INVERTER_ALERT_WIRE, estado: "reconocida" }) });

    // Then la ficha muestra las acciones del estado nuevo, lo anuncia, y la vista se entera
    expect(await screen.findByRole("button", { name: "Dar seguimiento" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("Alerta aprobada.");
    expect(api.runAlertAction).toHaveBeenCalledWith(ALERT_ID, { action: "acknowledge" });
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(api.fetchAlertDetail).toHaveBeenCalledTimes(2);
  });

  it("un seguimiento sin nota no se envía y dice por qué", async () => {
    // Given una alerta aprobada con el formulario de seguimiento abierto
    api.fetchAlertDetail.mockResolvedValue({ ok: true, data: detailIn("reconocida") });
    renderDrawer();
    fireEvent.click(await screen.findByRole("button", { name: "Dar seguimiento" }));

    // When se guarda sin nota
    fireEvent.click(screen.getByRole("button", { name: "Guardar seguimiento" }));

    // Then no sale nada y el campo queda marcado
    expect(screen.getByRole("alert")).toHaveTextContent(/Escribí una nota/);
    expect(screen.getByLabelText("Nota de seguimiento")).toHaveAttribute("aria-invalid", "true");
    expect(api.runAlertAction).not.toHaveBeenCalled();
  });

  it("un seguimiento con nota y fecha sale con las dos", async () => {
    // Given hoy es 6 oct 2026 en el sitio y el formulario de seguimiento abierto
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-06T16:00:00Z"));
    api.fetchAlertDetail.mockResolvedValue({ ok: true, data: detailIn("reconocida") });
    api.runAlertAction.mockResolvedValue({ ok: false, failure: failure("NETWORK"), conflict: null });
    renderDrawer();
    fireEvent.click(await screen.findByRole("button", { name: "Dar seguimiento" }));

    // When se escribe la nota y se elige la próxima revisión en el calendario
    fireEvent.change(screen.getByLabelText("Nota de seguimiento"), { target: { value: "Leo revisa el 302" } });
    fireEvent.click(screen.getByRole("button", { name: "Próxima revisión sin fecha" }));
    expect(screen.getByRole("button", { name: /^5 de octubre de 2026, ya pasó/ })).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("button", { name: "15 de octubre de 2026" }));
    expect(screen.getByRole("button", { name: "Próxima revisión 15 oct 2026" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar seguimiento" }));

    // Then sale la acción con nota y fecha, y el fallo de red queda a la vista
    await waitFor(() =>
      expect(api.runAlertAction).toHaveBeenCalledWith(ALERT_ID, {
        action: "followUp",
        note: "Leo revisa el 302",
        nextReview: "2026-10-15",
      }),
    );
    expect(await screen.findByText("no se pudo contactar al servidor")).toBeInTheDocument();
  });

  it("olvidar pide confirmación en línea antes de ejecutar", async () => {
    // Given una alerta nueva
    api.runAlertAction.mockResolvedValue({
      ok: true,
      alert: alertSchema.parse({ ...INVERTER_ALERT_WIRE, estado: "descartada" }),
    });
    renderDrawer();

    // When se pulsa Olvidar
    fireEvent.click(await screen.findByRole("button", { name: "Olvidar" }));

    // Then todavía no se ejecutó: primero se confirma
    expect(screen.getByText(/queda en el historial/)).toBeInTheDocument();
    expect(api.runAlertAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sí, olvidar" }));
    await waitFor(() => expect(api.runAlertAction).toHaveBeenCalledWith(ALERT_ID, { action: "dismiss", note: "" }));
  });

  it("un 409 transicion_invalida explica el estado real y refresca la ficha", async () => {
    // Given una alerta que alguien ya olvidó desde otra pantalla
    api.runAlertAction.mockResolvedValue({
      ok: false,
      failure: failure("UPSTREAM_ERROR", { status: 409, message: api.INVALID_TRANSITION_MESSAGE }),
      conflict: { kind: "invalidTransition", from: "dismissed", to: "acknowledged" },
    });
    const { onChanged } = renderDrawer();

    // When se intenta aprobarla
    api.fetchAlertDetail.mockResolvedValue({ ok: true, data: detailIn("descartada") });
    fireEvent.click(await screen.findByRole("button", { name: "Aprobar" }));

    // Then el mensaje dice qué pasó y la ficha ofrece lo que sí se puede hacer
    expect(await screen.findByRole("alert")).toHaveTextContent("Esa acción ya no aplica. Ahora está «Olvidada».");
    expect(await screen.findByRole("button", { name: "Reabrir" })).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("Escape dentro del calendario cierra el calendario, no la ficha", async () => {
    // Given el calendario de la próxima revisión abierto
    api.fetchAlertDetail.mockResolvedValue({ ok: true, data: detailIn("en_seguimiento") });
    const { onClose } = renderDrawer();
    fireEvent.click(await screen.findByRole("button", { name: "Dar seguimiento" }));
    fireEvent.click(screen.getByRole("button", { name: "Próxima revisión sin fecha" }));

    // When se pulsa Escape en el calendario
    fireEvent.keyDown(screen.getByRole("grid"), { key: "Escape" });

    // Then se cierra el calendario y la ficha sigue abierta
    expect(screen.queryByRole("grid")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Escape cierra la ficha", async () => {
    // Given la ficha abierta
    const { onClose } = renderDrawer();
    await screen.findByRole("dialog");

    // When se pulsa Escape / Then se pide cerrar
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
