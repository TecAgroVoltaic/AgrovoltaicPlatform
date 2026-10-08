"use client";
// «Evaluar ahora»: corre el evaluador sobre el período y deja el resultado a la
// vista. Nunca un botón mudo: mientras corre se sabe, y al terminar se dice
// cuántas alertas creó y actualizó, o por qué falló.
import { useCallback, useEffect, useRef, useState } from "react";

import type { DateRange } from "@/app/lib/analitica/dateRange";
import type { AnalyticsFailure } from "@/app/lib/analitica/errors";
import { runEvaluation } from "@/app/lib/alertas/client";
import type { EvaluationResult } from "@/app/lib/alertas/contracts";

export type EvaluationState =
  | { readonly status: "idle" }
  | { readonly status: "running" }
  | { readonly status: "done"; readonly result: EvaluationResult }
  | { readonly status: "failed"; readonly failure: AnalyticsFailure };

export type EvaluationController = {
  readonly state: EvaluationState;
  readonly run: () => void;
  /** Cierra el aviso del último resultado. */
  readonly dismiss: () => void;
};

const IDLE: EvaluationState = { status: "idle" };

/** `onEvaluated` corre solo si el servicio aceptó: ahí hay algo nuevo que pedir. */
export function useEvaluation(range: DateRange, onEvaluated: () => void): EvaluationController {
  const [state, setState] = useState<EvaluationState>(IDLE);
  const mounted = useRef(true);
  const onEvaluatedRef = useRef(onEvaluated);

  useEffect(() => {
    onEvaluatedRef.current = onEvaluated;
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(() => {
    setState({ status: "running" });
    void runEvaluation(range).then((result) => {
      if (!mounted.current) return;
      setState(result.ok ? { status: "done", result: result.data } : { status: "failed", failure: result.failure });
      if (result.ok) onEvaluatedRef.current();
    });
  }, [range]);

  const dismiss = useCallback(() => setState(IDLE), []);

  return { state, run, dismiss };
}
