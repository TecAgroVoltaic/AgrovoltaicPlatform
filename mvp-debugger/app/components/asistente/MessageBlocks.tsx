"use client";
// Los bloques de una respuesta en el orden en que ocurrieron. Lo comparten la
// respuesta guardada y la que está llegando. Qué dibuja cada `kind` lo decide
// el registro de `blocks/blockRenderers`.
import { Fragment } from "react";

import { renderBlock } from "@/app/components/asistente/blocks/blockRenderers";
import type { MessageBlock } from "@/app/lib/asistente/messageBlocks";

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
      {blocks.map((block) => (
        <Fragment key={block.key}>{renderBlock(block, { onAsk, askDisabled })}</Fragment>
      ))}
    </>
  );
}
