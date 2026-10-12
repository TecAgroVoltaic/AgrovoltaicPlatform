"use client";
// La cabecera del chat en modo simple: la barra limpia con dos íconos, abrir los
// hilos y empezar otra conversación. Recibe lo mismo que `ThreadHeader` para
// enchufarse en `AssistantView` sin que el chat sepa en qué modo está.
import { IconChat, IconPlus } from "@/app/components/asistente/AssistantIcons";
import type { ThreadHeaderProps } from "@/app/components/asistente/ThreadHeader";
import { SimpleTopBar } from "@/app/components/inicio/SimpleTopBar";
import styles from "@/app/components/inicio/simpleTopBar.module.css";

const ICON_SIZE = 18;

export function SimpleHeader({ thread, busy, threadsOpen, threadsPanelId, onOpenThreads, onNew }: ThreadHeaderProps) {
  return (
    <SimpleTopBar
      start={
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Abrir hilos"
          aria-haspopup="dialog"
          aria-expanded={threadsOpen}
          aria-controls={threadsPanelId}
          onClick={onOpenThreads}
        >
          <IconChat size={ICON_SIZE} />
        </button>
      }
      end={
        thread ? (
          <button type="button" className={styles.iconButton} aria-label="Nueva conversación" disabled={busy} onClick={onNew}>
            <IconPlus size={ICON_SIZE} />
          </button>
        ) : null
      }
    />
  );
}
