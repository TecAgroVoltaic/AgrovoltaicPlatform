// Respuestas de mentira con la forma REAL del cable, para las pruebas.
//
// Se arman como las manda el servicio y se pasan por el esquema de verdad: así
// una prueba de componente falla también cuando el backend renombra un campo, y
// no solo cuando cambia la pantalla. Los números salen de la medición del
// 2026-08-31 sobre la ventana 2025-09-01 / 2026-06-02.
import {
  arrayComparisonSchema,
  performanceReportSchema,
  type ArrayComparison,
  type PerformanceReport,
} from "@/app/lib/analitica/contracts/comparativa";

const WINDOW = { desde: "2025-09-01", hasta: "2026-06-02", dias: 274, granularidad: "semana" };
const CONFIDENCE = { dias_con_datos: 228 };
const VALID_DAYS = 197;
const COUNTER_DAYS = 91;

type Cell = Record<string, unknown>;

function cell(pr: number | null, days: number, extra: Cell = {}): Cell {
  return { pr, dias: days, dias_pr_mayor_a_uno: 0, pr_diario_maximo: pr, ...extra };
}

/** La celda que el backend marca: PR mayor que 1, imposible. */
export const IMPOSSIBLE_WARNING =
  "PR 1.217 > 1.0: fisicamente imposible. No es un buen rendimiento, es que la " +
  "irradiancia con que se juzga este arreglo esta subestimada";

const impossibleCell = (days: number): Cell =>
  cell(1.217, days, {
    dias_pr_mayor_a_uno: 138,
    pr_diario_maximo: 3.185,
    supera_limite_fisico: true,
    aviso: IMPOSSIBLE_WARNING,
  });

const pair = (tilted: Cell, vertical: Cell) => ({ inclinado: tilted, vertical });

// El contador cubre 91 de los 197 días válidos: cada variante se agrega sobre SU
// propio conjunto de días, y la fixture lo refleja.
const MATRIX = {
  contador: {
    ghi: pair(cell(0.677, COUNTER_DAYS), cell(0.485, COUNTER_DAYS)),
    poa_bifacial: pair(cell(0.615, COUNTER_DAYS), cell(0.607, COUNTER_DAYS)),
    poa_frontal: pair(cell(0.699, COUNTER_DAYS), impossibleCell(COUNTER_DAYS)),
  },
  integral: {
    ghi: pair(cell(0.733, VALID_DAYS), cell(0.517, VALID_DAYS)),
    poa_bifacial: pair(cell(0.648, VALID_DAYS), cell(0.612, VALID_DAYS)),
    poa_frontal: pair(cell(0.738, VALID_DAYS), impossibleCell(VALID_DAYS)),
  },
};

const missingCell = (motivo: string): Cell => ({
  pr: null,
  dias: 0,
  dias_pr_mayor_a_uno: 0,
  pr_diario_maximo: null,
  motivo,
});

const missingPair = (motivo: string) => pair(missingCell(motivo), missingCell(motivo));

/** Rango sin una sola fila: el PR viaja en null CON motivo, nunca en cero. */
const EMPTY_MATRIX = {
  contador: {
    ghi: missingPair("sin_lecturas"),
    poa_bifacial: missingPair("fuera_de_cobertura"),
    poa_frontal: missingPair("fuera_de_cobertura"),
  },
  integral: {
    ghi: missingPair("sin_lecturas"),
    poa_bifacial: missingPair("fuera_de_cobertura"),
    poa_frontal: missingPair("fuera_de_cobertura"),
  },
};

export const POA_OUT_OF_COVERAGE =
  "la ventana termina el 2025-01-31 y estas variables no existen antes del 2025-09-05";

const MONTHLY_PR = {
  contador: {
    ghi: { inclinado: null, vertical: null },
    poa_bifacial: { inclinado: null, vertical: null },
    poa_frontal: { inclinado: null, vertical: null },
  },
  integral: {
    ghi: { inclinado: 0.723, vertical: 0.501 },
    poa_bifacial: { inclinado: 0.619, vertical: 0.538 },
    poa_frontal: { inclinado: 0.711, vertical: 1.199 },
  },
};

export const ENERGY_PATHS_WARNING =
  "el contador (camino principal) cubre 91 de 197 dias validos y la integral de la " +
  "potencia el resto. Los dos agregados se reportan por separado y NUNCA se mezclan";

export const COUNTER_UNIT_NOTE = "estan en kWh pese al sufijo _wh";

/** Lo que manda el servicio cuando el contador cubre TODOS los días válidos: no
 *  hay sesgo de muestreo que advertir y el aviso viaja en null, no en "". Pasa
 *  en rangos cortos, y es el caso que rompía la vista entera. */
