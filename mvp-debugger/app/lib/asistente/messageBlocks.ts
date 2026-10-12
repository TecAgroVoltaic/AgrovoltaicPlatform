// Una respuesta del asistente como lista de bloques en el orden en que ocurrió:
// lo que dijo el modelo, el gráfico que armó, la descarga que ofreció, y otra
// vez texto. Así un gráfico aparece junto al párrafo que lo comenta y no
// amontonado al final.
//
// Qué bloque sale de cada marcador lo decide el registro de `blocks/extractors`.
import type { AgentStep } from "@/app/lib/asistente/contracts/chatEvents";
import { extractMarkerBlocks } from "@/app/lib/asistente/blocks/extractors";
import type { ChartRequest, MessageBlock } from "@/app/lib/asistente/blocks/types";

export type { ChartRequest, MessageBlock } from "@/app/lib/asistente/blocks/types";

export function buildBlocks(steps: readonly AgentStep[], finalText: string): MessageBlock[] {
  const blocks: MessageBlock[] = [];
  steps.forEach((step, index) => {
    const stepKey = `paso-${index}`;
    if (step.tipo === "modelo" && step.texto.trim()) {
      blocks.push({ kind: "text", key: stepKey, markdown: step.texto });
      return;
    }
    if (step.tipo !== "tool" || step.error || !isRecord(step.salida)) return;
    blocks.push(...extractMarkerBlocks(step.salida, { input: step.input, stepKey }));
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
