// El vocabulario cerrado de las alertas (contrato §4.1): estados, gravedades y
// tipos de evento. El backend habla castellano; acá se traduce una sola vez y el
// resto de la aplicación solo conoce los identificadores en inglés.
//
// Cada mapa es un `Record` sobre una unión literal: agregar un estado sin su
// traducción no compila.

export type AlertStatus = "new" | "acknowledged" | "tracking" | "resolved" | "dismissed";

export const ALERT_STATUS_WIRE: Readonly<Record<AlertStatus, string>> = {
  new: "nueva",
  acknowledged: "reconocida",
  tracking: "en_seguimiento",
  resolved: "resuelta",
  dismissed: "descartada",
};

export const ALL_ALERT_STATUSES: readonly AlertStatus[] = [
  "new",
  "acknowledged",
  "tracking",
  "resolved",
  "dismissed",
];

/** Lo que el backend lista por defecto y lo que cuenta como «abierta». */
export const OPEN_ALERT_STATUSES: readonly AlertStatus[] = ["new", "acknowledged", "tracking"];

/** Lo que ya no pide nada: resuelta u olvidada. Juntas forman la pestaña «Cerradas». */
export const CLOSED_ALERT_STATUSES: readonly AlertStatus[] = ["resolved", "dismissed"];

/** Subconjunto de la gravedad de calidad: una alerta nunca es informativa. */
export type AlertSeverity = "critical" | "warning";

export const ALERT_SEVERITY_WIRE: Readonly<Record<AlertSeverity, string>> = {
  critical: "grave",
  warning: "aviso",
};

export const ALL_ALERT_SEVERITIES: readonly AlertSeverity[] = ["critical", "warning"];

export type AlertEventType =
  | "created"
  | "occurrence"
  | "acknowledged"
  | "followUp"
  | "note"
  | "resolved"
  | "dismissed"
  | "reopened";

export const ALERT_EVENT_TYPE_WIRE: Readonly<Record<AlertEventType, string>> = {
  created: "creada",
  occurrence: "ocurrencia",
  acknowledged: "reconocida",
  followUp: "seguimiento",
  note: "nota",
  resolved: "resuelta",
  dismissed: "descartada",
  reopened: "reabierta",
};

/** Las acciones de la ficha. El valor es el último tramo de la ruta POST. */
export type AlertAction = "acknowledge" | "followUp" | "resolve" | "dismiss" | "reopen";

export const ALERT_ACTION_PATH: Readonly<Record<AlertAction, string>> = {
  acknowledge: "reconocer",
  followUp: "seguimiento",
  resolve: "resolver",
  dismiss: "descartar",
  reopen: "reabrir",
};

/** Los tipos v1 (contrato §4.3). El tipo viaja como texto libre: uno nuevo del
 *  backend se muestra con su clave cruda en vez de romper la lista. */
export const KNOWN_ALERT_TYPES: readonly string[] = [
  "inversor_parado_con_sol",
  "sensor_temperatura_saturado",
  "irradiancia_imposible",
  "incongruencia_temp_irradiancia",
];

/** Lectura del cable: de la palabra del backend al identificador. Se arma
 *  desde la lista de claves para que el tipo salga sin casteos. */
export type WireReader<TKey extends string> = ReadonlyMap<string, TKey>;

export function wireReader<TKey extends string>(
  keys: readonly TKey[],
  map: Readonly<Record<TKey, string>>,
): WireReader<TKey> {
  return new Map(keys.map((key) => [map[key], key]));
}

export const STATUS_FROM_WIRE = wireReader(ALL_ALERT_STATUSES, ALERT_STATUS_WIRE);
export const SEVERITY_FROM_WIRE = wireReader(ALL_ALERT_SEVERITIES, ALERT_SEVERITY_WIRE);
export const EVENT_TYPE_FROM_WIRE = wireReader(
  [
    "created",
    "occurrence",
    "acknowledged",
    "followUp",
    "note",
    "resolved",
    "dismissed",
    "reopened",
  ] satisfies readonly AlertEventType[],
  ALERT_EVENT_TYPE_WIRE,
);
