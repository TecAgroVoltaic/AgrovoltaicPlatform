"use client";
// Dónde se escribe la pregunta. Enter envía y Mayús+Enter salta de línea; con
// una respuesta en curso el botón pasa a «Detener», que la cancela.
import { useState, type FormEvent, type KeyboardEvent } from "react";

import styles from "@/app/components/asistente/asistente.module.css";

export type ComposerProps = {
  readonly busy: boolean;
  readonly onSend: (question: string) => void;
  readonly onCancel: () => void;
};

export function Composer({ busy, onSend, onCancel }: ComposerProps) {
  const [draft, setDraft] = useState("");
  const canSend = !busy && draft.trim().length > 0;

  function submit() {
    if (!canSend) return;
    onSend(draft);
    setDraft("");
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form className={styles.composer} onSubmit={onSubmit}>
      <textarea
        aria-label="Pregunta para el asistente"
        rows={2}
        value={draft}
        placeholder="Preguntá sobre los datos de la planta…"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
      />
      {busy ? (
        <button className="btn ghost" type="button" onClick={onCancel}>
          Detener
        </button>
      ) : (
        <button className="btn" type="submit" disabled={!canSend}>
          Enviar
        </button>
      )}
    </form>
  );
}
