// Lo que protegen estas pruebas: que el contador del menú se entere de los
// cambios sin sondear, y que un resumen caído no rompa la navegación.
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { alertsSummarySchema } from "@/app/lib/alertas/contracts";
import { ALERTS_SUMMARY_WIRE } from "@/app/lib/alertas/fixtures";
import { failure } from "@/app/lib/analitica/errors";
import { announceAlertsChanged } from "@/app/lib/alertas/changes";

vi.mock("next/navigation", () => ({ usePathname: () => "/series" }));
const api = vi.hoisted(() => ({ fetchAlertsSummary: vi.fn() }));
vi.mock("@/app/lib/alertas/client", () => api);

const { AlertsNavBadge } = await import("@/app/components/analitica/alertas/AlertsNavBadge");

function summaryWith(openCritical: number) {
  return { ok: true, data: alertsSummarySchema.parse({ ...ALERTS_SUMMARY_WIRE, abiertas_graves: openCritical }) };
}

beforeEach(() => {
  api.fetchAlertsSummary.mockReset();
});

describe("AlertsNavBadge", () => {
  it("muestra las graves abiertas y lo dice en palabras al lector de pantalla", async () => {
    // Given tres alertas graves abiertas
    api.fetchAlertsSummary.mockResolvedValue(summaryWith(3));

    // When se pinta el menú
    render(<AlertsNavBadge />);

    // Then se ve el número y se lee la frase
    expect(await screen.findByText("3")).toBeInTheDocument();
    expect(screen.getByText(/3 alertas graves abiertas/)).toBeInTheDocument();
  });

  it("si el resumen falla no pinta nada y no rompe", async () => {
    // Given un servicio caído
    api.fetchAlertsSummary.mockResolvedValue({ ok: false, failure: failure("NETWORK") });

    // When se pinta
    const { container } = render(<AlertsNavBadge />);

    // Then el lugar del contador queda vacío
    await vi.waitFor(() => expect(api.fetchAlertsSummary).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("se actualiza cuando la vista avisa que las alertas cambiaron", async () => {
    // Given una alerta grave abierta
    api.fetchAlertsSummary.mockResolvedValue(summaryWith(1));
    render(<AlertsNavBadge />);
    await screen.findByText("1");

    // When alguien la resuelve y la vista avisa
    api.fetchAlertsSummary.mockResolvedValue(summaryWith(0));
    act(() => announceAlertsChanged());

    // Then el contador desaparece: un cero no se pinta
    await vi.waitFor(() => expect(screen.queryByText("1")).not.toBeInTheDocument());
    expect(api.fetchAlertsSummary).toHaveBeenCalledTimes(2);
  });
});
