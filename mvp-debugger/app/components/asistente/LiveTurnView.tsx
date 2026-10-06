"use client";
// La respuesta mientras llega: los pasos en vivo con «Detener» debajo, lo que
// ya se puede mostrar y el texto que va entrando.
import { LiveStepList } from "@/app/components/asistente/AgentSteps";
import { IconStop } from "@/app/components/asistente/AssistantIcons";
import { AnswerFrame } from "@/app/components/asistente/AnswerFrame";
import { MessageBlocks } from "@/app/components/asistente/MessageBlocks";
import styles from "@/app/components/asistente/asistente.module.css";
import controls from "@/app/components/asistente/controls.module.css";
import { buildBlocks } from "@/app/lib/asistente/messageBlocks";
import type { TurnProgress } from "@/app/lib/asistente/turnReducer";

const STOP_ICON_SIZE = 12;

export type LiveTurnViewProps = {
  readonly progress: TurnProgress;
  /** Los gráficos que ya llegaron muestran su botón, deshabilitado hasta que
   * la respuesta termine. */
  readonly onAsk: (question: string) => void;
  readonly onCancel: () => void;
};

export function LiveTurnView({ progress, onAsk, onCancel }: LiveTurnViewProps) {
  const blocks = buildBlocks(progress.steps, progress.streamingText);
  // Sin una tool corriendo ni texto entrando, el modelo está decidiendo: si no
  // se dice, la pantalla parece colgada justo entre un gráfico y su comentario.
  const waiting = !progress.streamingText && !progress.liveSteps.some((step) => step.status === "running");

  return (
    <AnswerFrame label="Respuesta en curso" busy>
      {progress.liveSteps.length > 0 ? <LiveStepList progress={progress} /> : null}
      {waiting ? (
        <div className={styles.thinking} role="status">
          <span className="chat-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          {progress.liveSteps.length ? "Armando la respuesta…" : "Pensando…"}
        </div>
      ) : null}
      <div className={styles.liveControls}>
        <button type="button" className={controls.action} onClick={onCancel}>
          <IconStop size={STOP_ICON_SIZE} />
          Detener
        </button>
      </div>
      <MessageBlocks blocks={blocks} onAsk={onAsk} askDisabled />
    </AnswerFrame>
  );
}
