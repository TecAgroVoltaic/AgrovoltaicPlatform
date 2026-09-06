// Fallos de la capa de datos, con código. Sin códigos, cada vista termina
// comparando cadenas de texto para decidir si ofrece reintentar, y el día que
// alguien reescribe un mensaje se rompe una decisión de interfaz sin que nada
// avise.
import { MSG_APAGADO } from "@/app/lib/horario";

export type AnalyticsFailureCode =
  /** El fetch ni salió: sin red, CORS, o el navegador lo cortó. */
  | "NETWORK"
  /** Salió y no volvió a tiempo. */
  | "TIMEOUT"
  /** La cookie de sesión venció: hay que volver a entrar. */
  | "UNAUTHORIZED"
  /** El servicio Python no responde. En este proyecto suele ser el apagado
   *  programado del servidor de datos, no una avería. */
  | "SERVICE_UNAVAILABLE"
  /** Respondió, pero con un error suyo (4xx/5xx con cuerpo). */
  | "UPSTREAM_ERROR"
  /** Respondió 200 con algo que no cumple el contrato: es un fallo igual, y
   *  callarlo dejaría a la vista pintando `undefined`. */
  | "MALFORMED_RESPONSE";

export type AnalyticsFailure = {
  readonly code: AnalyticsFailureCode;
  /** Mensaje ya redactado para mostrarle a la persona, en español. */
  readonly message: string;
  readonly status?: number;
  /** Detalle técnico para la consola del navegador, nunca para la pantalla. */
  readonly detail?: string;
};

export type AnalyticsResult<TData> =
  | { readonly ok: true; readonly data: TData }
  | { readonly ok: false; readonly failure: AnalyticsFailure };

export const FAILURE_MESSAGE: Readonly<Record<AnalyticsFailureCode, string>> = {
  NETWORK: "no se pudo contactar al servidor",
  TIMEOUT: "el servidor tardó demasiado en responder",
  UNAUTHORIZED: "la sesión venció: recargá la página para volver a entrar",
  SERVICE_UNAVAILABLE: MSG_APAGADO,
  UPSTREAM_ERROR: "el servicio de análisis devolvió un error",
  MALFORMED_RESPONSE: "la respuesta del servicio no tiene la forma esperada",
};

/** Reintentar solo tiene sentido si el fallo puede pasar solo. Ni una sesión
 * vencida ni un contrato roto se arreglan pulsando otra vez. */
export function isRetryable(failure: AnalyticsFailure): boolean {
  return failure.code === "NETWORK" || failure.code === "TIMEOUT" || failure.code === "UPSTREAM_ERROR";
}

export function failure(
  code: AnalyticsFailureCode,
  extra: Omit<AnalyticsFailure, "code" | "message"> & { message?: string } = {},
): AnalyticsFailure {
  const { message, ...rest } = extra;
  return { code, message: message ?? FAILURE_MESSAGE[code], ...rest };
}
