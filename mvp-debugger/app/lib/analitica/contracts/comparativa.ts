// Contrato de la vista Comparativa: `GET /analitica/comparativa` (energía, curva
// horaria y estacionalidad) y `GET /analitica/rendimiento` (el PR diario y
// mensual con sus seis variantes). Derivado del payload REAL verificado con curl
// contra `:8010`, no de lo que la documentación supone.
//
// UNA SOLA MUESTRA NO ALCANZA. Los campos de MENSAJE del servicio (`advertencia`,
// `aviso`, `motivo`, `fuera_de_cobertura`) son opcionales por diseño: el backend
// los manda en null cuando no hay nada que decir, y eso depende del RANGO. Este
// contrato se derivó del histórico completo, donde `fuente_energia.advertencia`
// existía, y se rompió entero apenas alguien eligió un período donde el contador
// cubre todos los días. Un mensaje va SIEMPRE `.nullish()` con `?? null`; quien
// agregue uno lo verifica en varios rangos, incluido uno vacío y uno de un día.
//
// EXCEPCIÓN AL LÍMITE DE 150 LÍNEAS, declarada: acá viven los dos endpoints que
// la vista lee siempre juntos, y son ~200 líneas de esquema cada uno. No hay
// lógica, solo la forma del cable y su traducción; se lee de arriba abajo y cada
// bloque es independiente. La división natural es un archivo por endpoint, y hay
// que hacerla EN CUANTO el PR gane un segundo consumidor (el tablero ya tiene
// pensado leer `analitica/rendimiento`): ahí `PerformanceReport` deja de ser un
// detalle de esta vista y pasa a ser contrato compartido.
//
// Los tokens del cable (`contador`, `poa_frontal`, `inclinado`) NO se traducen a
// inglés: el backend los concatena en rutas como `"contador/poa_frontal/vertical"`
// para marcar qué variante supera el límite físico, y traducir las claves
// obligaría a destraducir esas rutas en cada comparación. Los NOMBRES de campo sí
// van en inglés; lo que se conserva son los VALORES que manda el servicio.
import { z } from "zod";

import { analysisResponse, type AnalysisWindow } from "@/app/lib/analitica/contracts/envelope";
import { metricSchema, type Metric } from "@/app/lib/analitica/contracts/metric";

export type EnergySource = "contador" | "integral";
export type IrradianceInput = "ghi" | "poa_bifacial" | "poa_frontal";
export type ArrayKey = "inclinado" | "vertical";
/** Cómo el backend nombra una celda de la matriz cuando la marca. */
export type VariantPath = `${EnergySource}/${IrradianceInput}/${ArrayKey}`;

const inputEnum = z.enum(["ghi", "poa_bifacial", "poa_frontal"]);
const wholeDays = z.number().int().nonnegative();
const nullableNumber = z.number().nullish();

const byArray = <TCell extends z.ZodTypeAny>(cell: TCell) =>
  z.object({ inclinado: cell, vertical: cell });
const byInput = <TPair extends z.ZodTypeAny>(pair: TPair) =>
  z.object({ ghi: pair, poa_bifacial: pair, poa_frontal: pair });
const bySource = <TRow extends z.ZodTypeAny>(row: TRow) =>
  z.object({ contador: row, integral: row });

/** Un PR agregado del período, con todo lo que hace falta para no leerlo mal. */
export type PerformanceCell = {
  readonly pr: number | null;
  readonly days: number;
  readonly daysAboveOne: number;
  readonly maxDailyPr: number | null;
  /** Un PR > 1 es imposible: lo marca el backend, acá no se decide nada. */
  readonly exceedsPhysicalLimit: boolean;
  /** Por qué ese PR no se puede leer como rendimiento. Ya viene redactado. */
  readonly warning: string | null;
  /** Por qué no hay número (`sin_lecturas`, `fuera_de_cobertura`). */
  readonly reason: string | null;
};

