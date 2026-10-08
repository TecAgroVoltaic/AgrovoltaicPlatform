// Lo que protegen estas pruebas: que la frontera traduzca el vocabulario
// cerrado del contrato §4.5 y que rechace lo que no debe llegar a la pantalla
// (un estado desconocido, un enlace que saca de la consola).
import { describe, expect, it } from "vitest";

import {
  alertDetailSchema,
  alertSchema,
  alertsPageSchema,
  alertsSummarySchema,
  alertConflictSchema,
  evaluationResultSchema,
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

  it("el resumen publica el conteo de cada estado con el vocabulario de la aplicación", () => {
    // Given el resumen del contrato / When se valida
    const summary = alertsSummarySchema.parse(ALERTS_SUMMARY_WIRE);

    // Then cada estado conserva su conteo, ya traducido
    expect(summary.byStatus).toEqual({ new: 3, acknowledged: 1, tracking: 2, resolved: 7, dismissed: 4 });
  });

  it("evaluar distingue «sin hallazgos que recorrer» de «nada nuevo»", () => {
    // Given dos respuestas de /evaluar: una normal y otra con la tabla de hallazgos vacía
    const normal = evaluationResultSchema.parse({ creadas: 2, actualizadas: 1, revisadas: 5, notas: 0, rango: null });
    const empty = evaluationResultSchema.parse({
      creadas: 0,
      actualizadas: 0,
      revisadas: 0,
      rango: null,
      advertencia: "hallazgos_calidad esta vacio",
    });

    // Then la advertencia viaja solo cuando el backend la manda
    expect(normal).toEqual({ created: 2, updated: 1, reviewed: 5, warning: null });
    expect(empty.warning).toBe("hallazgos_calidad esta vacio");
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

describe("contrato de los dos 409", () => {
  it.each([
    ["como lo manda historico.errores", { detail: "no se puede resolver", ...INVALID_TRANSITION_WIRE }],
    ["envuelto en detail (HTTPException)", { detail: INVALID_TRANSITION_WIRE }],
  ])("transicion_invalida se lee %s", (_shape, body) => {
    // Given el cuerpo del 409
    // When se valida
    const conflict = alertConflictSchema.parse(body);

    // Then dice de qué estado a cuál se intentó pasar
    expect(conflict).toEqual({ kind: "invalidTransition", from: "dismissed", to: "resolved" });
  });

  it("alerta_abierta_existente trae la alerta con la que choca", () => {
    // Given reabrir una alerta cuya clave ya tiene otra abierta
    const body = { detail: "ya hay una abierta", codigo: "alerta_abierta_existente", id: 41, abierta_id: 77 };

    // When se valida / Then se distingue del otro 409
    expect(alertConflictSchema.parse(body)).toEqual({ kind: "openAlertExists", openAlertId: 77 });
  });

  it("un 409 con otro código no se toma por ninguno de los dos", () => {
    // Given un conflicto que el contrato no define / When se valida / Then no pasa
    expect(alertConflictSchema.safeParse({ codigo: "otro", detail: "x" }).success).toBe(false);
  });
});
