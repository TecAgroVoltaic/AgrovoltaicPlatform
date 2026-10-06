// Lo que protegen estas pruebas: que la ficha muestre la evidencia y el
// historial, que cada acción dé señal mientras corre y refresque al terminar,
// que «olvidar» pida confirmación en línea y que un 409 se lea como lo que es.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("la ficha de una alerta", () => {
  it("muestra descripción, cifras, enlaces con el rango e historial", async () => {
    // Given la ficha del inversor parado
    // When se abre
    renderDrawer();

    // Then está todo lo que hace falta para decidir
    const dialog = await screen.findByRole("dialog", { name: "Inversor sin generar con sol pleno" });
    expect(within(dialog).getByText(/no exportó energía en todo el día/)).toBeInTheDocument();
    expect(within(dialog).getByText("ghi_max_wm2").nextSibling).toHaveTextContent(/^1\s?043,5$/);
    expect(within(dialog).getByRole("link", { name: "Ver en Calidad" })).toHaveAttribute(
      "href",
      "/calidad?desde=2026-08-26&hasta=2026-09-01",
    );
    const history = within(dialog).getByRole("region", { name: /Historial/ });
    expect(within(history).getByText("Creada")).toBeInTheDocument();
    expect(within(history).getByText("Nueva ocurrencia")).toBeInTheDocument();
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

    // Then la ficha muestra las acciones del estado nuevo y la vista se entera
    expect(await screen.findByRole("button", { name: "Dar seguimiento" })).toBeEnabled();
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
    expect(screen.getByLabelText("Nota del seguimiento")).toHaveAttribute("aria-invalid", "true");
    expect(api.runAlertAction).not.toHaveBeenCalled();
  });

  it("un seguimiento con nota y fecha sale con las dos", async () => {
    // Given el formulario de seguimiento abierto
    api.fetchAlertDetail.mockResolvedValue({ ok: true, data: detailIn("reconocida") });
    api.runAlertAction.mockResolvedValue({ ok: false, failure: failure("NETWORK"), transition: null });
    renderDrawer();
    fireEvent.click(await screen.findByRole("button", { name: "Dar seguimiento" }));

    // When se completa y se guarda
    fireEvent.change(screen.getByLabelText("Nota del seguimiento"), { target: { value: "Leo revisa el 302" } });
    fireEvent.change(screen.getByLabelText("Próxima revisión (opcional)"), { target: { value: "2026-10-15" } });
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
      transition: { from: "dismissed", to: "acknowledged" },
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

  it("Escape cierra la ficha", async () => {
    // Given la ficha abierta
    const { onClose } = renderDrawer();
    await screen.findByRole("dialog");

    // When se pulsa Escape / Then se pide cerrar
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
