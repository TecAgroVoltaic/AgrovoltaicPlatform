"use client";
// La cabecera del hilo, en una sola fila: abrir el cajón de hilos, el título del
// hilo con cuántos mensajes tiene y cuándo se movió, el chip de contexto, lo que
// lleva gastado y «Nueva». En pantallas angostas trae además el botón del menú
// de secciones, porque esta sección no recibe la barra superior del cascarón.
import { IconChat, IconPlus } from "@/app/components/asistente/AssistantIcons";
import styles from "@/app/components/asistente/header.module.css";
import { RangeChip } from "@/app/components/analitica/RangeChip";
import { SectionMenuButton } from "@/app/components/analitica/SectionMenuButton";
import { formatUsd, messageCountLabel, threadCostUsd } from "@/app/lib/asistente/presentation";
import type { Thread } from "@/app/lib/asistente/threads";
import { momentoEnSitio } from "@/app/lib/tiempo";

const ICON_SIZE = 16;
const PLUS_ICON_SIZE = 14;
const PLUS_ICON_STROKE = 2;
const NEW_THREAD_TITLE = "Nueva conversación";
const CONTEXT_TITLE = "Rango de contexto";
const CONTEXT_FORM_ID_PREFIX = "contexto-rango";
const NOTE_WITH_THREAD =
  "Este hilo conserva el rango con que se abrió; el nuevo viaja con la próxima conversación.";
const NOTE_WITHOUT_THREAD =
  "Viaja como contexto de la próxima conversación: es el período que el asistente toma cuando la pregunta no nombra otro.";

export type ThreadHeaderProps = {
  readonly thread: Thread | null;
  readonly busy: boolean;
  readonly threadsOpen: boolean;
  readonly threadsPanelId: string;
  readonly onOpenThreads: () => void;
  readonly onNew: () => void;
};

export function ThreadHeader({ thread, busy, threadsOpen, threadsPanelId, onOpenThreads, onNew }: ThreadHeaderProps) {
  const cost = thread ? threadCostUsd(thread) : null;

  return (
    <header className={styles.header}>
      <SectionMenuButton className={styles.menu} />
      <button
        type="button"
        className={`${styles.iconButton} ${styles.threads}`}
        aria-label="Abrir hilos"
        aria-haspopup="dialog"
        aria-expanded={threadsOpen}
        aria-controls={threadsPanelId}
        onClick={onOpenThreads}
      >
        <IconChat size={ICON_SIZE} />
      </button>
      <div className={styles.titleBlock}>
        <h1 className={styles.title} title={thread?.title}>
          {thread?.title ?? NEW_THREAD_TITLE}
        </h1>
        {thread ? (
          <span className={styles.meta}>
            {messageCountLabel(thread.messages.length)} · {momentoEnSitio(new Date(thread.updatedAt))}
          </span>
        ) : null}
      </div>
      {/* Con un hilo abierto el rango nuevo NO le llega: el hilo conserva el
          contexto con que se abrió. Se avisa en el desplegable. */}
      <RangeChip
        title={CONTEXT_TITLE}
        formIdPrefix={CONTEXT_FORM_ID_PREFIX}
        note={thread !== null ? NOTE_WITH_THREAD : NOTE_WITHOUT_THREAD}
        className={styles.context}
        chipClassName={styles.contextChip}
      />
      {cost !== null ? (
        <span className={styles.cost} title="Costo de este hilo">
          {formatUsd(cost)}
        </span>
      ) : null}
      {thread ? (
        <button
          type="button"
          className={`${styles.button} ${styles.newThread}`}
          aria-label="Nueva conversación"
          disabled={busy}
          onClick={onNew}
        >
          <IconPlus size={PLUS_ICON_SIZE} strokeWidth={PLUS_ICON_STROKE} />
          <span className={styles.newLabel}>Nueva</span>
        </button>
      ) : null}
    </header>
  );
}
