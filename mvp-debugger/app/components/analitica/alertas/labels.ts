// Las palabras de la vista Alertas, en un solo sitio. La interfaz habla de
// «aprobar» y «olvidar» (lo que pidió el equipo); el contrato, de «reconocer» y
// «descartar». Los estados se nombran con la palabra de la acción que llevó a
// ellos, para que botón y etiqueta no digan cosas distintas.
import type { AnalyticsFailure } from "@/app/lib/analitica/errors";
import type { StatusFilter } from "@/app/lib/alertas/query";
import type { AlertAction, AlertEventType, AlertStatus } from "@/app/lib/alertas/vocabulary";

export const STATUS_LABEL: Readonly<Record<AlertStatus, string>> = {
  new: "Nueva",
  acknowledged: "Aprobada",
  tracking: "En seguimiento",
  resolved: "Resuelta",
  dismissed: "Olvidada",
};

export const STATUS_FILTER_LABEL: Readonly<Record<StatusFilter, string>> = {
  open: "Abiertas",
  closed: "Cerradas",
  ...STATUS_LABEL,
  all: "Todas",
};

export const STATUS_FILTER_OPTIONS: readonly StatusFilter[] = [
  "open",
  "new",
  "acknowledged",
  "tracking",
  "resolved",
  "dismissed",
  "all",
];

export const EVENT_LABEL: Readonly<Record<AlertEventType, string>> = {
  created: "Creada",
  occurrence: "Nueva ocurrencia",
  acknowledged: "Aprobada",
  followUp: "Seguimiento",
  note: "Nota",
  resolved: "Resuelta",
  dismissed: "Olvidada",
  reopened: "Reabierta",
};

export const ACTION_LABEL: Readonly<Record<AlertAction, string>> = {
  acknowledge: "Aprobar",
  followUp: "Dar seguimiento",
  resolve: "Resolver",
  dismiss: "Olvidar",
  reopen: "Reabrir",
};

export const ACTION_PENDING_LABEL: Readonly<Record<AlertAction, string>> = {
  acknowledge: "Aprobando…",
  followUp: "Guardando…",
  resolve: "Resolviendo…",
  dismiss: "Olvidando…",
  reopen: "Reabriendo…",
};

/** Títulos cortos para el filtro; la ficha usa el título completo del backend. */
export const TYPE_LABEL: Readonly<Record<string, string>> = {
  inversor_parado_con_sol: "Inversor parado con sol",
  sensor_temperatura_saturado: "Sensor de temperatura saturado",
  irradiancia_imposible: "Irradiancia imposible",
  incongruencia_temp_irradiancia: "Temperatura vs. irradiancia",
};

export function typeLabel(type: string): string {
  return TYPE_LABEL[type] ?? type;
}

/** `*` = el día entero de la fuente. Hoy solo lo usa `inversor_parado_con_sol`,
 *  que junta en UNA alerta las tres variables AC del mismo apagón. */
const ALL_VARIABLES = "*";

export function variableLabel(variable: string): string {
  return variable === ALL_VARIABLES ? "todas las variables AC" : variable;
}

/** El encabezado de un fallo dice QUIÉN falló; el detalle, qué pasó. Que el
 *  servicio no responda y que responda mal piden cosas distintas a quien mira. */
export function describeFailure(failure: AnalyticsFailure): string {
  switch (failure.code) {
    case "NETWORK":
    case "TIMEOUT":
    case "SERVICE_UNAVAILABLE":
      return `El servicio de alertas no respondió: ${failure.message}.`;
    case "UNAUTHORIZED":
      return `No se pudieron leer las alertas: ${failure.message}.`;
    case "UPSTREAM_ERROR":
    case "MALFORMED_RESPONSE":
      return `El servicio de alertas respondió con un error: ${failure.message}.`;
  }
}
