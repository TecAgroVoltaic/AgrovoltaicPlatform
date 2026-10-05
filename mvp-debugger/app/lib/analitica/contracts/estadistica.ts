// Los contratos de la vista Estadística: las cuatro respuestas que pinta, ya
// validadas en la frontera y traducidas al inglés una sola vez, como hace el
// sobre en `envelope.ts`.
//
// Derivados del payload REAL (curl contra :8010), no de la documentación. Tres
// cosas que solo se ven mirando el dato: un mes sin lecturas llega con los cinco
// números en `null` y `n = 0`; las densidades de las crestas llegan SIN
// normalizar (KDE crudo, máximo ~0,05); y un grupo fuera de su ventana llega con
// `fuera_de_cobertura` explicando entre qué fechas sí habría dato.
//
// LARGO: cinco contratos en un archivo. Es una tabla de correspondencias sin
// ramas ni lógica, y partirla obligaría a saltar entre archivos para leer la
// forma de UNA vista. La cohesión manda sobre el conteo de líneas.
import { z } from "zod";

import { analysisResponse } from "@/app/lib/analitica/contracts/envelope";
import { metricSchema } from "@/app/lib/analitica/contracts/metric";

const nullableNumber = z.number().nullable();
const countSchema = z.number().int().nonnegative();
const noteSchema = z.string().nullish();

const variableSchema = z
  .object({ clave: z.string(), etiqueta: z.string(), unidad: z.string() })
  .transform((raw) => ({ key: raw.clave, label: raw.etiqueta, unit: raw.unidad }));

/** Una variable del catálogo del backend, con su etiqueta y su unidad. */
export type AnalyzedVariable = z.infer<typeof variableSchema>;

// ── Fig. 6, panel superior: una caja por mes ─────────────────────────────────
// Los bigotes NO son el mínimo y el máximo: llegan al dato más extremo dentro de
// la valla 1,5·IQR. Viajan los dos pares porque un mes con una sola lectura
// tiene extremos pero no tiene vallas.
const monthlyBoxSchema = z
  .object({
    mes: z.string(),
    n: countSchema,
    minimo: nullableNumber,
    q1: nullableNumber,
    mediana: nullableNumber,
    q3: nullableNumber,
    maximo: nullableNumber,
    bigote_inferior: nullableNumber,
    bigote_superior: nullableNumber,
  })
  .transform((raw) => ({
    month: raw.mes,
    count: raw.n,
    minimum: raw.minimo,
    q1: raw.q1,
    median: raw.mediana,
    q3: raw.q3,
    maximum: raw.maximo,
    lowerWhisker: raw.bigote_inferior,
    upperWhisker: raw.bigote_superior,
  }));

export type MonthlyBox = z.infer<typeof monthlyBoxSchema>;

export const distributionResponseSchema = analysisResponse({
  variable: variableSchema,
  factor_iqr: z.number(),
  cajas: z.array(monthlyBoxSchema),
}).transform(({ payload, ...envelope }) => ({
  ...envelope,
  payload: { variable: payload.variable, iqrFactor: payload.factor_iqr, boxes: payload.cajas },
}));

export type DistributionResponse = z.infer<typeof distributionResponseSchema>;

// ── Fig. 6, panel GHI: irradiación acumulada por mes ─────────────────────────
const monthlyIrradiationSchema = z
  .object({ mes: z.string(), dias_con_dato: countSchema, irradiacion: metricSchema })
  .transform((raw) => ({
    month: raw.mes,
    daysWithData: raw.dias_con_dato,
    irradiation: raw.irradiacion,
  }));

export type MonthlyIrradiation = z.infer<typeof monthlyIrradiationSchema>;

export const irradiationResponseSchema = analysisResponse({
  variable: variableSchema,
  barras: z.array(monthlyIrradiationSchema),
  total: metricSchema,
}).transform(({ payload, ...envelope }) => ({
  ...envelope,
  payload: { variable: payload.variable, bars: payload.barras, total: payload.total },
}));

