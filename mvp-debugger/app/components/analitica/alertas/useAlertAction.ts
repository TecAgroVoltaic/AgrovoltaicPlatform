"use client";
// Ejecutar una acción sobre una alerta: qué acción está en curso, qué falló y
// avisar al terminar. Nunca un botón mudo: mientras corre se sabe cuál, y si
// falla el motivo queda escrito en la ficha.
import { useCallback, useEffect, useRef, useState } from "react";

import { STATUS_LABEL } from "@/app/components/analitica/alertas/labels";
import { runAlertAction, type AlertActionInput } from "@/app/lib/alertas/client";
import type { AlertConflict } from "@/app/lib/alertas/contracts";
import type { AlertAction } from "@/app/lib/alertas/vocabulary";

function conflictMessage(message: string, conflict: AlertConflict | null): string {
  if (conflict?.kind === "invalidTransition" && conflict.from) {
    return `${message} Ahora está «${STATUS_LABEL[conflict.from]}».`;
  }
  if (conflict?.kind === "openAlertExists" && conflict.openAlertId !== null) {
    return `${message} Es la alerta n.º ${conflict.openAlertId}.`;
  }
  return message;
}

export type AlertActionController = {
  readonly pending: AlertAction | null;
  readonly error: string | null;
  /** `true` si el backend aceptó la acción. */
  readonly run: (input: AlertActionInput) => Promise<boolean>;
};

export function useAlertAction(alertId: number, onChanged: () => void): AlertActionController {
  const [pending, setPending] = useState<AlertAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (input: AlertActionInput) => {
      setPending(input.action);
      setError(null);
      const outcome = await runAlertAction(alertId, input);
      if (!mounted.current) return outcome.ok;
      setPending(null);
      if (outcome.ok) {
        onChanged();
        return true;
      }
      const { conflict } = outcome;
      // Con `transicion_invalida` la ficha está vieja: se refresca para que los
      // botones vuelvan a corresponder al estado real, y el mensaje dice cuál es.
      if (conflict?.kind === "invalidTransition") onChanged();
      setError(conflictMessage(outcome.failure.message, conflict));
      return false;
    },
    [alertId, onChanged],
  );

  return { pending, error, run };
}
