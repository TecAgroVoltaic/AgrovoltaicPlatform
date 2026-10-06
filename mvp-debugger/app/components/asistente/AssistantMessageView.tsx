"use client";
// Una respuesta ya terminada: la línea plegada de sus pasos, sus bloques y, si
// no llegó entera, por qué.
import { useMemo } from "react";

import { StepsDisclosure } from "@/app/components/asistente/AgentSteps";
import { AnswerFrame } from "@/app/components/asistente/AnswerFrame";
import { MessageBlocks } from "@/app/components/asistente/MessageBlocks";
import styles from "@/app/components/asistente/asistente.module.css";
import controls from "@/app/components/asistente/controls.module.css";
import { buildBlocks } from "@/app/lib/asistente/messageBlocks";
import type { AssistantMessage } from "@/app/lib/asistente/messages";

export type AssistantMessageViewProps = {
  readonly message: AssistantMessage;
  readonly onAsk: (question: string) => void;
  readonly askDisabled: boolean;
  /** Solo la última respuesta fallida se puede reintentar. */
  readonly onRetry?: () => void;
};

export function AssistantMessageView({ message, onAsk, askDisabled, onRetry }: AssistantMessageViewProps) {
  const trace = message.traza;
  const blocks = useMemo(() => buildBlocks(trace?.pasos ?? [], message.texto), [trace, message.texto]);

  return (
    <AnswerFrame label="Respuesta del asistente">
      {trace && trace.pasos.length > 0 ? <StepsDisclosure trace={trace} /> : null}
      <MessageBlocks blocks={blocks} onAsk={onAsk} askDisabled={askDisabled} />
      {message.fallo ? (
        <div className={styles.failure}>
          <div className="alert" role="alert">
            {message.fallo.message}
          </div>
          {onRetry ? (
            <button type="button" className={controls.action} disabled={askDisabled} onClick={onRetry}>
              Reintentar
            </button>
          ) : null}
        </div>
      ) : null}
    </AnswerFrame>
  );
}
