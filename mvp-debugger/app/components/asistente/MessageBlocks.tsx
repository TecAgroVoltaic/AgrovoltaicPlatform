"use client";
// Los bloques de una respuesta (texto, gráfico, descarga) en el orden en que
// ocurrieron. Lo comparten la respuesta guardada y la que está llegando.
import { ChartSpecRenderer } from "@/app/components/asistente/ChartSpecRenderer";
import { DescargaCard } from "@/app/components/asistente/DescargaCard";
import styles from "@/app/components/asistente/asistente.module.css";
import { exportRequestMessage, type MessageBlock } from "@/app/lib/asistente/messageBlocks";
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
        const { request } = block;
        return (
          <ChartSpecRenderer
            key={block.key}
            spec={block.spec}
            footer={
              request
                ? (spec) => (
                    <div className={styles.chartActions}>
                      <button
                        type="button"
                        className="btn ghost sm"
                        disabled={askDisabled}
                        title={askDisabled ? "Esperá a que termine la respuesta en curso" : undefined}
                        onClick={() => onAsk(exportRequestMessage(spec.titulo, request))}
                      >
                        Descargar estos datos
                      </button>
                    </div>
                  )
                : undefined
            }
          />
        );
      })}
    </>
  );
}
