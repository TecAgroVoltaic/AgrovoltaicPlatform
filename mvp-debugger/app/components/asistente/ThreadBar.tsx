"use client";
// La barra de hilos: elegir una conversación guardada, empezar otra o borrar la
// actual. Mientras llega una respuesta queda quieta: cambiar de hilo a mitad
// dejaría la respuesta guardándose en un hilo que ya no se está mirando.
import styles from "@/app/components/asistente/asistente.module.css";
import type { Thread } from "@/app/lib/asistente/threads";

const NEW_THREAD_VALUE = "";

export type ThreadBarProps = {
  readonly threads: readonly Thread[];
  readonly active: Thread | null;
  readonly busy: boolean;
  readonly onOpen: (threadId: string) => void;
  readonly onNew: () => void;
  readonly onDelete: (threadId: string) => void;
};

export function ThreadBar({ threads, active, busy, onOpen, onNew, onDelete }: ThreadBarProps) {
  if (threads.length === 0) return null;
  return (
    <div className={styles.threadBar}>
      <select
        className={`input input-sm ${styles.threadSelect}`}
        aria-label="Conversaciones guardadas"
        value={active?.id ?? NEW_THREAD_VALUE}
        disabled={busy}
        onChange={(event) => (event.target.value ? onOpen(event.target.value) : onNew())}
      >
        <option value={NEW_THREAD_VALUE}>Conversación nueva</option>
        {threads.map((thread) => (
          <option key={thread.id} value={thread.id}>
            {thread.title}
          </option>
        ))}
      </select>
      <button type="button" className="btn ghost sm" disabled={busy || !active} onClick={onNew}>
        Nueva
      </button>
      <button
        type="button"
        className="btn ghost sm"
        disabled={busy || !active}
        onClick={() => active && onDelete(active.id)}
      >
        Borrar
      </button>
      {active ? (
        <p className={styles.context} title={active.context}>
          Contexto: {active.context}
        </p>
      ) : null}
    </div>
  );
}