export const ENERGY_PATHS_WITHOUT_WARNING = {
  advertencia: null,
  unidad_contador: COUNTER_UNIT_NOTE,
};

export function performanceWire(overrides: Record<string, unknown> = {}): unknown {
  return {
    ventana: WINDOW,
    confianza: CONFIDENCE,
    insumo_del_detalle_diario: "ghi",
    criterio_dia_valido: {
      cobertura_minima: 0.9,
      desfase_maximo_h: 0.5,
      explicacion: "el que de verdad filtra es el desfase",
    },
    dias: { con_dato: 228, validos: VALID_DAYS, descartados: 31 },
    por_mes: [
      { mes: "2025-11", pr: MONTHLY_PR, supera_limite_fisico: ["integral/poa_frontal/vertical"] },
    ],
    total: MATRIX,
    fuente_energia: {
      advertencia: ENERGY_PATHS_WARNING,
      unidad_contador: COUNTER_UNIT_NOTE,
    },
    aval_pendiente: {
      insumos_provisionales: ["poa_bifacial", "poa_frontal"],
      quien: "Hugo",
      referencia: "R2 de Leo Cardinale, 2026-08-30",
      detalle: "R2 confirma el PRINCIPIO pero deja abierta CUAL ecuacion de transposicion usar",
    },
    cobertura_poa: { fuera_de_cobertura: null },
    ...overrides,
  };
}

export function performanceReport(overrides: Record<string, unknown> = {}): PerformanceReport {
  return performanceReportSchema.parse(performanceWire(overrides));
}

/** El informe de un rango vacío: 200, todo en null y con su motivo. */
export function emptyPerformanceReport(): PerformanceReport {
  return performanceReport({
    total: EMPTY_MATRIX,
    por_mes: [],
    dias: { con_dato: 0, validos: 0, descartados: 0 },
    cobertura_poa: { fuera_de_cobertura: POA_OUT_OF_COVERAGE },
  });
}

const metric = (valor: number | null, unidad: string, motivo?: string) => ({
  valor,
  n: valor === null ? 0 : 28996,
  unidad,
  ...(motivo ? { motivo } : {}),
});

const totalsFor = (energy: number | null, specific: number | null, missing?: string) => ({
  energia_wh: metric(energy, "Wh", missing),
  rendimiento_especifico_kwh_kwp: metric(specific, "kWh/kWp", missing),
  lecturas: energy === null ? 0 : 28996,
});

export function comparisonWire(overrides: Record<string, unknown> = {}): unknown {
  return {
    ventana: WINDOW,
    confianza: CONFIDENCE,
    totales: {
      inclinado: totalsFor(771431.5, 543.262),
      vertical: totalsFor(544256.6, 383.279),
    },
    diferencia: {
      ganador: "inclinado",
      lectura: "el arreglo inclinado genero 227.17 kWh mas que el vertical (41.7% mas)",
    },
    curva_horaria: [
      { hora: 11, inclinado_w: 1044.2, vertical_w: 767.9 },
      { hora: 15, inclinado_w: 401.1, vertical_w: 468.0 },
    ],
    separacion_horaria: { lectura: "el inclinado aventaja al vertical en las horas 7-13" },
    emparejamiento_5min: {
      inclinado: { kwh_por_kwh_m2: metric(0.883, "kWh por kWh/m2"), lecturas: 3041 },
      vertical: { kwh_por_kwh_m2: metric(0.889, "kWh por kWh/m2"), lecturas: 3022 },
      nota: "cruce punto a punto sobre las MISMAS ventanas de 5 min. NO es un Performance Ratio",
    },
    estacionalidad: {
      suficiente: true,
      meses: [
        {
          mes: "2025-11",
          cobertura: 0.933,
          dias_con_datos: 28,
          energia_inclinado_wh: 67418.06,
          energia_vertical_wh: 47711.3,
        },
      ],
      descartados: [{ mes: "2025-09", cobertura: 0.267, motivo: "cobertura_insuficiente" }],
      cobertura_minima: 0.6,
      advertencia: null,
    },
    ...overrides,
  };
}

export function arrayComparison(overrides: Record<string, unknown> = {}): ArrayComparison {
  return arrayComparisonSchema.parse(comparisonWire(overrides));
}

/** Lo que devuelve el servicio para un rango sin una sola fila: 200 con los
 *  números en null y un motivo, jamás un cero. */
export const EMPTY_TOTALS = {
  inclinado: totalsFor(null, null, "sin_lecturas"),
  vertical: totalsFor(null, null, "sin_lecturas"),
};

export { COUNTER_DAYS, VALID_DAYS };
