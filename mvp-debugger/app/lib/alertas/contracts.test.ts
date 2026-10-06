// Lo que protegen estas pruebas: que la frontera traduzca el vocabulario
// cerrado del contrato §4.5 y que rechace lo que no debe llegar a la pantalla
// (un estado desconocido, un enlace que saca de la consola).
import { describe, expect, it } from "vitest";

import {
  alertDetailSchema,
  alertSchema,
  alertsPageSchema,
  alertsSummarySchema,
  invalidTransitionSchema,
} from "@/app/lib/alertas/contracts";
import {
  ALERT_DETAIL_WIRE,
  ALERTS_PAGE_WIRE,
  ALERTS_SUMMARY_WIRE,
  INVALID_TRANSITION_WIRE,
  INVERTER_ALERT_WIRE,
} from "@/app/lib/alertas/fixtures";

describe("contrato de una alerta", () => {
  it("traduce estado y gravedad al vocabulario de la aplicación", () => {
    // Given una alerta en seguimiento del cable
    const wire = { ...INVERTER_ALERT_WIRE, estado: "en_seguimiento", severidad: "aviso" };

    // When se valida
    const alert = alertSchema.parse(wire);

    // Then el componente recibe identificadores en inglés y la evidencia intacta
    expect(alert.status).toBe("tracking");
    expect(alert.severity).toBe("warning");
    expect(alert.evidence.figures).toMatchObject({ ghi_max_wm2: 1043.5, codigo_error: 302 });
  });

  it("rechaza un estado que el contrato no conoce en vez de pintarlo como abierto", () => {
    // Given un estado inventado
    const wire = { ...INVERTER_ALERT_WIRE, estado: "archivada" };

    // When se valida
    const result = alertSchema.safeParse(wire);

    // Then falla en la frontera
    expect(result.success).toBe(false);
  });

  it("acepta una evidencia vacía, que es como nace la columna", () => {
    // Given la evidencia por defecto de la tabla (`'{}'`)
    const wire = { ...INVERTER_ALERT_WIRE, evidencia: {} };

    // When se valida
    const alert = alertSchema.parse(wire);

    // Then quedan listas vacías, no `undefined`
    expect(alert.evidence).toEqual({ dates: [], findings: [], figures: {} });
  });

  it("rechaza fechas de calendario imposibles", () => {
    // Given un 30 de febrero
    const wire = { ...INVERTER_ALERT_WIRE, fecha_fin: "2026-02-30" };

    // When se valida / Then falla
    expect(alertSchema.safeParse(wire).success).toBe(false);
  });
});

describe("contrato de la lista, el resumen y la ficha", () => {
  it("la lista conserva la paginación que publica el servicio", () => {
    // Given la primera página de 23 alertas
    // When se valida
    const page = alertsPageSchema.parse(ALERTS_PAGE_WIRE);

    // Then el total es el del filtro y el siguiente desplazamiento viene del backend
    expect(page.total).toBe(23);
    expect(page.page).toEqual({ offset: 0, limit: 20, hasMore: true, nextOffset: 20 });
    expect(page.alerts).toHaveLength(2);
  });

  it("el resumen distingue «nunca evaluado» de «evaluado sin alertas»", () => {
    // Given un resumen de un evaluador que todavía no corrió
    const wire = { ...ALERTS_SUMMARY_WIRE, abiertas_graves: 0, ultima_evaluacion: null };

    // When se valida
    const summary = alertsSummarySchema.parse(wire);

    // Then la ausencia de evaluación queda en null, no en una fecha falsa
    expect(summary.openCritical).toBe(0);
    expect(summary.lastEvaluation).toBeNull();
  });

  it("la ficha traduce eventos y enlaces", () => {
    // Given la ficha de la alerta del inversor
    // When se valida
    const detail = alertDetailSchema.parse(ALERT_DETAIL_WIRE);

    // Then los eventos llegan con su tipo y los enlaces son rutas internas
    expect(detail.events.map((event) => event.type)).toEqual(["created", "occurrence"]);
    expect(detail.links.quality).toBe("/calidad?desde=2026-08-26&hasta=2026-09-01");
  });

  it.each(["https://otro.sitio/calidad", "//otro.sitio", "javascript:alert(1)"])(
    "rechaza el enlace externo %s",
    (link) => {
      // Given una ficha con un enlace que saca de la consola
      const wire = { ...ALERT_DETAIL_WIRE, enlaces: { ...ALERT_DETAIL_WIRE.enlaces, series: link } };

      // When se valida / Then no pasa la frontera
      expect(alertDetailSchema.safeParse(wire).success).toBe(false);
    },
  );
});

describe("contrato del 409 transicion_invalida", () => {
  it.each([
    ["suelto", INVALID_TRANSITION_WIRE],
    ["envuelto en detail (FastAPI)", { detail: INVALID_TRANSITION_WIRE }],
  ])("lo lee %s", (_shape, body) => {
    // Given el cuerpo del 409
    // When se valida
    const transition = invalidTransitionSchema.parse(body);

    // Then dice de qué estado a cuál se intentó pasar
    expect(transition).toEqual({ from: "dismissed", to: "resolved" });
  });
});
