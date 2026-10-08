"use client";
// Los bloques de una respuesta (texto, gráfico, descarga) en el orden en que
// ocurrieron. Lo comparten la respuesta guardada y la que está llegando.
import { ChartCard } from "@/app/components/asistente/ChartCard";
import { DescargaCard } from "@/app/components/asistente/DescargaCard";
import styles from "@/app/components/asistente/asistente.module.css";
import type { MessageBlock } from "@/app/lib/asistente/messageBlocks";
import { renderMd } from "@/app/lib/markdown";

export type MessageBlocksProps = {
  readonly blocks: readonly MessageBlock[];
  /** Manda una pregunta al chat (el «Descargar estos datos» de cada gráfico). */
  readonly onAsk: (question: string) => void;
  /** Mientras otra respuesta está llegando no se puede preguntar. */
  readonly askDisabled: boolean;
};

export function MessageBlocks({ blocks, onAsk, askDisabled }: MessageBlocksProps) {
  return (
    <>
      {blocks.map((block) => {
        if (block.kind === "text") {
          // `renderMd` escapa todo el HTML del modelo antes de dar formato.
          return (
            <div
              key={block.key}
              className={`md ${styles.text}`}
              dangerouslySetInnerHTML={{ __html: renderMd(block.markdown) }}
            />
          );
        }
        if (block.kind === "download") return <DescargaCard key={block.key} spec={block.spec} />;
        return (
          <ChartCard
            key={block.key}
            spec={block.spec}
            request={block.request}
            onAsk={onAsk}
            askDisabled={askDisabled}
          />
        );
      })}
    </>
  );
}
