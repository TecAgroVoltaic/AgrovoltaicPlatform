"use client";
// La barra de acciones de la ficha, fija al pie. Los botones son los de la tabla
// estado → acciones (`transitions.ts`): el que hace avanzar la alerta es el
// primario, «Olvidar» va discreto a la derecha. Un paso abierto a la vez, y
// mientras una acción corre todas quedan deshabilitadas para que no se crucen
// dos transiciones sobre la misma alerta.
import { useState } from "react";

import styles from "@/app/components/analitica/alertas/actions.module.css";
import { ActionStepForm, type ActionStepConfig } from "@/app/components/analitica/alertas/ActionStepForm";
import { ACTION_DONE_LABEL, ACTION_LABEL, ACTION_PENDING_LABEL } from "@/app/components/analitica/alertas/labels";
import { useAlertAction } from "@/app/components/analitica/alertas/useAlertAction";
import type { AlertActionInput } from "@/app/lib/alertas/client";
import { availableActions } from "@/app/lib/alertas/transitions";
import type { AlertAction, AlertStatus } from "@/app/lib/alertas/vocabulary";

/** Las acciones que piden un paso antes de ejecutarse. Las demás (aprobar,
 *  reabrir) son reversibles y salen con un clic. */
const STEP_CONFIG: Partial<Record<AlertAction, ActionStepConfig>> = {
  followUp: {
    noteLabel: "Nota de seguimiento",
    notePlaceholder: "Qué se revisó, a quién se avisó, qué falta…",
    noteRequired: true,
    withNextReview: true,
    submitLabel: "Guardar seguimiento",
  },
  resolve: { noteLabel: "Nota (opcional)", submitLabel: "Marcar como resuelta" },
  dismiss: {
    intro: "¿Olvidar esta alerta? Sale de la lista de abiertas, pero queda en el historial y se puede reabrir.",
    submitLabel: "Sí, olvidar",
  },
};

/** La acción que se ofrece apartada: sacar la alerta de la lista no es avanzarla. */
const QUIET_ACTION: AlertAction = "dismiss";

export type AlertActionsProps = {
  readonly alertId: number;
  readonly status: AlertStatus;
  readonly onChanged: () => void;
};

export function AlertActions({ alertId, status, onChanged }: AlertActionsProps) {
  const [openStep, setOpenStep] = useState<AlertAction | null>(null);
  const [done, setDone] = useState<AlertAction | null>(null);
  const { pending, error, run } = useAlertAction(alertId, onChanged);
  const actions = availableActions(status);
  const forward = actions.filter((action) => action !== QUIET_ACTION);
  // Tras un 409 el estado cambia debajo de un paso abierto: si su acción ya no
  // aplica, el paso desaparece en vez de ofrecer algo que el backend rechaza.
  const stepConfig = openStep && actions.includes(openStep) ? STEP_CONFIG[openStep] : undefined;

  const execute = (input: AlertActionInput) => {
    setDone(null);
    void run(input).then((accepted) => {
      if (!accepted) return;
      setOpenStep(null);
      setDone(input.action);
    });
  };
  const start = (action: AlertAction) => {
    if (STEP_CONFIG[action]) setOpenStep((current) => (current === action ? null : action));
    else execute({ action });
  };

  const button = (action: AlertAction, className: string) => (
    <button
      key={action}
      type="button"
      className={className}
      disabled={pending !== null}
      aria-busy={pending === action}
      aria-expanded={STEP_CONFIG[action] ? openStep === action : undefined}
      onClick={() => start(action)}
    >
      {pending === action && !STEP_CONFIG[action] ? ACTION_PENDING_LABEL[action] : ACTION_LABEL[action]}
    </button>
  );

  return (
    <section className={styles.bar} aria-label="Acciones sobre la alerta">
      <div className={styles.buttons}>
        {forward.map((action, index) => button(action, index === 0 ? styles.primary : styles.ghost))}
        {actions.includes(QUIET_ACTION) ? (
          <>
            <span className={styles.spacer} />
            {button(QUIET_ACTION, styles.quiet)}
          </>
        ) : null}
      </div>
      {openStep && stepConfig ? (
        <ActionStepForm
          key={openStep}
          action={openStep}
          config={stepConfig}
          pending={pending === openStep}
          onCancel={() => setOpenStep(null)}
          onSubmit={execute}
        />
      ) : null}
      {error ? (
        <p className={styles.problem} role="alert">
          {error}
        </p>
      ) : null}
      <p className={styles.done} role="status">
        {done && !error ? ACTION_DONE_LABEL[done] : ""}
      </p>
    </section>
  );
}