const cellSchema = z
  .object({
    pr: z.number().nullable(),
    dias: wholeDays,
    dias_pr_mayor_a_uno: wholeDays,
    pr_diario_maximo: nullableNumber,
    supera_limite_fisico: z.boolean().nullish(),
    aviso: z.string().nullish(),
    motivo: z.string().nullish(),
  })
  .transform((raw): PerformanceCell => ({
    pr: raw.pr,
    days: raw.dias,
    daysAboveOne: raw.dias_pr_mayor_a_uno,
    maxDailyPr: raw.pr_diario_maximo ?? null,
    exceedsPhysicalLimit: raw.supera_limite_fisico === true,
    warning: raw.aviso ?? null,
    reason: raw.motivo ?? null,
  }));

export type PerformancePair = Readonly<Record<ArrayKey, PerformanceCell>>;
export type PerformanceMatrix = Readonly<
  Record<EnergySource, Readonly<Record<IrradianceInput, PerformancePair>>>
>;
export type MonthlyPr = Readonly<
  Record<EnergySource, Readonly<Record<IrradianceInput, Readonly<Record<ArrayKey, number | null>>>>>
>;

export type MonthlyPerformance = {
  readonly month: string;
  readonly pr: MonthlyPr;
  /** Rutas `fuente/insumo/arreglo` que superan el límite físico ese mes. */
  readonly exceedsPhysicalLimit: readonly string[];
};

const monthlySchema = z
  .object({
    mes: z.string(),
    pr: bySource(byInput(byArray(z.number().nullable()))),
    supera_limite_fisico: z.array(z.string()).nullish(),
  })
  .transform((raw): MonthlyPerformance => ({
    month: raw.mes,
    pr: raw.pr,
    exceedsPhysicalLimit: raw.supera_limite_fisico ?? [],
  }));

/** Por qué los dos caminos de energía NUNCA se funden en el mismo número: el
 *  contador cubre menos de la mitad de los días válidos y su subconjunto no
 *  representa el año. Los dos textos vienen redactados del backend.
 *
 *  `warning` es null cuando el contador cubre TODOS los días válidos: ahí no hay
 *  nada que advertir. Ausencia de aviso, no aviso vacío. */
export type EnergyPaths = {
  readonly warning: string | null;
  readonly counterUnitNote: string;
};

const energyPathsSchema = z
  .object({ advertencia: z.string().nullish(), unidad_contador: z.string() })
  .transform((raw): EnergyPaths => ({
    warning: raw.advertencia ?? null,
    counterUnitNote: raw.unidad_contador,
  }));

/** R2: la ecuación de transposición todavía la tiene que confirmar Hugo. */
export type PendingApproval = {
  readonly provisionalInputs: readonly IrradianceInput[];
  readonly approver: string;
  readonly reference: string;
  readonly detail: string;
};

const pendingApprovalSchema = z
  .object({
    insumos_provisionales: z.array(inputEnum),
    quien: z.string(),
    referencia: z.string(),
    detalle: z.string(),
  })
  .transform((raw): PendingApproval => ({
    provisionalInputs: raw.insumos_provisionales,
    approver: raw.quien,
    reference: raw.referencia,
    detail: raw.detalle,
  }));

export type ValidDayCriterion = {
  readonly minCoverage: number;
  readonly maxOffsetHours: number;
  readonly explanation: string;
};

const criterionSchema = z
  .object({
    cobertura_minima: z.number(),
    desfase_maximo_h: z.number(),
    explicacion: z.string(),
  })
  .transform((raw): ValidDayCriterion => ({
    minCoverage: raw.cobertura_minima,
    maxOffsetHours: raw.desfase_maximo_h,
    explanation: raw.explicacion,
  }));

export type DiscardedDay = {
  readonly day: string;
  readonly reasons: readonly string[];
  readonly radiationCoverage: number | null;
  readonly electricalCoverage: number | null;
  readonly offsetHours: number | null;
};

const discardedDaySchema = z
  .object({
    dia: z.string(),
    motivos_descarte: z.array(z.string()),
    cobertura_radiacion: nullableNumber,
    cobertura_electrico: nullableNumber,
    desfase_h: nullableNumber,
  })
  .transform((raw): DiscardedDay => ({
    day: raw.dia,
    reasons: raw.motivos_descarte,
    radiationCoverage: raw.cobertura_radiacion ?? null,
    electricalCoverage: raw.cobertura_electrico ?? null,
    offsetHours: raw.desfase_h ?? null,
  }));

