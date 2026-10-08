// Los mensajes de un hilo, en el mismo esquema que guarda el `ChatWidget`
// (`{rol, texto, traza}`), más `fallo` para las respuestas que no llegaron.
import { z } from "zod";

import { chatResultSchema, type ChatResult } from "@/app/lib/asistente/contracts/chatEvents";
import type { ChatFailureCode, WireMessage } from "@/app/lib/asistente/stream";
import type { TurnState } from "@/app/lib/asistente/turnReducer";

export const storedMessageSchema = z.discriminatedUnion("rol", [
  z.object({ rol: z.literal("user"), texto: z.string() }),
  z.object({
    rol: z.literal("assistant"),
    texto: z.string(),
    traza: chatResultSchema.optional(),
    fallo: z.object({ code: z.string(), message: z.string() }).optional(),
  }),
]);

export type StoredMessage = z.infer<typeof storedMessageSchema>;
export type AssistantMessage = Extract<StoredMessage, { rol: "assistant" }>;

const CANCELLED_MESSAGE = "Cancelaste esta respuesta.";
const CANCELLED_CODE = "CANCELLED";
const EMPTY_ANSWER = "(sin respuesta)";

export function userMessage(text: string): StoredMessage {
  return { rol: "user", texto: text };
}

/**
 * Lo que queda guardado de un turno terminado. Una respuesta cortada conserva
 * lo que alcanzó a llegar (un gráfico ya entregado sigue valiendo) y dice por
 * qué quedó incompleta. `null` si el turno no terminó.
 */
export function messageFromTurn(turn: TurnState): AssistantMessage | null {
  if (turn.status === "idle" || turn.status === "streaming") return null;
  if (turn.status === "done") {
    return { rol: "assistant", texto: turn.result.respuesta || EMPTY_ANSWER, traza: turn.result };
  }
  const partial: ChatResult = { respuesta: turn.progress.streamingText, pasos: [...turn.progress.steps] };
  const fallo =
    turn.status === "cancelled"
      ? { code: CANCELLED_CODE, message: CANCELLED_MESSAGE }
      : { code: turn.failure.code satisfies ChatFailureCode, message: turn.failure.message };
  return { rol: "assistant", texto: turn.progress.streamingText, traza: partial, fallo };
}

/**
 * El historial que viaja al backend: solo texto, y sin los turnos fallidos. Se
 * quita el par entero (la pregunta y su respuesta que no llegó) porque dejar la
 * pregunta sola pondría dos mensajes de la persona seguidos, y el modelo
 * contestaría la vieja junto con la nueva.
 */
export function toWireHistory(messages: readonly StoredMessage[]): WireMessage[] {
  const history: WireMessage[] = [];
  messages.forEach((message, index) => {
    if (message.rol === "assistant" && message.fallo) return;
    const next = messages[index + 1];
    if (message.rol === "user" && next?.rol === "assistant" && next.fallo) return;
    history.push({ rol: message.rol, texto: message.texto });
  });
  return history;
}
