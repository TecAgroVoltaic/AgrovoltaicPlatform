"use client";
// Las acciones de la ficha, según el estado. Un paso abierto a la vez: abrir
// «Dar seguimiento» cierra «Olvidar», y mientras una acción corre todas quedan
// deshabilitadas para que no se crucen dos transiciones sobre la misma alerta.
import { useState } from "react";

import styles from "@/app/components/analitica/alertas/alertas.module.css";
import {
  ActionStepForm,
  type ActionStepConfig,
} from "@/app/components/analitica/alertas/ActionStepForm";
import { ACTION_LABEL, ACTION_PENDING_LABEL } from "@/app/components/analitica/alertas/labels";
import { useAlertAction } from "@/app/components/analitica/alertas/useAlertAction";
import { availableActions } from "@/app/lib/alertas/transitions";
import type { AlertAction, AlertStatus } from "@/app/lib/alertas/vocabulary";

/** Las acciones que piden un paso antes de ejecutarse. Las demás (aprobar,
 *  reabrir) son reversibles y salen con un clic. */
const STEP_CONFIG: Partial<Record<AlertAction, ActionStepConfig>> = {
  followUp: {
    noteLabel: "Nota del seguimiento",
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

export type AlertActionsProps = {
  readonly alertId: number;
  readonly status: AlertStatus;
  readonly onChanged: () => void;
};

export function AlertActions({ alertId, status, onChanged }: AlertActionsProps) {
  const [openStep, setOpenStep] = useState<AlertAction | null>(null);
  const { pending, error, run } = useAlertAction(alertId, onChanged);
  const actions = availableActions(status);
  // Tras un 409 el estado cambia debajo de un paso abierto: si su acción ya no
  // aplica, el paso desaparece en vez de ofrecer algo que el backend rechaza.
  const stepConfig = openStep && actions.includes(openStep) ? STEP_CONFIG[openStep] : undefined;

  const start = (action: AlertAction) => {
    if (STEP_CONFIG[action]) setOpenStep((current) => (current === action ? null : action));
    else void run({ action });
  };

  return (
    <section className={styles.actions} aria-label="Acciones sobre la alerta">
      <div className={styles.buttons}>
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            className={`btn sm${STEP_CONFIG[action] ? " ghost" : ""}`}
            disabled={pending !== null}
            aria-busy={pending === action}
            aria-expanded={STEP_CONFIG[action] ? openStep === action : undefined}
            onClick={() => start(action)}
          >
            {pending === action && !STEP_CONFIG[action] ? ACTION_PENDING_LABEL[action] : ACTION_LABEL[action]}
          </button>
        ))}
      </div>
      {openStep && stepConfig ? (
        <ActionStepForm
          key={openStep}
          action={openStep}
          config={stepConfig}
          pending={pending === openStep}
          onCancel={() => setOpenStep(null)}
          onSubmit={(input) =>
            void run(input).then((accepted) => {
              if (accepted) setOpenStep(null);
            })
          }
        />
      ) : null}
      {error ? (
        <p className={styles.problem} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
