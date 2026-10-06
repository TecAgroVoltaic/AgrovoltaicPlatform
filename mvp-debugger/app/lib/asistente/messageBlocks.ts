// Una respuesta del asistente como lista de bloques en el orden en que ocurrió:
// lo que dijo el modelo, el gráfico que armó, la descarga que ofreció, y otra
// vez texto. Así un gráfico aparece junto al párrafo que lo comenta y no
// amontonado al final.
import { z } from "zod";

import type { AgentStep } from "@/app/lib/asistente/contracts/chatEvents";

/** Variables y rango con que se pidió un gráfico: lo que hace falta para pedir
 * después la exportación de esos mismos datos. */
export type ChartRequest = {
  readonly variables: readonly string[];
  readonly from: string | null;
  readonly toExclusive: string | null;
};

export type MessageBlock =
  | { readonly kind: "text"; readonly key: string; readonly markdown: string }
  | {
      readonly kind: "chart";
      readonly key: string;
      /** Sin validar: el renderer lo valida y, si no cumple, lo dice. */
      readonly spec: unknown;
      readonly request: ChartRequest | null;
    }
  | { readonly kind: "download"; readonly key: string; readonly spec: unknown };

const CHART_MARKER = "_grafico";
const DOWNLOAD_MARKER = "_descarga";

const chartInputSchema = z.object({
  variables: z.array(z.string()).min(1),
  desde: z.string().optional(),
  hasta: z.string().optional(),
});

export function buildBlocks(steps: readonly AgentStep[], finalText: string): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  steps.forEach((step, index) => {
    const key = `paso-${index}`;
    if (step.tipo === "modelo" && step.texto.trim()) {
      blocks.push({ kind: "text", key, markdown: step.texto });
      return;
    }
    if (step.tipo !== "tool" || step.error || !isRecord(step.salida)) return;
    if (CHART_MARKER in step.salida) {
      blocks.push({ kind: "chart", key, spec: step.salida[CHART_MARKER], request: chartRequest(step.input) });
    }
    if (DOWNLOAD_MARKER in step.salida) {
      blocks.push({ kind: "download", key: `${key}-descarga`, spec: step.salida[DOWNLOAD_MARKER] });
    }
  });

  // El texto final normalmente ya vino como último paso del modelo. Si no (una
  // negativa del modelo, o texto que todavía está llegando), va al final.
  const lastText = [...blocks].reverse().find((block) => block.kind === "text");
  const final = finalText.trim();
  if (final && !(lastText?.kind === "text" && lastText.markdown.trim() === final)) {
    blocks.push({ kind: "text", key: "final", markdown: finalText });
  }
  return blocks;
}

function chartRequest(input: unknown): ChartRequest | null {
  const parsed = chartInputSchema.safeParse(input);
  if (!parsed.success) return null;
  return {
    variables: parsed.data.variables,
    from: parsed.data.desde ?? null,
    toExclusive: parsed.data.hasta ?? null,
  };
}

/**
 * El mensaje que pide exportar los datos de un gráfico. Es TEXTO para el
 * asistente y no una descarga armada en el cliente: la exportación la valida y
 * la estima el backend (`exportar_datos`), y así no existe una segunda forma de
 * elegir tabla y columnas.
 */
export function exportRequestMessage(chartTitle: string, request: ChartRequest): string {
  const variables = request.variables.join(", ");
  const range =
    request.from && request.toExclusive
      ? `desde ${request.from} hasta ${request.toExclusive} (hasta exclusivo)`
      : "con el mismo rango del gráfico";
  return `Exportá en CSV los datos del gráfico «${chartTitle}»: variables ${variables}, ${range}.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
