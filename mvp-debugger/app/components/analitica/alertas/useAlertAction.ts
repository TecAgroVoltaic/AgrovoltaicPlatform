"use client";
// Ejecutar una acción sobre una alerta: qué acción está en curso, qué falló y
// avisar al terminar. Nunca un botón mudo: mientras corre se sabe cuál, y si
// falla el motivo queda escrito en la ficha.
import { useCallback, useEffect, useRef, useState } from "react";

import { STATUS_LABEL } from "@/app/components/analitica/alertas/labels";
import { runAlertAction, type AlertActionInput } from "@/app/lib/alertas/client";
import type { AlertAction } from "@/app/lib/alertas/vocabulary";

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
      const { transition } = outcome;
      // Con un 409 la ficha está vieja: se refresca para que los botones
      // vuelvan a corresponder al estado real, y el mensaje dice cuál es.
      if (transition) onChanged();
      setError(
        transition?.from
          ? `${outcome.failure.message} Ahora está «${STATUS_LABEL[transition.from]}».`
          : outcome.failure.message,
      );
      return false;
    },
    [alertId, onChanged],
  );

  return { pending, error, run };
}
