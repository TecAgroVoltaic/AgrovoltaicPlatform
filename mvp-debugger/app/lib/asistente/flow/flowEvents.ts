// Los eventos del canal web de Visione Flow (`POST /api/webhooks/<id>/web/stream`)
// que el adaptador traduce. Los emite `web-channel-stream.callbacks.ts` del
// Agent-Runtime como `event: <nombre>` + `data: <json>`.
//
// Todo se valida ABIERTO y con lo nuevo opcional: `input`, `ok`, `ms` y `payload`
// de las tools los suma la fase 1 del runtime, y un runtime anterior tiene que
// seguir funcionando (sin bloques visuales, pero sin romperse).
import { z } from "zod";

export const FLOW_EVENT = {
  token: "llm:token",
  toolCall: "agent:tool_call",
  toolResult: "agent:tool_result",
  complete: "flow:complete",
  nodeError: "node:error",
} as const;

const toolInputSchema = z.record(z.string(), z.unknown());

export const tokenEventSchema = z.looseObject({ content: z.string().optional().default("") });

export const toolCallEventSchema = z.looseObject({
  toolName: z.string(),
  input: toolInputSchema.optional().default({}),
});

export const toolResultEventSchema = z.looseObject({
  toolName: z.string(),
  input: toolInputSchema.optional().default({}),
  ok: z.boolean().optional(),
  ms: z.number().optional(),
  payload: z.unknown().optional(),
  error: z.unknown().optional(),
  payloadTruncated: z.boolean().optional(),
});

export const completeEventSchema = z.looseObject({
  success: z.boolean(),
  output: z.unknown().optional(),
  error: z.unknown().optional(),
  totalDuration: z.number().optional(),
  tokensUsed: z.number().optional(),
});

export const nodeErrorEventSchema = z.looseObject({
  error: z.string().optional(),
  nodeType: z.string().optional(),
});

export type ToolCallEvent = z.infer<typeof toolCallEventSchema>;
export type ToolResultEvent = z.infer<typeof toolResultEventSchema>;
export type CompleteEvent = z.infer<typeof completeEventSchema>;
export type NodeErrorEvent = z.infer<typeof nodeErrorEventSchema>;

/** Los campos donde el runtime deja el texto de la respuesta cuando `output` es
 *  un objeto. Mismo orden que `response-extractor.ts` del Agent-Runtime. */
const RESPONSE_TEXT_FIELDS = ["response", "content", "message", "text", "reply", "output"] as const;

/** El texto de la respuesta final dentro del `output` de `flow:complete`. */
export function responseTextOf(output: unknown): string | null {
  if (typeof output === "string") return output;
  if (typeof output !== "object" || output === null) return null;
  for (const field of RESPONSE_TEXT_FIELDS) {
    const value: unknown = Reflect.get(output, field);
    if (typeof value === "string") return value;
  }
  return null;
}
