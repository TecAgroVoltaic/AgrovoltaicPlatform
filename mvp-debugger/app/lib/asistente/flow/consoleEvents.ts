// Los eventos que la consola ya sabe leer (contrato §3 de `/chat/stream`, ver
// `contracts/chatEvents.ts`), del lado de quien los ESCRIBE. El adaptador de Flow
// produce exactamente estos, así el cliente no distingue de qué motor vienen.

export type ConsoleEventName = "inicio" | "texto" | "tool_inicio" | "paso" | "fin" | "error";

export type ConsoleEvent = {
  readonly name: ConsoleEventName;
  readonly data: Readonly<Record<string, unknown>>;
};

/** Códigos del evento `error` que nacen en el adaptador (el backend tiene los suyos). */
export const FLOW_ERROR_CODE = {
  flowFailed: "flow_fallo",
  nodeFailed: "flow_nodo",
  malformedEvent: "flow_evento_invalido",
} as const;

/** Genérico a propósito, igual que `chat_sse.py`: el detalle del runtime puede
 *  traer cuerpos del proveedor del modelo y va al log del servidor. */
export const FLOW_ERROR_MESSAGE = {
  [FLOW_ERROR_CODE.flowFailed]: "El agente de Visione Flow no pudo terminar la respuesta. El detalle quedó registrado en el servidor.",
  [FLOW_ERROR_CODE.nodeFailed]: "Falló un paso del agente de Visione Flow. El detalle quedó registrado en el servidor.",
  [FLOW_ERROR_CODE.malformedEvent]: "Visione Flow respondió con un evento de formato inesperado.",
} as const;

export type FlowErrorCode = (typeof FLOW_ERROR_CODE)[keyof typeof FLOW_ERROR_CODE];

export function errorEvent(code: FlowErrorCode): ConsoleEvent {
  return { name: "error", data: { mensaje: FLOW_ERROR_MESSAGE[code], codigo: code } };
}

/** Un evento como bloque SSE, igual que `chat_sse.formatear`. */
export function formatSseEvent(event: ConsoleEvent): string {
  return `event: ${event.name}\ndata: ${JSON.stringify(event.data)}\n\n`;
}
