// Contrato del tablero (las nueve casillas de la Fig. 2): lo que devuelve
// `GET /analitica/resumen`. Derivado del payload REAL del servicio, verificado
// con `curl` contra `:8010`, no de lo que la documentación supone.
//
// Dos cuidados que no son cosméticos:
// 1. Todo escalar pasa por `metricSchema`, así que un `valor: null` con n = 0
//    llega como `missing` CON motivo y jamás como cero.
// 2. `confianza` se valida aparte y sin lanzar: su forma la sigue moviendo el
//    backend, y una casilla de energía no puede quedarse en blanco porque un
//    bloque de contexto ganó un campo.
import { z } from "zod";

import { analysisResponse, type AnalysisWindow } from "@/app/lib/analitica/contracts/envelope";
import { metricSchema, type Metric } from "@/app/lib/analitica/contracts/metric";
import type { DateRange } from "@/app/lib/analitica/dateRange";

/** Qué tan viejo es el último dato. `stopped` es una alerta, no un dato neutro. */
export type FreshnessState = "up_to_date" | "lagging" | "stopped" | "no_data";

export type Freshness = {
  readonly state: FreshnessState;
  /** Marca del último registro. Es hora LOCAL de Costa Rica pese al `+00`. */
  readonly lastDataAt: string | null;
  readonly ageDays: number | null;
  readonly alarmingThresholdDays: number;
  /** Texto ya redactado por el backend, solo cuando el sistema se detuvo. */
  readonly message: string | null;
};

/** Las tres energías de una ventana: el total AC y cada arreglo. */
export type EnergyByArray = {
  readonly totalAc: Metric;
  readonly tilted: Metric;
  readonly vertical: Metric;
};

export type SpecificYield = { readonly period: Metric; readonly annualized: Metric };

/** Las DOS respuestas a «cuánta energía»: la que quedó registrada y la que
 * produjo la planta. `unrecorded` es la diferencia y la manda el backend: acá no
 * se resta nada. */
export type EnergyAccounts = {
  readonly recorded: Metric;
  readonly plant: Metric;
  readonly unrecorded: Metric;
  readonly daysWithAcClose: number;
  readonly daysWithLifetimeCounter: number;
};

/** La planta parada: una AVERÍA del equipo, no un problema del dato. Tiene tipo
 * propio para que ninguna vista la funda con la calidad. */
export type Availability = {
  readonly stoppedDays: number;
  readonly stoppedUnderSunDays: number;
  readonly ofDaysWithData: number;
  readonly warning: string;
};

export type DashboardConfidence = {
  readonly daysInRange: number;
  readonly daysWithData: number;
  readonly usableDays: number;
  readonly coverage: number;
  readonly warning: string | null;
  readonly availability: Availability | null;
};

export type DashboardSummary = {
  readonly window: AnalysisWindow;
  readonly confidence: DashboardConfidence | null;
  readonly freshness: Freshness;
  readonly periodEnergy: EnergyByArray;
  readonly recentEnergy: EnergyByArray;
  /** Los «últimos días» se cuentan contra el último día CON DATOS, no contra hoy. */
  readonly recentWindow: Pick<DateRange, "from" | "toExclusive"> | null;
  readonly recentWindowDays: number;
  readonly tiltedYield: SpecificYield;
  readonly verticalYield: SpecificYield;
  readonly accounts: EnergyAccounts;
  readonly daysWithData: number;
};

const FRESHNESS_BY_WIRE = {
  al_dia: "up_to_date",
  rezagada: "lagging",
  detenida: "stopped",
  sin_datos: "no_data",
} as const satisfies Readonly<Record<string, FreshnessState>>;

const wholeDays = z.number().int().nonnegative();

const freshnessSchema = z
  .object({
    ultimo_dato: z.string().nullish(),
    antiguedad_dias: z.number().int().nullish(),
    estado: z.enum(["al_dia", "rezagada", "detenida", "sin_datos"]),
    umbral_alarmante_dias: wholeDays,
    mensaje: z.string().nullish(),
  })
  .transform((raw): Freshness => ({
    state: FRESHNESS_BY_WIRE[raw.estado],
    lastDataAt: raw.ultimo_dato ?? null,
    ageDays: raw.antiguedad_dias ?? null,
    alarmingThresholdDays: raw.umbral_alarmante_dias,
    message: raw.mensaje ?? null,
  }));

