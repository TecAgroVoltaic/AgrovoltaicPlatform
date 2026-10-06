"use client";
// El cajón de la ficha: 540 px a la derecha en escritorio, pantalla completa en
// un teléfono (lo decide el CSS). Se comporta como diálogo: toma el foco al
// abrir, Escape lo cierra, el tabulador no se escapa, y quien lo abrió recupera
// el foco al cerrar (eso lo hace la vista, que sabe qué fila fue).
import { useEffect, useId, useRef } from "react";

import { IconClose } from "@/app/components/asistente/AssistantIcons";
import { AlertDetailPanel } from "@/app/components/analitica/alertas/AlertDetailPanel";
import styles from "@/app/components/analitica/alertas/drawer.module.css";

const FOCUSABLE =
  "a[href], button:not([disabled]):not([tabindex='-1']), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary";
const CLOSE_ICON_SIZE = 14;
const CLOSE_ICON_STROKE = 2.2;

export type AlertDrawerProps = {
  readonly alertId: number;
  readonly onClose: () => void;
  readonly onChanged: () => void;
};

/** Con `aria-modal` el lector de pantalla ya no ve lo de atrás; el tabulador
 *  tampoco tiene que llegar ahí, o el foco cae en una lista tapada por el velo. */
function keepFocusInside(panel: HTMLElement, event: KeyboardEvent): void {
  const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return;
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !panel.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

export function AlertDrawer({ alertId, onClose, onChanged }: AlertDrawerProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, [alertId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Un Escape ya atendido adentro (el calendario de la próxima revisión)
      // cierra solo eso, no la ficha entera.
      if (event.key === "Escape" && !event.defaultPrevented) onClose();
      if (event.key === "Tab" && panelRef.current) keepFocusInside(panelRef.current, event);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      {/* Sin rol ni foco, como el velo del menú: cerrar con teclado es tarea
          de Escape y del botón, que sí están en el orden de tabulación. */}
      <div className={styles.scrim} onClick={onClose} aria-hidden="true" />
      <aside ref={panelRef} className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <button ref={closeRef} type="button" className={styles.close} onClick={onClose} aria-label="Cerrar la ficha">
          <IconClose size={CLOSE_ICON_SIZE} strokeWidth={CLOSE_ICON_STROKE} />
        </button>
        <AlertDetailPanel key={alertId} alertId={alertId} titleId={titleId} onChanged={onChanged} />
      </aside>
    </>
  );
}
