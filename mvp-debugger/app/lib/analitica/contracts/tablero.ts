// Barril del contrato del tablero (las nueve casillas de la Fig. 2): lo que
// devuelve `GET /analitica/resumen`. Cada esquema vive en `tablero/`. Derivado
// del payload REAL del servicio, verificado con `curl` contra `:8010`, no de lo
// que la documentación supone.
//
// Dos cuidados que no son cosméticos:
// 1. Todo escalar pasa por `metricSchema`, así que un `valor: null` con n = 0
//    llega como `missing` CON motivo y jamás como cero.
// 2. `confianza` se valida aparte y sin lanzar: su forma la sigue moviendo el
//    backend, y una casilla de energía no puede quedarse en blanco porque un
//    bloque de contexto ganó un campo.
export type { Freshness, FreshnessState } from "@/app/lib/analitica/contracts/tablero/freshness";
export type { EnergyByArray } from "@/app/lib/analitica/contracts/tablero/energyByArray";
export type { SpecificYield } from "@/app/lib/analitica/contracts/tablero/specificYield";
export type { EnergyAccounts } from "@/app/lib/analitica/contracts/tablero/energyAccounts";
export type { Availability } from "@/app/lib/analitica/contracts/tablero/availability";
export type { DashboardConfidence } from "@/app/lib/analitica/contracts/tablero/confidence";
export {
  dashboardSummarySchema,
  type DashboardSummary,
} from "@/app/lib/analitica/contracts/tablero/dashboardSummary";
