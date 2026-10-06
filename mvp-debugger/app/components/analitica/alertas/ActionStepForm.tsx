"use client";
// El paso en línea de las acciones que piden algo antes de ejecutarse: dar
// seguimiento (nota obligatoria y próxima revisión), resolver (nota opcional) y
// olvidar (confirmación). Un solo formulario configurado, no tres casi iguales.
//
// La confirmación de «olvidar» vive acá y no en `window.confirm`: un diálogo
// del navegador no se puede estilar, bloquea la pestaña y se lee igual para
// borrar un archivo que para sacar una alerta de una lista.
import { useId, useState, type FormEvent } from "react";

import styles from "@/app/components/analitica/alertas/alertas.module.css";
import { ACTION_PENDING_LABEL } from "@/app/components/analitica/alertas/labels";
import type { AlertActionInput } from "@/app/lib/alertas/client";
import { isIsoDate } from "@/app/lib/analitica/dateRange";
import { hoyEnSitio } from "@/app/lib/tiempo";
import type { AlertAction } from "@/app/lib/alertas/vocabulary";

export type ActionStepConfig = {
  readonly intro?: string;
  readonly noteLabel?: string;
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
const NOTE_MISSING = "Escribí una nota: un seguimiento sin nota no dice qué se hizo ni qué falta.";
const DATE_INVALID = "La próxima revisión tiene que ser una fecha válida (AAAA-MM-DD).";

export function ActionStepForm({ action, config, pending, onSubmit, onCancel }: ActionStepFormProps) {
  const noteId = useId();
  const reviewId = useId();
  const problemId = useId();
  const [note, setNote] = useState("");
  const [nextReview, setNextReview] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (config.noteRequired && note.trim() === "") return setProblem(NOTE_MISSING);
    if (nextReview !== "" && !isIsoDate(nextReview)) return setProblem(DATE_INVALID);
    setProblem(null);
    onSubmit({ action, note, ...(nextReview ? { nextReview } : {}) });
  };

  return (
    <form className={styles.step} onSubmit={submit} noValidate>
      {config.intro ? <p className="small">{config.intro}</p> : null}
      {config.noteLabel ? (
        <p className={styles.field}>
          <label className="lbl" htmlFor={noteId}>
            {config.noteLabel}
          </label>
          <textarea
            id={noteId}
            className={`input ${styles.note}`}
            rows={3}
            maxLength={NOTE_MAX_LENGTH}
            value={note}
            required={config.noteRequired}
            aria-invalid={problem === NOTE_MISSING}
            aria-describedby={problem ? problemId : undefined}
            onChange={(event) => setNote(event.target.value)}
          />
        </p>
      ) : null}
      {config.withNextReview ? (
        <p className={styles.field}>
          <label className="lbl" htmlFor={reviewId}>
            Próxima revisión (opcional)
          </label>
          <input
            id={reviewId}
            type="date"
            className="input input-sm"
            min={hoyEnSitio()}
            value={nextReview}
            aria-invalid={problem === DATE_INVALID}
            onChange={(event) => setNextReview(event.target.value)}
          />
        </p>
      ) : null}
      {problem ? (
        <p id={problemId} className={styles.problem} role="alert">
          {problem}
        </p>
      ) : null}
      <div className={styles.buttons}>
        <button className="btn sm" type="submit" disabled={pending} aria-busy={pending}>
          {pending ? ACTION_PENDING_LABEL[action] : config.submitLabel}
        </button>
        <button className="btn sm ghost" type="button" onClick={onCancel} disabled={pending}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
