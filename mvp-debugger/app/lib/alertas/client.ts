"use client";
// Lecturas y acciones de `/alertas/*`, por el mismo proxy y con los mismos
// códigos de fallo que el resto de la capa de análisis (`app/lib/analitica`).
// Barril: las lecturas viven en `client/reads.ts` y las acciones, con su
// lectura de los 409 y el 422, en `client/actions.ts`.
export {
  fetchAlertsPage,
  fetchLatestOpenOutage,
  fetchAlertsSummary,
  fetchAlertDetail,
  runEvaluation,
} from "./client/reads";
export {
  INVALID_TRANSITION_MESSAGE,
  OPEN_ALERT_EXISTS_MESSAGE,
  VALIDATION_MESSAGE,
  runAlertAction,
  type AlertActionInput,
  type AlertActionOutcome,
} from "./client/actions";