export type DayCounts = {
  readonly withData: number;
  readonly valid: number;
  readonly discarded: number;
  /** Solo con `detalle=true`. El anexo de los días que no entraron. */
  readonly discardedDetail: readonly DiscardedDay[] | null;
};

const dayCountsSchema = z
  .object({
    con_dato: wholeDays,
    validos: wholeDays,
    descartados: wholeDays,
    detalle_descartados: z.array(discardedDaySchema).nullish(),
  })
  .transform((raw): DayCounts => ({
    withData: raw.con_dato,
    valid: raw.validos,
    discarded: raw.descartados,
    discardedDetail: raw.detalle_descartados ?? null,
  }));

/** Un día del renglón diario. El motivo de descarte NO se repite acá: viaja en
 *  el anexo `discardedDetail`, que es donde se lee día por día. */
export type DailyPerformance = {
  readonly day: string;
  readonly valid: boolean;
  readonly pr: Readonly<Record<EnergySource, Readonly<Record<ArrayKey, number | null>>>>;
};

const dailySchema = z
  .object({
    dia: z.string(),
    valido: z.boolean(),
    pr: z.object({ por_fuente: bySource(byArray(z.number().nullable())) }),
  })
  .transform((raw): DailyPerformance => ({
    day: raw.dia,
    valid: raw.valido,
    pr: raw.pr.por_fuente,
  }));

export type PerformanceReport = {
  readonly window: AnalysisWindow;
  readonly dailyInput: IrradianceInput;
  readonly criterion: ValidDayCriterion;
  readonly dayCounts: DayCounts;
  readonly months: readonly MonthlyPerformance[];
  readonly matrix: PerformanceMatrix;
  readonly energyPaths: EnergyPaths;
  readonly pendingApproval: PendingApproval;
  /** Solo con `detalle=true`: los 228 días, uno por uno. */
  readonly days: readonly DailyPerformance[] | null;
  /** Por qué las variantes POA no existen en este rango, si es el caso. */
  readonly poaOutOfCoverage: string | null;
};

export const performanceReportSchema = analysisResponse({
  insumo_del_detalle_diario: inputEnum,
  criterio_dia_valido: criterionSchema,
  dias: dayCountsSchema,
  por_mes: z.array(monthlySchema),
  total: bySource(byInput(byArray(cellSchema))),
  fuente_energia: energyPathsSchema,
  aval_pendiente: pendingApprovalSchema,
  por_dia: z.array(dailySchema).nullish(),
  cobertura_poa: z.object({ fuera_de_cobertura: z.string().nullish() }),
}).transform(({ window, payload }): PerformanceReport => ({
  window,
  dailyInput: payload.insumo_del_detalle_diario,
  criterion: payload.criterio_dia_valido,
  dayCounts: payload.dias,
  months: payload.por_mes,
  matrix: payload.total,
  energyPaths: payload.fuente_energia,
  pendingApproval: payload.aval_pendiente,
  days: payload.por_dia ?? null,
  poaOutOfCoverage: payload.cobertura_poa.fuera_de_cobertura ?? null,
}));

export type ArrayTotals = {
  readonly energy: Metric;
  readonly specificYield: Metric;
  readonly readings: number;
};

const totalsSchema = z
  .object({
    energia_wh: metricSchema,
    rendimiento_especifico_kwh_kwp: metricSchema,
    lecturas: wholeDays,
  })
  .transform((raw): ArrayTotals => ({
    energy: raw.energia_wh,
    specificYield: raw.rendimiento_especifico_kwh_kwp,
    readings: raw.lecturas,
  }));

export type EnergyDifference = {
  readonly winner: ArrayKey | null;
  /** Frase ya redactada por el backend. Acá no se resta nada. */
  readonly reading: string;
};

export type HourlyPoint = {
  readonly hour: number;
  readonly tiltedW: number | null;
  readonly verticalW: number | null;
};

