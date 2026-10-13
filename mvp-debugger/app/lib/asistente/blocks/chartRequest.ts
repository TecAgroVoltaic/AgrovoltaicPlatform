// Con qué se pidió un gráfico, leído del `input` del paso de `graficar`.
import { z } from "zod";

import type { ChartRequest } from "@/app/lib/asistente/blocks/types";

const chartInputSchema = z.object({
  variables: z.array(z.string()).min(1),
  desde: z.string().optional(),
  hasta: z.string().optional(),
  granularidad: z.string().optional(),
});

/** `null` si el input no trae variables: sin pedido no se inventan acciones. */
export function chartRequest(input: unknown): ChartRequest | null {
  const parsed = chartInputSchema.safeParse(input);
  if (!parsed.success) return null;
  return {
    variables: parsed.data.variables,
    from: parsed.data.desde ?? null,
    toExclusive: parsed.data.hasta ?? null,
    granularity: parsed.data.granularidad ?? null,
  };
}
