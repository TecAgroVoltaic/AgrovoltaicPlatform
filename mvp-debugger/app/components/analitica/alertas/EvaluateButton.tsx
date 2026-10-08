"use client";
// «Evaluar ahora»: el mismo botón en la cabecera y en el vacío de «nunca se
// evaluó». Mientras corre lo dice y no deja lanzar otra corrida encima.
import { IconRefresh } from "@/app/components/asistente/AssistantIcons";
import type { EvaluationController } from "@/app/components/analitica/alertas/useEvaluation";

const ICON_SIZE = 14;
const ICON_STROKE = 2;
const IDLE_LABEL = "Evaluar ahora";
const RUNNING_LABEL = "Evaluando…";

export type EvaluateButtonProps = {
  readonly evaluation: EvaluationController;
  readonly className: string;
  /** El texto, para esconderlo en el teléfono y dejar solo el icono. */
  readonly labelClassName?: string;
};

export function EvaluateButton({ evaluation, className, labelClassName }: EvaluateButtonProps) {
  const running = evaluation.state.status === "running";
  const label = running ? RUNNING_LABEL : IDLE_LABEL;
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      aria-busy={running}
      disabled={running}
      onClick={evaluation.run}
    >
      <IconRefresh size={ICON_SIZE} strokeWidth={ICON_STROKE} />
      <span className={labelClassName}>{label}</span>
    </button>
  );
}
