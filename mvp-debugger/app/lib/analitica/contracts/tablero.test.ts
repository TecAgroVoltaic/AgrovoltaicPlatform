// El contrato es la frontera donde entra el dato: si acá se cuela un cero que
// era un «no hay dato», ya no hay forma de distinguirlos aguas abajo. Por eso se
// prueba contra el payload REAL del servicio y no contra un objeto inventado.
import { describe, expect, it } from "vitest";

import { dashboardPayload } from "@/app/components/analitica/tablero/dashboardFixture";
import { dashboardSummarySchema } from "@/app/lib/analitica/contracts/tablero";

function parseOrThrow(body: unknown) {
  const result = dashboardSummarySchema.safeParse(body);
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}

describe("dashboardSummarySchema", () => {
  it("lee las nueve casillas del cuerpo real del servicio", () => {
    // Given el cuerpo real de /analitica/resumen para un rango con datos
    const body = dashboardPayload();

    // When se valida contra el contrato
    const summary = parseOrThrow(body);

    // Then llegan las nueve casillas, cada una con su valor medido
    expect(summary.freshness.state).toBe("stopped");
    expect(summary.freshness.lastDataAt).toBe("2026-06-01T17:55:00+00:00");
    expect(summary.periodEnergy.totalAc).toMatchObject({ status: "measured", value: 1392.12 });
    expect(summary.recentEnergy.totalAc).toMatchObject({ status: "measured", value: 38 });
    expect(summary.periodEnergy.tilted).toMatchObject({ status: "measured", value: 771.43 });
    expect(summary.recentEnergy.tilted).toMatchObject({ status: "measured", value: 21.34 });
    expect(summary.tiltedYield.period).toMatchObject({ status: "measured", value: 543.26 });
    expect(summary.periodEnergy.vertical).toMatchObject({ status: "measured", value: 544.26 });
    expect(summary.recentEnergy.vertical).toMatchObject({ status: "measured", value: 17.73 });
    expect(summary.verticalYield.period).toMatchObject({ status: "measured", value: 383.28 });
  });

  it("separa las dos energías y trae la diferencia ya calculada", () => {
    // Given el mismo cuerpo real
    const body = dashboardPayload();

    // When se valida
    const { accounts } = parseOrThrow(body);

    // Then registrada, planta y no registrada son tres números distintos que
    // vienen del backend: el navegador no resta nada para obtener el tercero
    expect(accounts.recorded).toMatchObject({ status: "measured", value: 1392.12 });
    expect(accounts.plant).toMatchObject({ status: "measured", value: 1572.2 });
    expect(accounts.unrecorded).toMatchObject({ status: "measured", value: 902.15 });
    expect(accounts.daysWithAcClose).toBe(228);
    expect(accounts.daysWithLifetimeCounter).toBe(105);
  });

  it("ancla la ventana reciente al último día con datos y no al calendario", () => {
    // Given un cuerpo cuyo último dato es del 2026-06-01
    const body = dashboardPayload();

    // When se valida
    const summary = parseOrThrow(body);

    // Then los «últimos 7 días» terminan el 2026-06-02 exclusivo, o sea el
    // 2026-06-01: nunca contra la fecha de hoy
    expect(summary.recentWindow).toEqual({ from: "2026-05-26", toExclusive: "2026-06-02" });
    expect(summary.recentWindowDays).toBe(7);
  });

  it("convierte una métrica con n = 0 en ausente CON motivo, jamás en cero", () => {
    // Given la respuesta de un rango sin lecturas, como la manda el servicio
    const body = dashboardPayload({
      energia_periodo: {
        total_ac_kwh: { valor: null, n: 0, unidad: "kWh", motivo: "sin_lecturas" },
        inclinado_kwh: { valor: null, n: 0, unidad: "kWh", motivo: "sin_lecturas" },
        vertical_kwh: { valor: null, n: 0, unidad: "kWh", motivo: "sin_lecturas" },
      },
    });

    // When se valida
    const { periodEnergy } = parseOrThrow(body);

    // Then la métrica es `missing`, trae el motivo y NO existe el campo `value`
    expect(periodEnergy.totalAc.status).toBe("missing");
    expect(periodEnergy.totalAc).not.toHaveProperty("value");
    expect(periodEnergy.totalAc).toMatchObject({ reason: "sin_lecturas", count: 0 });
  });

  it("sobrevive a un bloque de confianza con otra forma", () => {
    // Given un `confianza` que perdió los campos que el contrato esperaba
    const body = dashboardPayload({ confianza: { forma: "nueva", inesperada: true } });

    // When se valida
    const summary = parseOrThrow(body);

    // Then se pierde el contexto, no las nueve casillas: el tablero sigue en pie
    expect(summary.confidence).toBeNull();
    expect(summary.periodEnergy.totalAc).toMatchObject({ status: "measured" });
  });

  it("acepta que no haya ventana reciente cuando no hubo ningún día con datos", () => {
    // Given la respuesta de un rango fuera de cobertura
    const body = dashboardPayload({ ventana_reciente: null });

    // When se valida
    const summary = parseOrThrow(body);

    // Then la ventana reciente es nula y la vista tendrá que decirlo
    expect(summary.recentWindow).toBeNull();
  });

  it("rechaza un cuerpo que no cumple el contrato en vez de inventar campos", () => {
    // Given una respuesta a la que le falta el bloque de energía del período
    const body = dashboardPayload();
    delete (body as Record<string, unknown>).energia_periodo;

    // When se valida
    const result = dashboardSummarySchema.safeParse(body);

    // Then falla: un 200 con la forma equivocada es un fallo, no un vacío
    expect(result.success).toBe(false);
  });
});
