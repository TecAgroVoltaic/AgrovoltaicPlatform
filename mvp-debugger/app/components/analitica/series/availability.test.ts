// Lo que estas pruebas protegen: que la vista sepa decir CUÁL de los tres vacíos
// le tocó. El backend responde 200 con todo en null tanto cuando el sensor no
// estaba puesto como cuando no hubo lecturas, así que si esta decisión se
// equivoca, un gráfico vacío pasa a mentir sobre su propia causa.
import { describe, expect, it } from "vitest";

import { availabilityOf, coverageOf } from "@/app/components/analitica/series/availability";
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

// Tal como los publica `GET /analitica/variables`.
const REFLECTED = variable({
  key: "irradiancia_reflejada_wm2",
  label: "Irradiancia reflejada",
  unit: "W/m2",
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

describe("availabilityOf", () => {
  it("una variable que aún no se medía da OUT_OF_COVERAGE y lo explica", () => {
    // Given la irradiancia reflejada (instalada el 2025-10-25) y un rango anterior
    const availability = availabilityOf(REFLECTED, range("2025-01-01", "2025-06-01"));

    // When se lee el motivo
    // Then es la cobertura, no la falta de filas, y el texto lo dice
    expect(availability.status).toBe("unavailable");
    if (availability.status !== "unavailable") return;
    expect(availability.reason.code).toBe("OUT_OF_COVERAGE");
    expect(availability.reason.message).toContain("2025-10-25");
    expect(availability.reason.message).toMatch(/nunca coexistieron/i);
  });

  it("el borde de la ventana entra: un solo día en común ya es solape", () => {
    // Given el primer día de la reflejada y dos rangos que lo rozan
    const before = availabilityOf(REFLECTED, range("2025-10-24", "2025-10-25"));
    const touching = availabilityOf(REFLECTED, range("2025-10-24", "2025-10-26"));

    // When se comparan
    // Then el fin exclusivo se respeta: uno queda fuera y el otro dentro
    expect(before.status).toBe("unavailable");
    expect(touching.status).toBe("available");
  });

  it("una ventana cerrada por arriba incluye su último día", () => {
    // Given el SP722, que corrió del 2026-05-11 al 2026-05-28 y se detuvo
    // When se evalúan el último día y el siguiente
    // Then `dato_hasta` es inclusivo, así que el 28 entra y el 29 ya no
    expect(availabilityOf(SP722, range("2026-05-28", "2026-05-29")).status).toBe("available");
    expect(availabilityOf(SP722, range("2026-05-29", "2026-06-02")).status).toBe("unavailable");
  });

  it("el gate es `graficable`, y el porqué sale de `fuente_ausente` tal cual", () => {
    // Given una variable que el backend marca como no graficable, con su prosa
    const wind = variable({
      key: "velocidad_viento_ms",
      label: "Velocidad del viento",
      family: "ambiental",
      plottable: false,
      missingSource: "no hay anemometro en el sitio ni en las tablas ingestadas",
    });

    // When se decide si pedirla
    const availability = availabilityOf(wind, range("2026-05-01", "2026-06-02"));

    // Then el motivo es NO_SOURCE y se muestra la explicación del backend, sin
    // reescribirla ni deducirla de otro campo
    expect(availability.status).toBe("unavailable");
    if (availability.status !== "unavailable") return;
    expect(availability.reason.code).toBe("NO_SOURCE");
    expect(availability.reason.message).toContain("no hay anemometro");
  });

  it("no graficable manda sobre la cobertura, aunque el rango se solape", () => {
    // Given una variable sin fuente cuyo tramo de existencia sí cubre el rango
    const ambient = variable({ plottable: false, missingSource: "ninguna tabla la contiene" });

    // When se evalúa dentro de la cobertura de la base
    const availability = availabilityOf(ambient, range("2026-05-01", "2026-06-02"));

    // Then no se disfraza de problema de rango: no se arregla moviéndolo
    expect(availability.status).toBe("unavailable");
    if (availability.status !== "unavailable") return;
    expect(availability.reason.code).toBe("NO_SOURCE");
  });

  it("una variable sin ventana propia se cubre con la de la base", () => {
    // Given la potencia del inclinado, con `dato_desde` y `dato_hasta` en null
    const power = variable();

    // When se mira su cobertura y se la evalúa contra un rango con datos
    // Then hereda los límites verificados de la base y el rango es consultable
    expect(coverageOf(power)).toEqual({ from: "2024-11-10", toExclusive: "2026-06-02" });
    expect(availabilityOf(power, range("2026-05-01", "2026-06-02")).status).toBe("available");
  });
});
