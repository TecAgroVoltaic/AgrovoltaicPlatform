// Los eventos de `POST /chat/stream` (contrato §3), validados uno por uno y
// traducidos a nombres en inglés en esta frontera.
//
// Los pasos y el resultado final se validan como objetos ABIERTOS: la traza
// (`TrazaLegible`) muestra campos que la UI no interpreta (`stop_reason`, el
// detalle de cada tool), y cerrarlos acá rompería la traza con cada campo nuevo
// del backend. Lo que la vista sí lee está tipado.
import { z } from "zod";

const modelStepSchema = z.looseObject({
  tipo: z.literal("modelo"),
  texto: z.string().optional().default(""),
  solicita: z
    .array(z.looseObject({ nombre: z.string(), input: z.unknown().optional() }))
    .optional()
    .default([]),
});

const toolStepSchema = z.looseObject({
  tipo: z.literal("tool"),
  nombre: z.string(),
  input: z.record(z.string(), z.unknown()).optional().default({}),
  salida: z.unknown(),
  error: z.boolean().optional().default(false),
  ms: z.number().optional(),
});

const webStepSchema = z.looseObject({
  tipo: z.literal("web"),
  query: z.string().optional().default(""),
});

export const agentStepSchema = z.discriminatedUnion("tipo", [
  modelStepSchema,
  toolStepSchema,
  webStepSchema,
]);

export type AgentStep = z.infer<typeof agentStepSchema>;
export type ToolStep = Extract<AgentStep, { tipo: "tool" }>;

/** El mismo objeto que devuelve `POST /chat`. */
export const chatResultSchema = z.looseObject({
  respuesta: z.string(),
  modelo: z.string().optional(),
  pasos: z.array(agentStepSchema),
  usage: z.record(z.string(), z.unknown()).optional(),
  costo: z.looseObject({ usd_total: z.number().optional() }).nullable().optional(),
  ms_total: z.number().optional(),
});

export type ChatResult = z.infer<typeof chatResultSchema>;

// Los `data` de cada evento del cable. El nombre del evento en el cable y su
// traducción viven en `stream.ts`, que es quien los despacha.
export const startEventSchema = z.looseObject({ modelo: z.string().optional() });

export const toolStartEventSchema = z.looseObject({
  id: z.string(),
  nombre: z.string(),
  input: z.record(z.string(), z.unknown()).optional().default({}),
});

export const textEventSchema = z.looseObject({ delta: z.string() });

export const errorEventSchema = z.looseObject({
  mensaje: z.string(),
  codigo: z.string().optional(),
});
