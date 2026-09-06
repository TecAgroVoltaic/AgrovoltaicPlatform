// Lo que estas pruebas protegen: la afirmación que sostiene toda la vista, que
// es que el ganador NO depende del método.
//
// Se prueba en el modelo y no solo en la pantalla porque acá viven las dos
// reglas que la hacen honesta: un método con un PR imposible nunca declara
// ganador, y el ganador se toma del backend en vez de deducirse por mayoría.
import { describe, expect, it } from "vitest";

import { agreementWith, cutsOf } from "@/app/components/analitica/comparativa/cuts";
import {
  arrayComparison,
  COUNTER_DAYS,
  emptyPerformanceReport,
  performanceReport,
  VALID_DAYS,
} from "@/app/components/analitica/comparativa/fixtures";

const CUTS_WITH_CROSS = 7;
const CUTS_WITHOUT_CROSS = 6;
const READABLE_CUTS = 5;
const AGREEING_CUTS = 4;

describe("cutsOf", () => {
  it("arma los seis métodos del PR más el cruce, cada uno con su muestra", () => {
    // Given el histórico completo: el contador cubre 91 de los 197 días válidos
    const cuts = cutsOf(performanceReport(), arrayComparison());

    // When se leen las muestras
    // Then los dos caminos de energía conservan cada uno las suyas y el cruce
    // trae las lecturas que logró emparejar, que son otra unidad
    expect(cuts).toHaveLength(CUTS_WITH_CROSS);
    const counter = cuts.filter((cut) => cut.id.startsWith("contador/"));
    const integral = cuts.filter((cut) => cut.id.startsWith("integral/"));
    expect(counter.every((cut) => cut.sample.value === COUNTER_DAYS)).toBe(true);
    expect(integral.every((cut) => cut.sample.value === VALID_DAYS)).toBe(true);
    expect(counter.every((cut) => cut.sample.total === VALID_DAYS)).toBe(true);
    expect(cuts[CUTS_WITH_CROSS - 1].sample).toEqual({
      value: 3041,
      total: 28996,
      unit: "lecturas",
    });
  });

  it("el método con un PR imposible no declara ganador", () => {
    // Given el período completo, donde el vertical contra POA frontal da 1,217
    const cuts = cutsOf(performanceReport(), arrayComparison());

    // When se miran los métodos que el backend marcó
    const impossible = cuts.filter((cut) => cut.status === "impossible");

    // Then son los dos de POA frontal y ninguno deja a nadie arriba
    expect(impossible.map((cut) => cut.id)).toEqual([
      "contador/poa_frontal",
      "integral/poa_frontal",
    ]);
    expect(impossible.every((cut) => cut.leader === null)).toBe(true);
  });

  it("el cruce punto a punto es el único que deja arriba al vertical", () => {
    // Given los métodos del período completo
    const cuts = cutsOf(performanceReport(), arrayComparison());

    // When se agrupa por quién queda arriba
    const tilted = cuts.filter((cut) => cut.leader === "inclinado");
    const vertical = cuts.filter((cut) => cut.leader === "vertical");

    // Then cuatro dan el inclinado y el que discrepa es el que menos muestra tiene
    expect(tilted).toHaveLength(AGREEING_CUTS);
    expect(vertical).toHaveLength(1);
    expect(vertical[0].label).toContain("Cruce punto a punto");
  });

  it("sin la comparación cargada quedan los seis del PR y ningún hueco", () => {
    // Given un rango en que la consulta del cruce se cayó
    const cuts = cutsOf(performanceReport(), null);

    // When se cuenta la lista
    // Then no aparece una fila del cruce vacía: sencillamente no está
    expect(cuts).toHaveLength(CUTS_WITHOUT_CROSS);
    expect(cuts.some((cut) => cut.label.includes("Cruce"))).toBe(false);
  });

  it("un método sin número trae el motivo del backend y no cuenta como comparable", () => {
    // Given un rango sin una sola fila, que vuelve con 200 y los PR en null
    const cuts = cutsOf(emptyPerformanceReport(), arrayComparison());

    // When se leen los seis métodos del PR
    const withoutData = cuts.filter((cut) => cut.status === "missing");

    // Then todos explican por qué faltan y ninguno declara ganador
    expect(withoutData).toHaveLength(CUTS_WITHOUT_CROSS);
    expect(withoutData[0].note).toMatch(/no hay ni una lectura de esta variable/);
    expect(withoutData.every((cut) => cut.leader === null)).toBe(true);
  });
});

describe("agreementWith", () => {
  it("cuenta los métodos comparables que coinciden con el ganador del backend", () => {
    // Given los siete métodos del período completo
    const cuts = cutsOf(performanceReport(), arrayComparison());

    // When se cuentan contra el ganador que declaró el servicio
    const agreement = agreementWith("inclinado", cuts);

    // Then coinciden cuatro de los cinco comparables: los dos imposibles no compiten
    expect(agreement).toEqual({ agreeing: AGREEING_CUTS, comparable: READABLE_CUTS });
  });

  it("sin ganador declarado no inventa una mayoría", () => {
    // Given un período que el backend dejó sin ganador
    const cuts = cutsOf(performanceReport(), arrayComparison());

    // When se pide la coincidencia sin ganador
    const agreement = agreementWith(null, cuts);

    // Then no coincide ninguno, aunque haya cinco métodos comparables
    expect(agreement).toEqual({ agreeing: 0, comparable: READABLE_CUTS });
  });
});
