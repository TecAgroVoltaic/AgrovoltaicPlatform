"use client";
// Dónde se escribe la pregunta. Enter envía y Mayús+Enter salta de línea; la
// caja crece con el texto hasta unas seis líneas; los chips de intención la
// rellenan con una plantilla para editar. Con una respuesta en curso, el botón
// de enviar pasa a «Detener».
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { IconArrowUp, IconStop } from "@/app/components/asistente/AssistantIcons";
import styles from "@/app/components/asistente/composer.module.css";
import { COMPOSER_INTENTS, TEMPLATE_PLACEHOLDER } from "@/app/lib/asistente/intents";

const FIELD_ID = "asistente-pregunta";
const SEND_ICON_SIZE = 18;
const SEND_ICON_STROKE = 2.4;
const STOP_ICON_SIZE = 14;

export type ComposerProps = {
  readonly busy: boolean;
  readonly onSend: (question: string) => void;
  readonly onCancel: () => void;
  /** En el estado vacío los chips sobran: ahí están las tarjetas de intención. */
  readonly showIntents: boolean;
};

export function Composer({ busy, onSend, onCancel, showIntents }: ComposerProps) {
  const [draft, setDraft] = useState("");
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  // Qué dejar seleccionado después de rellenar una plantilla. Es un pedido
  // numerado y no un booleano: pulsar dos veces el mismo chip tiene que volver
  // a enfocar aunque el texto no cambie.
  const [fill, setFill] = useState<{ readonly seq: number; readonly start: number; readonly end: number } | null>(null);
  const canSend = !busy && draft.trim().length > 0;

  // La caja crece con el texto; el tope lo pone `max-height` en la hoja. Vacía
  // vuelve a su alto de un renglón: medida, contaría la pista ya envuelta.
  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = "auto";
    if (draft) field.style.height = `${field.scrollHeight}px`;
  }, [draft]);

  useEffect(() => {
    if (!fill) return;
    fieldRef.current?.focus();
    fieldRef.current?.setSelectionRange(fill.start, fill.end);
  }, [fill]);

  function applyTemplate(template: string) {
    const placeholderAt = template.indexOf(TEMPLATE_PLACEHOLDER);
    const start = placeholderAt >= 0 ? placeholderAt : template.length;
    const end = placeholderAt >= 0 ? placeholderAt + TEMPLATE_PLACEHOLDER.length : template.length;
    setDraft(template);
    setFill((previous) => ({ seq: (previous?.seq ?? 0) + 1, start, end }));
  }

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
    // Mientras un método de entrada compone (acentos, japonés), Enter confirma
    // la composición y no es un envío.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <>
      <div className={styles.composer}>
        <div className={styles.inner}>
          {showIntents ? (
            <div className={styles.intents} role="group" aria-label="Empezar con una plantilla">
              {COMPOSER_INTENTS.map((intent) => (
                <button key={intent.id} type="button" className={styles.intent} onClick={() => applyTemplate(intent.template)}>
                  {intent.label}
                </button>
              ))}
            </div>
          ) : null}
          <form className={styles.box} onSubmit={onSubmit}>
            <textarea
              ref={fieldRef}
              id={FIELD_ID}
              aria-label="Pregunta para el asistente"
              className={styles.field}
              rows={1}
              value={draft}
              placeholder="Preguntá sobre los datos de la planta…"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
            />
            {busy ? (
              <button className={styles.stop} type="button" aria-label="Detener la respuesta" onClick={onCancel}>
                <IconStop size={STOP_ICON_SIZE} />
              </button>
            ) : (
              <button className={styles.send} type="submit" aria-label="Enviar" disabled={!canSend}>
                <IconArrowUp size={SEND_ICON_SIZE} strokeWidth={SEND_ICON_STROKE} />
              </button>
            )}
          </form>
        </div>
      </div>
      <div className={styles.hints}>
        <span>
          <kbd className={styles.kbd}>Enter</kbd> envía · <kbd className={styles.kbd}>Shift</kbd>+
          <kbd className={styles.kbd}>Enter</kbd> salto de línea
        </span>
        <span className={styles.disclaimer}>Responde con los mismos algoritmos de las vistas · sin datos inventados</span>
      </div>
    </>
  );
}
