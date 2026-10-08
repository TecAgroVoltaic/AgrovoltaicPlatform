"use client";
// El cajón de hilos: elegir una conversación guardada, empezar otra o borrar
// una, con confirmación en el mismo renglón.
//
// Mientras llega una respuesta no se cambia de hilo ni se borra: la respuesta
// se guardaría en un hilo que ya no se está mirando (o que ya no existe).
import { useState } from "react";

import { IconClose, IconPlus, IconTrash } from "@/app/components/asistente/AssistantIcons";
import styles from "@/app/components/asistente/drawer.module.css";
import { messageCountLabel } from "@/app/lib/asistente/presentation";
import type { Thread } from "@/app/lib/asistente/threads";
import { useModalDialog } from "@/app/lib/asistente/useModalDialog";
import { momentoEnSitio } from "@/app/lib/tiempo";

const ICON_SIZE = 14;
const ICON_STROKE = 2;

export type ThreadDrawerProps = {
  readonly id: string;
  readonly open: boolean;
  readonly threads: readonly Thread[];
  readonly activeId: string | null;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onOpenThread: (threadId: string) => void;
  readonly onNew: () => void;
  readonly onDelete: (threadId: string) => void;
};

export function ThreadDrawer(props: ThreadDrawerProps) {
  const { id, open, threads, activeId, busy, onClose, onOpenThread, onNew, onDelete } = props;
  const dialogRef = useModalDialog(open, onClose);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const choose = (threadId: string) => {
    onOpenThread(threadId);
    onClose();
  };

  return (
    <dialog ref={dialogRef} id={id} className={styles.drawer} aria-labelledby={`${id}-titulo`}>
      <div className={styles.drawerBody}>
        <div className={styles.drawerHead}>
          <h2 id={`${id}-titulo`} className={styles.drawerTitle}>
            Conversaciones
          </h2>
          <button
            type="button"
            className={styles.newThread}
            disabled={busy}
            onClick={() => {
              onNew();
              onClose();
            }}
          >
            <IconPlus size={ICON_SIZE} strokeWidth={ICON_STROKE} />
            Nueva
          </button>
          <button type="button" className={styles.close} aria-label="Cerrar hilos" onClick={onClose}>
            <IconClose size={ICON_SIZE} strokeWidth={ICON_STROKE} />
          </button>
        </div>
        {busy ? <p className={styles.busyNote}>Esperá a que termine la respuesta en curso para cambiar de hilo.</p> : null}
        {threads.length === 0 ? (
          <p className={styles.emptyNote}>Todavía no hay conversaciones guardadas en este navegador.</p>
        ) : (
          <ul className={styles.list}>
            {threads.map((thread) => (
              <li key={thread.id} className={`${styles.row} ${thread.id === activeId ? styles.rowActive : ""}`}>
                {confirmingId === thread.id ? (
                  <DeleteConfirmation
                    title={thread.title}
                    onConfirm={() => {
                      setConfirmingId(null);
                      onDelete(thread.id);
                    }}
                    onCancel={() => setConfirmingId(null)}
                  />
                ) : (
                  <ThreadRow
                    thread={thread}
                    active={thread.id === activeId}
                    busy={busy}
                    onChoose={() => choose(thread.id)}
                    onAskDelete={() => setConfirmingId(thread.id)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
  );
}

type ThreadRowProps = {
  readonly thread: Thread;
  readonly active: boolean;
  readonly busy: boolean;
  readonly onChoose: () => void;
  readonly onAskDelete: () => void;
};

function ThreadRow({ thread, active, busy, onChoose, onAskDelete }: ThreadRowProps) {
  return (
    <>
      <button type="button" className={styles.open} disabled={busy} aria-current={active ? "true" : undefined} onClick={onChoose}>
        <span className={styles.openTitle}>{thread.title}</span>
        <span className={styles.openMeta}>
          {messageCountLabel(thread.messages.length)} · {momentoEnSitio(new Date(thread.updatedAt))}
        </span>
      </button>
      <button type="button" className={styles.remove} disabled={busy} aria-label={`Borrar «${thread.title}»`} onClick={onAskDelete}>
        <IconTrash size={ICON_SIZE} strokeWidth={ICON_STROKE} />
      </button>
    </>
  );
}

type DeleteConfirmationProps = { readonly title: string; readonly onConfirm: () => void; readonly onCancel: () => void };

function DeleteConfirmation({ title, onConfirm, onCancel }: DeleteConfirmationProps) {
  return (
    <div className={styles.confirm} role="group" aria-label={`Confirmar el borrado de «${title}»`}>
      <p className={styles.confirmText}>¿Borrar esta conversación? No se puede deshacer.</p>
      {/* El foco cae en Cancelar: borrar tiene que ser una decisión, no un Enter de más. */}
      <button type="button" className={styles.confirmCancel} autoFocus onClick={onCancel}>
        Cancelar
      </button>
      <button type="button" className={styles.confirmDelete} onClick={onConfirm}>
        Borrar
      </button>
    </div>
  );
}
