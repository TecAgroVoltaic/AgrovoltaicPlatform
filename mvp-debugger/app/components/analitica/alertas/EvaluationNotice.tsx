"use client";
// Lo que pasó con «Evaluar ahora», en una región que el lector de pantalla
// anuncia sola. La región existe siempre (si naciera con el aviso, varios
// lectores no la anunciarían) y se pinta solo con algo que decir.
import { IconClose } from "@/app/components/asistente/AssistantIcons";
import { countLabel, describeFailure } from "@/app/components/analitica/alertas/labels";
import styles from "@/app/components/analitica/alertas/overview.module.css";
import type { EvaluationController, EvaluationState } from "@/app/components/analitica/alertas/useEvaluation";

const ICON_SIZE = 14;

function noticeText(state: EvaluationState) {
  switch (state.status) {
    case "idle":
      return null;
    case "running":
      return <>Evaluando el período…</>;
    case "failed":
      return <>La evaluación no corrió. {describeFailure(state.failure)}</>;
    case "done": {
      const { created, updated, reviewed, warning } = state.result;
      return (
        <>
          <b>
            {countLabel(created, "creada", "creadas")} · {countLabel(updated, "actualizada", "actualizadas")}
          </b>{" "}
          · {countLabel(reviewed, "causa revisada", "causas revisadas")}.{warning ? ` ${warning}` : ""}
        </>
      );
    }
  }
}

export function EvaluationNotice({ evaluation }: { readonly evaluation: EvaluationController }) {
  const { state, dismiss } = evaluation;
  const text = noticeText(state);
  return (
    <div className={styles.notice} aria-live="polite" data-tone={state.status === "failed" ? "error" : undefined}>
      {text ? (
        <>
          <p className={styles.noticeText}>{text}</p>
          {state.status !== "running" ? (
            <button type="button" className={styles.noticeClose} aria-label="Cerrar el aviso" onClick={dismiss}>
              <IconClose size={ICON_SIZE} />
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
