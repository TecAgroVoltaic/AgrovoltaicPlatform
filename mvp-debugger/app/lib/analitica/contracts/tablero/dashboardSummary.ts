// Contrato del tablero (las nueve casillas de la Fig. 2): lo que devuelve
// `GET /analitica/resumen`.
import { z } from "zod";

import { analysisResponse, type AnalysisWindow } from "@/app/lib/analitica/contracts/envelope";
import { wholeDays } from "@/app/lib/analitica/contracts/primitives";
import { readConfidence, type DashboardConfidence } from "@/app/lib/analitica/contracts/tablero/confidence";
import { accountsSchema, type EnergyAccounts } from "@/app/lib/analitica/contracts/tablero/energyAccounts";
import { energyByArraySchema, type EnergyByArray } from "@/app/lib/analitica/contracts/tablero/energyByArray";
import { freshnessSchema, type Freshness } from "@/app/lib/analitica/contracts/tablero/freshness";
import { specificYieldSchema, type SpecificYield } from "@/app/lib/analitica/contracts/tablero/specificYield";
import type { DateRange } from "@/app/lib/analitica/dateRange";

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