export type IrradiationResponse = z.infer<typeof irradiationResponseSchema>;

// ── Fig. 7: densidades por sensor ────────────────────────────────────────────
const densityGroupSchema = z
  .object({
    grupo: z.string(),
    etiqueta: z.string(),
    n: countSchema,
    n_usadas: countSchema,
    densidad: z.array(z.number()).nullable(),
    prob_sobre_umbral: metricSchema,
    fuera_de_cobertura: noteSchema,
  })
  .transform((raw) => ({
    key: raw.grupo,
    label: raw.etiqueta,
    readings: raw.n,
    usedReadings: raw.n_usadas,
    density: raw.densidad,
    tailProbability: raw.prob_sobre_umbral,
    outOfCoverage: raw.fuera_de_cobertura ?? null,
  }));

export type DensityGroup = z.infer<typeof densityGroupSchema>;

export const ridgesResponseSchema = analysisResponse({
  unidad: z.string(),
  rejilla: z.array(z.number()),
  umbral: nullableNumber,
  grupos: z.array(densityGroupSchema),
}).transform(({ payload, ...envelope }) => ({
  ...envelope,
  payload: {
    unit: payload.unidad,
    grid: payload.rejilla,
    threshold: payload.umbral,
    groups: payload.grupos,
  },
}));

export type RidgesResponse = z.infer<typeof ridgesResponseSchema>;

// ── Fig. 8: dispersión con ajuste OLS ────────────────────────────────────────
// `pares` y `puntos_mostrados` NO son el mismo número: el ajuste usa todos los
// pares y la nube viene adelgazada solo para dibujar.
const fitSchema = z
  .object({ pendiente: metricSchema, intercepto: metricSchema, r2: metricSchema })
  .transform((raw) => ({ slope: raw.pendiente, intercept: raw.intercepto, r2: raw.r2 }));

export const correlationResponseSchema = analysisResponse({
  x: variableSchema,
  y: variableSchema,
  pares: countSchema,
  lecturas_x: countSchema,
  lecturas_y: countSchema,
  ajuste: fitSchema,
  puntos: z.array(z.tuple([z.number(), z.number()])),
  puntos_mostrados: countSchema,
  submuestreado: z.boolean(),
  nota: noteSchema,
}).transform(({ payload, ...envelope }) => ({
  ...envelope,
  payload: {
    x: payload.x,
    y: payload.y,
    pairs: payload.pares,
    xReadings: payload.lecturas_x,
    yReadings: payload.lecturas_y,
    fit: payload.ajuste,
    points: payload.puntos,
    drawnPoints: payload.puntos_mostrados,
    subsampled: payload.submuestreado,
    note: payload.nota ?? null,
  },
}));

export type CorrelationResponse = z.infer<typeof correlationResponseSchema>;

// ── Fig. 8 bis: matriz día x hora ────────────────────────────────────────────
// `horas` son enteros 0..23 en hora LOCAL de Costa Rica, ya resuelta por el
// backend. La vista no convierte zona en ningún punto: hacerlo correría el
// mediodía solar seis horas.
export const folderResponseSchema = analysisResponse({
  variable: variableSchema,
  dias: z.array(z.string()),
  horas: z.array(z.number().int()),
  matriz: z.array(z.array(nullableNumber)),
  rango: z.object({ minimo: metricSchema, maximo: metricSchema }),
  celdas_con_dato: countSchema,
  celdas_totales: countSchema,
}).transform(({ payload, ...envelope }) => ({
  ...envelope,
  payload: {
    variable: payload.variable,
    days: payload.dias,
    hours: payload.horas,
    matrix: payload.matriz,
    range: { minimum: payload.rango.minimo, maximum: payload.rango.maximo },
    cellsWithData: payload.celdas_con_dato,
    totalCells: payload.celdas_totales,
  },
}));

export type FolderResponse = z.infer<typeof folderResponseSchema>;
