"use client";
// La cabecera del hilo, en una sola fila: abrir el cajón de hilos, el título del
// hilo con cuántos mensajes tiene y cuándo se movió, el chip de contexto, lo que
// lleva gastado y «Nueva». En pantallas angostas trae además el botón del menú
// de secciones, porque esta sección no recibe la barra superior del cascarón.
import { useRef } from "react";

import { IconChat, IconPlus, IconThreads } from "@/app/components/asistente/AssistantIcons";
import { ContextChip } from "@/app/components/asistente/ContextChip";
import styles from "@/app/components/asistente/header.module.css";
import { useSectionMenu } from "@/app/components/analitica/SectionMenu";
import { SECTION_MENU_ID } from "@/app/components/analitica/SidebarDrawer";
import { formatUsd, messageCountLabel, threadCostUsd } from "@/app/lib/asistente/presentation";
import type { Thread } from "@/app/lib/asistente/threads";
import { momentoEnSitio } from "@/app/lib/tiempo";

const ICON_SIZE = 16;
const PLUS_ICON_SIZE = 14;
const PLUS_ICON_STROKE = 2;
const NEW_THREAD_TITLE = "Nueva conversación";

export type ThreadHeaderProps = {
  readonly thread: Thread | null;
  readonly busy: boolean;
  readonly threadsOpen: boolean;
  readonly threadsPanelId: string;
  readonly onOpenThreads: () => void;
  readonly onNew: () => void;
};

export function ThreadHeader({ thread, busy, threadsOpen, threadsPanelId, onOpenThreads, onNew }: ThreadHeaderProps) {
  const menu = useSectionMenu();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const cost = thread ? threadCostUsd(thread) : null;

  return (
    <header className={styles.header}>
      <button
        ref={menuButtonRef}
        type="button"
        className={styles.menu}
        aria-label="Abrir el menú de secciones"
        aria-expanded={menu.open}
        aria-controls={SECTION_MENU_ID}
        onClick={() => menu.openMenu(menuButtonRef.current)}
      >
        <IconThreads size={ICON_SIZE} />
      </button>
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
      <ContextChip threadOpen={thread !== null} />
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
