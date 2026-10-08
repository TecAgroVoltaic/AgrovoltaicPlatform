"use client";
// El paso en línea de las acciones que piden algo antes de ejecutarse: dar
// seguimiento (nota obligatoria y próxima revisión), resolver (nota opcional) y
// olvidar (confirmación). Un solo formulario configurado, no tres casi iguales.
//
// La confirmación de «olvidar» vive acá y no en `window.confirm`: un diálogo
// del navegador no se puede estilar, bloquea la pestaña y se lee igual para
// borrar un archivo que para sacar una alerta de una lista.
import { useId, useState, type FormEvent } from "react";

import styles from "@/app/components/analitica/alertas/actions.module.css";
import { ACTION_PENDING_LABEL } from "@/app/components/analitica/alertas/labels";
import { DatePicker } from "@/app/components/analitica/DatePicker";
import type { AlertActionInput } from "@/app/lib/alertas/client";
import type { IsoDate } from "@/app/lib/analitica/dateRange";
import type { AlertAction } from "@/app/lib/alertas/vocabulary";
import { hoyEnSitio } from "@/app/lib/tiempo";

export type ActionStepConfig = {
  readonly intro?: string;
  readonly noteLabel?: string;
  readonly notePlaceholder?: string;
  readonly noteRequired?: boolean;
  readonly withNextReview?: boolean;
  readonly submitLabel: string;
};

export type ActionStepFormProps = {
  readonly action: AlertAction;
  readonly config: ActionStepConfig;
  readonly pending: boolean;
  readonly onSubmit: (input: AlertActionInput) => void;
  readonly onCancel: () => void;
};

/** El tope del backend (422 si se pasa): mejor que el campo no deje escribir más. */
const NOTE_MAX_LENGTH = 2000;
const NOTE_ROWS = 2;
const NOTE_MISSING = "Escribí una nota: un seguimiento sin nota no dice qué se hizo ni qué falta.";
const NO_DATE = "sin fecha";

export function ActionStepForm({ action, config, pending, onSubmit, onCancel }: ActionStepFormProps) {
  const noteId = useId();
  const reviewId = useId();
  const reviewLabelId = useId();
  const problemId = useId();
  const [note, setNote] = useState("");
  const [nextReview, setNextReview] = useState<IsoDate | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (config.noteRequired && note.trim() === "") return setProblem(NOTE_MISSING);
    setProblem(null);
    onSubmit({ action, note, ...(nextReview ? { nextReview } : {}) });
  };

  return (
    <form className={styles.step} onSubmit={submit} noValidate>
      {config.intro ? <p className={styles.stepText}>{config.intro}</p> : null}
      {config.noteLabel ? (
        <>
          <label className={styles.label} htmlFor={noteId}>
            {config.noteLabel}
          </label>
          <textarea
            id={noteId}
            className={styles.note}
            rows={NOTE_ROWS}
            maxLength={NOTE_MAX_LENGTH}
            placeholder={config.notePlaceholder}
            value={note}
            required={config.noteRequired}
            aria-invalid={problem === NOTE_MISSING}
            aria-describedby={problem ? problemId : undefined}
            onChange={(event) => setNote(event.target.value)}
          />
        </>
      ) : null}
      {problem ? (
        <p id={problemId} className={styles.problem} role="alert">
          {problem}
        </p>
      ) : null}
      <div className={styles.stepRow}>
        {config.withNextReview ? (
          <>
            <label id={reviewLabelId} className={styles.label} htmlFor={reviewId}>
              Próxima revisión
            </label>
            <DatePicker
              id={reviewId}
              labelId={reviewLabelId}
              value={nextReview}
              minDate={hoyEnSitio()}
              placeholder={NO_DATE}
              placement="above"
              onChange={setNextReview}
            />
            {nextReview ? (
              <button type="button" className={styles.clearDate} onClick={() => setNextReview(null)}>
                Quitar fecha
              </button>
            ) : null}
          </>
        ) : null}
        <span className={styles.spacer} />
        <button className={`${styles.ghost} ${styles.small}`} type="button" onClick={onCancel} disabled={pending}>
          Cancelar
        </button>
        <button className={`${styles.primary} ${styles.small}`} type="submit" disabled={pending} aria-busy={pending}>
          {pending ? ACTION_PENDING_LABEL[action] : config.submitLabel}
        </button>
      </div>
    </form>
  );
}
