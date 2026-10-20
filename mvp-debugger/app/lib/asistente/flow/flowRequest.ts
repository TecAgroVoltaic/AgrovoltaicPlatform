// El cuerpo que manda la consola (`{mensajes, contexto, hilo}`, el mismo de
// `/chat/stream`) → el del canal web de Flow (`{message, history, metadata,
// sessionId}`). El historial viaja entero desde la consola (opción A del plan):
// Flow lo usa en lugar de su memoria de sesión cuando el runtime lo acepta.
import { z } from "zod";

import { describeFirstIssue } from "@/app/lib/asistente/contracts/issues";

/** Topes del historial que acepta el canal web (fase 1 del runtime): pasarlos
 *  es un 400 de Flow, así que se recorta antes de mandar. */
export const MAX_FLOW_HISTORY = 40;
export const MAX_FLOW_HISTORY_CONTENT = 20_000;

/** Prefijo de la sesión en Flow: así las conversaciones de la consola se
 *  reconocen en la bandeja del agente. */
const SESSION_PREFIX = "consola-";

const consoleChatBodySchema = z.object({
  mensajes: z
    .array(z.object({ rol: z.enum(["user", "assistant"]), texto: z.string() }))
    .min(1, "falta la pregunta"),
  contexto: z.string().optional(),
  hilo: z.string().min(1).optional(),
});

export type FlowChatRequest = {
  readonly message: string;
  readonly history: readonly { readonly role: "user" | "assistant"; readonly content: string }[];
  readonly metadata: { readonly contexto?: string };
  readonly sessionId: string;
};

export type FlowRequestParse =
  | { readonly ok: true; readonly request: FlowChatRequest }
  | { readonly ok: false; readonly error: string };

/** `newSessionId` se usa solo si el pedido no trae hilo: sin `sessionId`, Flow
 *  deriva uno del usuario y todas las conversaciones anónimas compartirían memoria. */
export function toFlowRequest(body: unknown, newSessionId: () => string): FlowRequestParse {
  const parsed = consoleChatBodySchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: `pedido inválido: ${describeFirstIssue(parsed.error)}` };
  const { mensajes, contexto, hilo } = parsed.data;
  const question = mensajes[mensajes.length - 1];
  if (question.rol !== "user" || !question.texto.trim()) {
    return { ok: false, error: "pedido inválido: el último mensaje tiene que ser la pregunta" };
  }
  return {
    ok: true,
    request: {
      message: question.texto,
      history: mensajes
        .slice(0, -1)
        .slice(-MAX_FLOW_HISTORY)
        .map((message) => ({ role: message.rol, content: message.texto.slice(0, MAX_FLOW_HISTORY_CONTENT) })),
      metadata: contexto === undefined ? {} : { contexto },
      sessionId: `${SESSION_PREFIX}${hilo ?? newSessionId()}`,
    },
  };
}
