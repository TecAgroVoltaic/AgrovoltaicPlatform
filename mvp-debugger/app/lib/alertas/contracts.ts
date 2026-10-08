// Contratos de `/alertas/*` (docs/referencia/contratos-asistente-alertas.md §4.5).
// Se valida en la frontera y se traduce a inglés acá, una sola vez: ningún
// componente sabe que el backend dice `en_seguimiento`. Barril: cada parte del
// contrato vive en `contracts/`.
export { alertSchema, alertEventSchema, type Alert, type AlertEvent } from "./contracts/alert";
export {
  alertsPageSchema,
  alertsSummarySchema,
  alertDetailSchema,
  evaluationResultSchema,
  alertActionResponseSchema,
  type AlertsPage,
  type AlertsSummary,
  type AlertDetail,
  type EvaluationResult,
} from "./contracts/responses";
export { alertConflictSchema, type AlertConflict } from "./contracts/conflict";