const energyByArraySchema = z
  .object({ total_ac_kwh: metricSchema, inclinado_kwh: metricSchema, vertical_kwh: metricSchema })
  .transform((raw): EnergyByArray => ({
    totalAc: raw.total_ac_kwh,
    tilted: raw.inclinado_kwh,
    vertical: raw.vertical_kwh,
  }));

const specificYieldSchema = z
  .object({
    periodo_kwh_kwp: metricSchema,
    anualizado_sobre_dias_con_datos_kwh_kwp_ano: metricSchema,
  })
  .transform((raw): SpecificYield => ({
    period: raw.periodo_kwh_kwp,
    annualized: raw.anualizado_sobre_dias_con_datos_kwh_kwp_ano,
  }));

const accountsSchema = z
  .object({
    registrada_kwh: metricSchema,
    planta_kwh: metricSchema,
    no_registrada_kwh: metricSchema,
    dias_con_cierre_ac: wholeDays,
    dias_con_contador_de_vida: wholeDays,
  })
  .transform((raw): EnergyAccounts => ({
    recorded: raw.registrada_kwh,
    plant: raw.planta_kwh,
    unrecorded: raw.no_registrada_kwh,
    daysWithAcClose: raw.dias_con_cierre_ac,
    daysWithLifetimeCounter: raw.dias_con_contador_de_vida,
  }));

const availabilitySchema = z
  .object({
    dias_con_planta_parada: wholeDays,
    dias_parada_bajo_sol: wholeDays,
    de_dias_con_datos: wholeDays,
    advertencia: z.string(),
  })
  .transform((raw): Availability => ({
    stoppedDays: raw.dias_con_planta_parada,
    stoppedUnderSunDays: raw.dias_parada_bajo_sol,
    ofDaysWithData: raw.de_dias_con_datos,
    warning: raw.advertencia,
  }));

const confidenceSchema = z
  .object({
    dias_en_rango: wholeDays,
    dias_con_datos: wholeDays,
    dias_utilizables: wholeDays,
    cobertura: z.number(),
    advertencia: z.string().nullish(),
    disponibilidad: availabilitySchema.nullish(),
  })
  .transform((raw): DashboardConfidence => ({
    daysInRange: raw.dias_en_rango,
    daysWithData: raw.dias_con_datos,
    usableDays: raw.dias_utilizables,
    coverage: raw.cobertura,
    warning: raw.advertencia ?? null,
    availability: raw.disponibilidad ?? null,
  }));

/** Perder el contexto es malo; perder las nueve casillas por un campo nuevo en
 * el contexto sería peor. Por eso se lee con `safeParse` y no dentro del sobre. */
function readConfidence(raw: unknown): DashboardConfidence | null {
  const parsed = confidenceSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export const dashboardSummarySchema = analysisResponse({
  actualizacion: freshnessSchema,
  energia_periodo: energyByArraySchema,
  energia_reciente: energyByArraySchema,
  rendimiento_especifico: z.object({
    inclinado: specificYieldSchema,
    vertical: specificYieldSchema,
  }),
  energia_ac: accountsSchema,
  dias_con_datos: wholeDays,
  dias_ventana_reciente: wholeDays,
  ventana_reciente: z
    .object({ desde: z.string(), hasta: z.string() })
    .transform((raw) => ({ from: raw.desde, toExclusive: raw.hasta }))
    .nullish(),
}).transform(({ window, confidence, payload }): DashboardSummary => ({
  window,
  confidence: readConfidence(confidence),
  freshness: payload.actualizacion,
  periodEnergy: payload.energia_periodo,
  recentEnergy: payload.energia_reciente,
  recentWindow: payload.ventana_reciente ?? null,
  recentWindowDays: payload.dias_ventana_reciente,
  tiltedYield: payload.rendimiento_especifico.inclinado,
  verticalYield: payload.rendimiento_especifico.vertical,
  accounts: payload.energia_ac,
  daysWithData: payload.dias_con_datos,
}));
