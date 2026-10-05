// Lo que estas pruebas protegen: los BORDES de la ventana de cada variable.
//
// El criterio tiene que coincidir con el del backend (`catalogo.fuera_de_cobertura`):
// el fin del rango es EXCLUSIVO y el último día de la variable es INCLUSIVO. Un
// día de corrimiento acá dejaría en blanco justo los dieciocho días en que el
// SP722 sí midió, o al revés, consultaría una ventana en que nunca hubo dato.
import { describe, expect, it } from "vitest";

import {
  correlationTargetFor,
  coverageGap,
  findFocusVariable,
  DEFAULT_FOCUS_VARIABLE,
  INCIDENT_IRRADIANCE,
} from "@/app/components/analitica/estadistica/focusVariables";
import type { DateRange } from "@/app/lib/analitica/dateRange";

const SP722 = findFocusVariable("irradiancia_incidente_sp722_wm2");
const ALBEDO = findFocusVariable("albedo");
const INCLINED_POWER = findFocusVariable("potencia_pv1_w");

/** El SP722 existe del 2026-05-11 al 2026-05-28, los dos inclusive. */
const SP722_FIRST_DAY = "2026-05-11";
const SP722_LAST_DAY = "2026-05-28";

function range(from: string, toExclusive: string): DateRange {
  return { from, toExclusive, granularity: "day" };
}

describe("coverageGap", () => {
  it("un rango que termina justo donde el sensor empieza no lo toca", () => {
    // Given un rango cuyo fin exclusivo es el primer día del SP722
    const justBefore = range("2025-09-01", SP722_FIRST_DAY);

    // When se pregunta por la cobertura
    const gap = coverageGap(justBefore, SP722);

    // Then no se solapan, y el motivo dice cuánto duró el sensor
    expect(gap).toMatch(/dieciocho días/);
  });

  it("un solo día en común ya es cobertura", () => {
    // Given un rango que incluye el primer día del sensor y ninguno más
    const firstDayOnly = range("2025-09-01", "2026-05-12");

    // When se pregunta por la cobertura
    // Then hay algo que mirar
    expect(coverageGap(firstDayOnly, SP722)).toBeNull();
  });

  it("el último día del sensor entra: el fin del catálogo es inclusivo", () => {
    // Given un rango que arranca el último día en que el sensor midió
    const lastDayOnwards = range(SP722_LAST_DAY, "2026-06-02");

    // When se pregunta por la cobertura
    // Then ese día cuenta
    expect(coverageGap(lastDayOnwards, SP722)).toBeNull();
  });

  it("un rango posterior al último día del sensor queda fuera", () => {
    // Given un rango que empieza el día siguiente al último dato
    const afterTheEnd = range("2026-05-29", "2026-06-02");

    // When se pregunta por la cobertura
    // Then no hay nada que consultar
    expect(coverageGap(afterTheEnd, SP722)).not.toBeNull();
  });

  it("con dos variables basta que una no se solape", () => {
    // Given un rango dentro de la ventana del albedo pero anterior al SP722
    const autumn = range("2025-11-01", "2025-12-01");

    // When se cruzan las dos
    const gap = coverageGap(autumn, ALBEDO, SP722);

    // Then el motivo señala a la que falta, no a la que sí estaba
    expect(coverageGap(autumn, ALBEDO)).toBeNull();
    expect(gap).toMatch(/SP722/);
  });

  it("una variable del histórico completo no estorba a ningún rango con datos", () => {
    // Given el rango entero de la base
    const wholeHistory = range("2024-11-10", "2026-06-02");

    // When se pregunta por la potencia del Inclinado
    // Then no hay hueco de cobertura que declarar
    expect(coverageGap(wholeHistory, INCLINED_POWER)).toBeNull();
  });
});

describe("correlationTargetFor", () => {
  it("no enfrenta la irradiancia consigo misma", () => {
    // Given la irradiancia incidente puesta en foco
    // When se elige contra qué se dibuja la nube
    const target = correlationTargetFor(INCIDENT_IRRADIANCE);

    // Then cae a la potencia del Inclinado, que es una relación con sentido
    expect(target).toBe(DEFAULT_FOCUS_VARIABLE);
    expect(target).not.toBe(INCIDENT_IRRADIANCE);
  });

  it("cualquier otra variable se enfrenta a la irradiancia tal cual", () => {
    // Given una temperatura de módulo en foco
    const moduleTemperature = findFocusVariable("temp_vertical");

    // When se elige el objetivo de la correlación
    // Then es esa misma variable
    expect(correlationTargetFor(moduleTemperature)).toBe(moduleTemperature);
  });

  it("una clave desconocida cae al foco por defecto en vez de romper la vista", () => {
    // Given una clave que no está en el catálogo de la vista
    // When se busca
    // Then se devuelve el foco por defecto
    expect(findFocusVariable("no_existe")).toBe(DEFAULT_FOCUS_VARIABLE);
    expect(findFocusVariable(null)).toBe(DEFAULT_FOCUS_VARIABLE);
  });
});
