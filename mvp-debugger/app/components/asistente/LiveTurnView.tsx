"use client";
// La respuesta mientras llega: qué tool está corriendo («Consultando la
// irradiancia…»), lo que ya se puede mostrar y el texto que va entrando.
import { MessageBlocks } from "@/app/components/asistente/MessageBlocks";
import styles from "@/app/components/asistente/asistente.module.css";
import { IconoCheck, IconoError } from "@/app/components/Iconos";
import { buildBlocks } from "@/app/lib/asistente/messageBlocks";
import type { LiveStep, TurnProgress } from "@/app/lib/asistente/turnReducer";

const ICON_SIZE = 14;

export type LiveTurnViewProps = {
  readonly progress: TurnProgress;
  /** Los gráficos que ya llegaron muestran su botón, deshabilitado hasta que
   * la respuesta termine. */
  readonly onAsk: (question: string) => void;
};

export function LiveTurnView({ progress, onAsk }: LiveTurnViewProps) {
  const blocks = buildBlocks(progress.steps, progress.streamingText);
  // Sin una tool corriendo ni texto entrando, el modelo está decidiendo: si no
  // se dice, la pantalla parece colgada justo entre un gráfico y su comentario.
  const waiting = !progress.streamingText && !progress.liveSteps.some((step) => step.status === "running");

  return (
    <article className={styles.assistant} aria-label="Respuesta en curso" aria-busy="true">
      {progress.liveSteps.length > 0 ? (
        <ol className={styles.liveSteps} aria-label="Pasos del asistente">
          {progress.liveSteps.map((step) => (
            <LiveStepItem key={step.id} step={step} />
          ))}
        </ol>
      ) : null}
      <MessageBlocks blocks={blocks} onAsk={onAsk} askDisabled />
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
    </article>
  );
}

function LiveStepItem({ step }: { step: LiveStep }) {
  const tone =
    step.status === "done" ? styles.liveStepDone : step.status === "failed" ? styles.liveStepFailed : "";
  return (
    <li className={`${styles.liveStep} ${tone}`}>
      <span className={styles.liveIcon} aria-hidden="true">
        {step.status === "running" ? (
          <span className="chat-dots">
            <i />
          </span>
        ) : step.status === "done" ? (
          <IconoCheck size={ICON_SIZE} />
        ) : (
          <IconoError size={ICON_SIZE} />
        )}
      </span>
      <span>
        {step.label}
        {step.status === "running" ? "…" : step.status === "failed" ? " (falló)" : ""}
      </span>
    </li>
  );
}
