// Lo que estas pruebas protegen: los BORDES de la ventana de cada variable y el
// hueco que un par de fechas no puede contar.
//
// El criterio tiene que ser el mismo que el del backend y el que ya prueban las
// dos vistas: el fin del rango es EXCLUSIVO y `dato_hasta` es INCLUSIVO. Un día
// de corrimiento acá deja en blanco justo los dieciocho días en que el SP722 sí
// midió, o al revés, consulta una ventana en la que nunca hubo dato.
import { describe, expect, it } from "vitest";

import {
  VERIFIED_COVERAGE,
  variableCoverage,
  variableWindow,
} from "@/app/lib/analitica/coverage";
import type { CatalogVariable } from "@/app/lib/analitica/contracts/variables";
import type { DateRange } from "@/app/lib/analitica/dateRange";

function range(from: string, toExclusive: string): DateRange {
  return { from, toExclusive, granularity: "day" };
}

function variable(overrides: Partial<CatalogVariable> = {}): CatalogVariable {
  return {
    key: "potencia_pv1_w",
    label: "Potencia PV1 (inclinado)",
    unit: "W",
    family: "electrico",
    from: null,
    until: null,
    innerGap: null,
    missingSource: null,
    plottable: true,
    ...overrides,
  };
}

// Tal como los publica hoy `GET /analitica/variables`.
const REFLECTED = variable({
  key: "irradiancia_reflejada_wm2",
  label: "Irradiancia reflejada",
  family: "radiacion",
  from: "2025-10-25",
});
const SP722 = variable({
  key: "irradiancia_incidente_sp722_wm2",
  label: "Irradiancia incidente SP722",
  family: "radiacion",
  from: "2026-05-11",
  until: "2026-05-28",
});
const DC_ENERGY = variable({
  key: "energia_pv1_wh",
  label: "Energia DC del dia de PV1 (contador, kWh)",
  unit: "kWh",
  innerGap: "solo 144 dias con dato, y NI UNO entre 2025-11 y 2026-02",
});

describe("variableWindow", () => {
  it("una variable sin ventana propia hereda la de la base", () => {
    // Given la potencia del inclinado, con `dato_desde` y `dato_hasta` en null
    // When se pide su ventana
    // Then es la cobertura verificada de la Supabase, ni más ni menos
    expect(variableWindow(variable())).toEqual({
      from: VERIFIED_COVERAGE.from,
      toExclusive: VERIFIED_COVERAGE.toExclusive,
    });
  });

  it("el último día del catálogo es inclusivo y se convierte a fin exclusivo", () => {
    // Given el SP722, que midió hasta el 2026-05-28 inclusive
    // When se pide su ventana
    // Then el fin exclusivo es el día siguiente, o se perdería el 28 entero
    expect(variableWindow(SP722)).toEqual({ from: "2026-05-11", toExclusive: "2026-05-29" });
  });
});

describe("variableCoverage", () => {
  it("un rango que termina donde la variable empieza NO la toca", () => {
    // Given un rango cuyo fin exclusivo es el primer día de la reflejada
    const gap = variableCoverage(REFLECTED, range("2025-01-01", "2025-10-25")).gap;

    // When se lee el motivo
    // Then no hay solape, y el texto dice desde cuándo existe
    expect(gap?.code).toBe("OUT_OF_COVERAGE");
    expect(gap?.message).toContain("2025-10-25");
  });

  it("un solo día en común ya es solape", () => {
    // Given un rango que llega hasta el día siguiente al primero de la reflejada
    // When se pregunta por la cobertura
    // Then el borde entra: hay algo que consultar
    expect(variableCoverage(REFLECTED, range("2025-10-24", "2025-10-26")).gap).toBeNull();
  });

  it("el último día con dato entra, y el siguiente ya no", () => {
    // Given el SP722, que corrió del 2026-05-11 al 2026-05-28 y se detuvo
    // When se evalúan el último día y el posterior
    // Then el 28 se puede consultar y el 29 en adelante no
    expect(variableCoverage(SP722, range("2026-05-28", "2026-05-29")).gap).toBeNull();
    expect(variableCoverage(SP722, range("2026-05-29", "2026-06-02")).gap).not.toBeNull();
  });

  it("el hueco INTERIOR se informa aunque el rango sí se solape", () => {
    // Given la energía DC de PV1, que cubre 144 días con un agujero por dentro,
    // y un rango que la toca de sobra
    const coverage = variableCoverage(DC_ENERGY, range("2025-09-01", "2026-06-02"));

    // When se lee la cobertura
    // Then no hay motivo de vacío, pero el hueco viaja igual: una curva que se
    // ve entera no delata los cuatro meses que le faltan por dentro
    expect(coverage.gap).toBeNull();
    expect(coverage.innerGap).toContain("NI UNO entre 2025-11 y 2026-02");
  });

  it("una variable sin fuente da NO_SOURCE con la prosa del backend, tal cual", () => {
    // Given una variable que el backend marca como no graficable
    const wind = variable({
      key: "velocidad_viento_ms",
      label: "Velocidad del viento",
      family: "ambiental",
      plottable: false,
      missingSource: "no hay anemometro en el sitio ni en las tablas ingestadas",
    });

    // When se evalúa DENTRO de la cobertura de la base
    const gap = variableCoverage(wind, range("2026-05-01", "2026-06-02")).gap;

    // Then el gate `graficable` corta primero: no se disfraza de problema de
    // rango, porque mover el rango no lo arregla nunca
    expect(gap?.code).toBe("NO_SOURCE");
    expect(gap?.message).toContain("no hay anemometro");
  });
});
