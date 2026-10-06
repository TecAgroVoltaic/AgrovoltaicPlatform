"use client";
// El chip de contexto: el rango de la URL en corto («3 may – 1 jun 2026 ·
// diaria») que despliega el mismo formulario de rango del resto de la consola.
//
// Es un desplegable NO modal (la página sigue viva detrás): Escape y un clic
// afuera lo cierran, y el foco vuelve al chip.
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { IconCalendar, IconChevronDown } from "@/app/components/asistente/AssistantIcons";
import styles from "@/app/components/asistente/header.module.css";
import { RangeForm } from "@/app/components/analitica/RangeForm";
import { useDateRange } from "@/app/lib/analitica/useDateRange";
import { rangeLabel } from "@/app/lib/asistente/presentation";

const CALENDAR_ICON_SIZE = 13;
const CHEVRON_ICON_SIZE = 12;
const ICON_STROKE = 2;
const FORM_ID_PREFIX = "contexto-rango";

export type ContextChipProps = {
  /** Con un hilo abierto el rango nuevo NO le llega: el hilo conserva el
   *  contexto con que se abrió. Se avisa en el desplegable. */
  readonly threadOpen: boolean;
};

export function ContextChip({ threadOpen }: ContextChipProps) {
  const { range } = useDateRange();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const label = rangeLabel(range);

  const close = useCallback(() => {
    setOpen(false);
    chipRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("button, select")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapperRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, close]);

  return (
    <div ref={wrapperRef} className={styles.context}>
      <button
        ref={chipRef}
        type="button"
        className={styles.contextChip}
        aria-label={`Rango de contexto: ${label}. Cambiar`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <IconCalendar size={CALENDAR_ICON_SIZE} strokeWidth={ICON_STROKE} />
        <span>{label}</span>
        <IconChevronDown size={CHEVRON_ICON_SIZE} strokeWidth={ICON_STROKE} />
      </button>
      {open ? (
        <div ref={panelRef} id={panelId} className={styles.popover} role="dialog" aria-label="Rango de contexto">
          <p className={styles.popoverTitle}>Rango de contexto</p>
          <RangeForm idPrefix={FORM_ID_PREFIX} onApplied={close} />
          <p className={styles.popoverNote}>
            {threadOpen
              ? "Este hilo conserva el rango con que se abrió; el nuevo viaja con la próxima conversación."
              : "Viaja como contexto de la próxima conversación: es el período que el asistente toma cuando la pregunta no nombra otro."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
