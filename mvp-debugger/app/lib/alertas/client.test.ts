// Lo que protegen estas pruebas: que las acciones salgan como POST con el
// cuerpo del contrato, y que los dos 409 y el 422 lleguen como mensajes claros,
// no como «el servicio devolvió un error».
import { describe, expect, it, vi } from "vitest";

import {
  fetchAlertsPage,
  INVALID_TRANSITION_MESSAGE,
  OPEN_ALERT_EXISTS_MESSAGE,
  runAlertAction,
  VALIDATION_MESSAGE,
} from "@/app/lib/alertas/client";
import {
  ALERTS_PAGE_WIRE,
  INVALID_TRANSITION_WIRE,
  INVERTER_ALERT_WIRE,
} from "@/app/lib/alertas/fixtures";
import { DEFAULT_ALERT_FILTERS } from "@/app/lib/alertas/query";
import type { HttpFetch } from "@/app/lib/analitica/client";

const ALERT_ID = 41;

function respondWith(status: number, body: unknown) {
  return vi.fn<HttpFetch>(async () => new Response(JSON.stringify(body), { status }));
}

describe("acciones sobre una alerta", () => {
  it("dar seguimiento envía nota y próxima revisión por POST a su ruta", async () => {
    // Given un servicio que acepta la acción
    const httpFetch = respondWith(200, { alerta: { ...INVERTER_ALERT_WIRE, estado: "en_seguimiento" } });

    // When se da seguimiento con nota
    const outcome = await runAlertAction(
      ALERT_ID,
      { action: "followUp", note: "  Revisar el inversor  ", nextReview: "2026-10-15" },
      { httpFetch },
    );

    // Then sale un POST con el cuerpo del contrato y vuelve la alerta nueva
    const [url, init] = httpFetch.mock.calls[0];
    expect(url).toBe("/api/historico/alertas/41/seguimiento");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      nota: "Revisar el inversor",
      proxima_revision: "2026-10-15",
    });
    expect(outcome).toMatchObject({ ok: true, alert: { status: "tracking" } });
  });

  it("sin nota no manda el campo vacío", async () => {
    // Given una aprobación sin comentario
    const httpFetch = respondWith(200, { alerta: { ...INVERTER_ALERT_WIRE, estado: "reconocida" } });

    // When se aprueba
    await runAlertAction(ALERT_ID, { action: "acknowledge", note: " " }, { httpFetch });

    // Then el cuerpo va vacío y la ruta es la de reconocer
    const [url, init] = httpFetch.mock.calls[0];
    expect(url).toBe("/api/historico/alertas/41/reconocer");
    expect(JSON.parse(String(init?.body))).toEqual({});
  });

  it("un 409 transicion_invalida devuelve mensaje claro y los dos estados", async () => {
    // Given una alerta que otra persona ya olvidó
    const httpFetch = respondWith(409, { detail: "no se puede resolver", ...INVALID_TRANSITION_WIRE });

    // When se intenta resolverla
    const outcome = await runAlertAction(ALERT_ID, { action: "resolve" }, { httpFetch });

    // Then no es un error genérico: dice que cambió de estado y hacia cuál
    expect(outcome).toMatchObject({
      ok: false,
      failure: { status: 409, message: INVALID_TRANSITION_MESSAGE },
      conflict: { kind: "invalidTransition", from: "dismissed", to: "resolved" },
    });
  });

  it("reabrir con otra alerta abierta por la misma causa lo dice con esas palabras", async () => {
    // Given un 409 alerta_abierta_existente
    const httpFetch = respondWith(409, {
      detail: "ya existe",
      codigo: "alerta_abierta_existente",
      id: ALERT_ID,
      abierta_id: 77,
    });

    // When se intenta reabrir
    const outcome = await runAlertAction(ALERT_ID, { action: "reopen" }, { httpFetch });

    // Then no se confunde con una transición inválida
    expect(outcome).toMatchObject({
      ok: false,
      failure: { message: OPEN_ALERT_EXISTS_MESSAGE },
      conflict: { kind: "openAlertExists", openAlertId: 77 },
    });
  });

  it("un 422 de validación se explica en vez de mostrar la lista de FastAPI", async () => {
    // Given un seguimiento que el backend rechaza por la nota
    const httpFetch = respondWith(422, { detail: [{ loc: ["body", "nota"], msg: "field required" }] });

    // When se envía
    const outcome = await runAlertAction(ALERT_ID, { action: "followUp", note: "x" }, { httpFetch });

    // Then el mensaje dice qué revisar
    expect(outcome).toMatchObject({ ok: false, failure: { message: VALIDATION_MESSAGE }, conflict: null });
  });

  it("un 409 con un código desconocido sigue siendo un error del servicio", async () => {
    // Given un conflicto que no es de transición
    const httpFetch = respondWith(409, { detail: "otra cosa" });

    // When se intenta la acción
    const outcome = await runAlertAction(ALERT_ID, { action: "reopen" }, { httpFetch });

    // Then viaja el mensaje del servicio, sin transición inventada
    expect(outcome).toMatchObject({
      ok: false,
      failure: { code: "UPSTREAM_ERROR", message: "otra cosa" },
      conflict: null,
    });
  });

  it("si la red se cae, el fallo es NETWORK", async () => {
    // Given un fetch que ni sale
    const httpFetch = vi.fn<HttpFetch>(async () => {
      throw new TypeError("Failed to fetch");
    });

    // When se intenta la acción
    const outcome = await runAlertAction(ALERT_ID, { action: "dismiss" }, { httpFetch });

    // Then el código es el de siempre de la capa de análisis
    expect(outcome).toMatchObject({ ok: false, failure: { code: "NETWORK" }, conflict: null });
  });
});

describe("lectura de la lista", () => {
  it("pide el rango y los filtros juntos por GET", async () => {
    // Given un servicio con una página
    const httpFetch = respondWith(200, ALERTS_PAGE_WIRE);
    const range = { from: "2026-08-01", toExclusive: "2026-09-01", granularity: "day" } as const;
    const query = {
      filters: { ...DEFAULT_ALERT_FILTERS, severity: "critical" },
      offset: 20,
      selectedId: null,
    } as const;

    // When se pide la lista
    const result = await fetchAlertsPage(range, query, { httpFetch });

    // Then la URL lleva el rango, el estado por defecto y la gravedad
    const url = new URL(String(httpFetch.mock.calls[0][0]), "http://consola");
    expect(url.pathname).toBe("/api/historico/alertas");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      desde: "2026-08-01",
      hasta: "2026-09-01",
      estado: "nueva,reconocida,en_seguimiento",
      severidad: "grave",
      offset: "20",
    });
    expect(result.ok).toBe(true);
  });
});
