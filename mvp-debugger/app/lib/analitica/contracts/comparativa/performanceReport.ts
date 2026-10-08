// Contrato de `GET /analitica/rendimiento`: el PR diario y mensual con sus seis
// variantes. Lo lee la Comparativa y está pensado para el tablero.
import { z } from "zod";

import { analysisResponse, type AnalysisWindow } from "@/app/lib/analitica/contracts/envelope";
import { dailySchema, type DailyPerformance } from "@/app/lib/analitica/contracts/comparativa/dailyPerformance";
import { dayCountsSchema, type DayCounts } from "@/app/lib/analitica/contracts/comparativa/dayCounts";
import { energyPathsSchema, type EnergyPaths } from "@/app/lib/analitica/contracts/comparativa/energyPaths";
import {
  monthlySchema,
  type MonthlyPerformance,
} from "@/app/lib/analitica/contracts/comparativa/monthlyPerformance";
import {
  pendingApprovalSchema,
  type PendingApproval,
} from "@/app/lib/analitica/contracts/comparativa/pendingApproval";
import { cellSchema, type PerformanceMatrix } from "@/app/lib/analitica/contracts/comparativa/performanceCell";
import {
  byArray,
  byInput,
  bySource,
  inputEnum,
  type IrradianceInput,
} from "@/app/lib/analitica/contracts/comparativa/shared";
import {
  criterionSchema,
  type ValidDayCriterion,
} from "@/app/lib/analitica/contracts/comparativa/validDayCriterion";

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