export type SeasonalMonth = {
  readonly month: string;
  readonly coverage: number;
  readonly daysWithData: number;
  readonly tiltedWh: number | null;
  readonly verticalWh: number | null;
};

export type DiscardedMonth = {
  readonly month: string;
  readonly coverage: number;
  readonly reason: string;
};

export type Seasonality = {
  readonly sufficient: boolean;
  readonly months: readonly SeasonalMonth[];
  readonly discarded: readonly DiscardedMonth[];
  readonly minCoverage: number;
  readonly warning: string | null;
};

const seasonalitySchema = z
  .object({
    suficiente: z.boolean(),
    meses: z.array(
      z.object({
        mes: z.string(),
        cobertura: z.number(),
        dias_con_datos: wholeDays,
        energia_inclinado_wh: nullableNumber,
        energia_vertical_wh: nullableNumber,
      }),
    ),
    descartados: z.array(
      z.object({ mes: z.string(), cobertura: z.number(), motivo: z.string() }),
    ),
    cobertura_minima: z.number(),
    advertencia: z.string().nullish(),
  })
  .transform((raw): Seasonality => ({
    sufficient: raw.suficiente,
    months: raw.meses.map((month) => ({
      month: month.mes,
      coverage: month.cobertura,
      daysWithData: month.dias_con_datos,
      tiltedWh: month.energia_inclinado_wh ?? null,
      verticalWh: month.energia_vertical_wh ?? null,
    })),
    discarded: raw.descartados.map((month) => ({
      month: month.mes,
      coverage: month.cobertura,
      reason: month.motivo,
    })),
    minCoverage: raw.cobertura_minima,
    warning: raw.advertencia ?? null,
  }));

/** El cruce punto a punto de 5 min. El backend insiste en que NO es un PR. */
export type PointToPointCross = {
  readonly yieldByArray: Readonly<Record<ArrayKey, Metric>>;
  readonly readingsByArray: Readonly<Record<ArrayKey, number>>;
  readonly note: string;
};

const crossArraySchema = z.object({ kwh_por_kwh_m2: metricSchema, lecturas: wholeDays });

const crossSchema = z
  .object({ inclinado: crossArraySchema, vertical: crossArraySchema, nota: z.string() })
  .transform((raw): PointToPointCross => ({
    yieldByArray: {
      inclinado: raw.inclinado.kwh_por_kwh_m2,
      vertical: raw.vertical.kwh_por_kwh_m2,
    },
    readingsByArray: { inclinado: raw.inclinado.lecturas, vertical: raw.vertical.lecturas },
    note: raw.nota,
  }));

export type ArrayComparison = {
  readonly window: AnalysisWindow;
  readonly totals: Readonly<Record<ArrayKey, ArrayTotals>>;
  readonly difference: EnergyDifference;
  readonly hourly: readonly HourlyPoint[];
  /** Qué arreglo gana a cada hora, ya resuelto por el backend. */
  readonly hourlyReading: string;
  readonly cross: PointToPointCross;
  readonly seasonality: Seasonality;
};

export const arrayComparisonSchema = analysisResponse({
  totales: byArray(totalsSchema),
  diferencia: z.object({
    ganador: z.enum(["inclinado", "vertical"]).nullish(),
    lectura: z.string(),
  }),
  curva_horaria: z.array(
    z.object({
      hora: z.number().int(),
      inclinado_w: nullableNumber,
      vertical_w: nullableNumber,
    }),
  ),
  separacion_horaria: z.object({ lectura: z.string() }),
  emparejamiento_5min: crossSchema,
  estacionalidad: seasonalitySchema,
}).transform(({ window, payload }): ArrayComparison => ({
  window,
  totals: payload.totales,
  difference: {
    winner: payload.diferencia.ganador ?? null,
    reading: payload.diferencia.lectura,
  },
  hourly: payload.curva_horaria.map((point) => ({
    hour: point.hora,
    tiltedW: point.inclinado_w ?? null,
    verticalW: point.vertical_w ?? null,
  })),
  hourlyReading: payload.separacion_horaria.lectura,
  cross: payload.emparejamiento_5min,
  seasonality: payload.estacionalidad,
}));
