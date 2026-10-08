// Barril del contrato de la vista Comparativa: `GET /analitica/comparativa`
// (energía, curva horaria y estacionalidad) y `GET /analitica/rendimiento` (el PR
// diario y mensual con sus seis variantes). Cada esquema vive en `comparativa/`.
// Derivado del payload REAL verificado con curl contra `:8010`, no de lo que la
// documentación supone.
//
// UNA SOLA MUESTRA NO ALCANZA. Los campos de MENSAJE del servicio (`advertencia`,
// `aviso`, `motivo`, `fuera_de_cobertura`) son opcionales por diseño: el backend
// los manda en null cuando no hay nada que decir, y eso depende del RANGO. Este
// contrato se derivó del histórico completo, donde `fuente_energia.advertencia`
// existía, y se rompió entero apenas alguien eligió un período donde el contador
// cubre todos los días. Un mensaje va SIEMPRE `.nullish()` con `?? null`; quien
// agregue uno lo verifica en varios rangos, incluido uno vacío y uno de un día.
export type {
  ArrayKey,
  EnergySource,
  IrradianceInput,
  VariantPath,
} from "@/app/lib/analitica/contracts/comparativa/shared";
export type {
  PerformanceCell,
  PerformanceMatrix,
  PerformancePair,
} from "@/app/lib/analitica/contracts/comparativa/performanceCell";
export type {
  MonthlyPerformance,
  MonthlyPr,
} from "@/app/lib/analitica/contracts/comparativa/monthlyPerformance";
export type { EnergyPaths } from "@/app/lib/analitica/contracts/comparativa/energyPaths";
export type { PendingApproval } from "@/app/lib/analitica/contracts/comparativa/pendingApproval";
export type { ValidDayCriterion } from "@/app/lib/analitica/contracts/comparativa/validDayCriterion";
export type { DayCounts, DiscardedDay } from "@/app/lib/analitica/contracts/comparativa/dayCounts";
export type { DailyPerformance } from "@/app/lib/analitica/contracts/comparativa/dailyPerformance";
export {
  performanceReportSchema,
  type PerformanceReport,
} from "@/app/lib/analitica/contracts/comparativa/performanceReport";
export type { ArrayTotals } from "@/app/lib/analitica/contracts/comparativa/arrayTotals";
export type {
  DiscardedMonth,
  SeasonalMonth,
  Seasonality,
} from "@/app/lib/analitica/contracts/comparativa/seasonality";
export type { PointToPointCross } from "@/app/lib/analitica/contracts/comparativa/pointToPointCross";
export {
  arrayComparisonSchema,
  type ArrayComparison,
  type EnergyDifference,
  type HourlyPoint,
} from "@/app/lib/analitica/contracts/comparativa/arrayComparison";
