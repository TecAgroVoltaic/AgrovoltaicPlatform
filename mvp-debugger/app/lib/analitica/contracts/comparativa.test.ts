// Lo que estas pruebas protegen: que un MENSAJE ausente no tumbe la respuesta.
//
// El backend anula sus textos cuando no hay nada que decir, y eso depende del
// rango. Con `advertencia` tipada como obligatoria, un período donde el contador
// cubre todos los días válidos hacía fallar el esquema ENTERO: la vista perdía
// las seis variantes, el PR mes a mes y el detalle diario, no el párrafo del
// aviso. El caso vive acá y no en un componente porque el daño es del contrato.
import { describe, expect, it } from "vitest";

import {
  comparisonWire,
  COUNTER_UNIT_NOTE,
  ENERGY_PATHS_WARNING,
  ENERGY_PATHS_WITHOUT_WARNING,
  performanceWire,
} from "@/app/components/analitica/comparativa/fixtures";
import {
  arrayComparisonSchema,
  performanceReportSchema,
} from "@/app/lib/analitica/contracts/comparativa";

function parsePerformance(body: unknown) {
  const result = performanceReportSchema.safeParse(body);
  if (!result.success) throw new Error(result.error.message);
  return result.data;
}

/** Un mes sin banderas: el backend omite `supera_limite_fisico` si nada lo supera. */
const UNFLAGGED_MONTH = {
  mes: "2026-05",
  pr: {
    contador: {
      ghi: { inclinado: null, vertical: null },
      poa_bifacial: { inclinado: null, vertical: null },
      poa_frontal: { inclinado: null, vertical: null },
    },
    integral: {
      ghi: { inclinado: 0.71, vertical: 0.5 },
      poa_bifacial: { inclinado: null, vertical: null },
      poa_frontal: { inclinado: null, vertical: null },
    },
  },
};

describe("performanceReportSchema", () => {
  it("acepta el informe cuando la advertencia de energía viaja en null", () => {
    // Given un rango donde el contador cubre TODOS los días válidos, así que el
    // servicio manda `fuente_energia.advertencia: null`
    const body = performanceWire({ fuente_energia: ENERGY_PATHS_WITHOUT_WARNING });

    // When se valida contra el contrato
    const report = parsePerformance(body);

    // Then el aviso llega como ausencia y el resto del informe sigue entero: la
    // matriz de seis variantes y los meses no se pierden por un párrafo
    expect(report.energyPaths.warning).toBeNull();
    expect(report.energyPaths.counterUnitNote).toBe(COUNTER_UNIT_NOTE);
    expect(report.matrix.integral.ghi.inclinado.pr).toBe(0.733);
    expect(report.months).toHaveLength(1);
  });

  it("conserva la advertencia tal cual cuando el servicio sí la manda", () => {
    // Given el histórico completo, donde el contador cubre 91 de 197 días
    const body = performanceWire();

    // When se valida
    const report = parsePerformance(body);

    // Then el texto llega sin reescribir: quien lo redacta es el backend
    expect(report.energyPaths.warning).toBe(ENERGY_PATHS_WARNING);
  });

  it("acepta que los campos de mensaje falten por completo, no solo que sean null", () => {
    // Given una respuesta muda de verdad: sin la clave `fuera_de_cobertura` y
    // sin las banderas del mes, que es como el backend omite lo que no aplica
    const body = performanceWire({
      fuente_energia: ENERGY_PATHS_WITHOUT_WARNING,
      por_mes: [UNFLAGGED_MONTH],
      cobertura_poa: {},
    });

    // When se valida
    const report = parsePerformance(body);

    // Then la ausencia se traduce a null y a lista vacía, y nada se rechaza
    expect(report.poaOutOfCoverage).toBeNull();
    expect(report.months[0].exceedsPhysicalLimit).toEqual([]);
    expect(report.matrix.contador.ghi.inclinado.warning).toBeNull();
    expect(report.matrix.contador.ghi.inclinado.reason).toBeNull();
  });
});

describe("arrayComparisonSchema", () => {
  it("acepta el período sin ganador y sin advertencia de estacionalidad", () => {
    // Given un rango donde a un arreglo le falta energía para comparar
    const body = comparisonWire({
      diferencia: { ganador: null, lectura: "no se pueden comparar: falta energía" },
    });

    // When se valida
    const result = arrayComparisonSchema.safeParse(body);

    // Then parsea y las dos ausencias llegan como null, no como texto vacío
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.difference.winner).toBeNull();
    expect(result.data.seasonality.warning).toBeNull();
  });
});
