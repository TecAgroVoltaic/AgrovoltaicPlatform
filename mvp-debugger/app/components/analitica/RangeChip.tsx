"use client";
// El chip de rango de las secciones con cabecera propia: el rango de la URL en
// corto («3 may – 1 jun 2026 · diaria») que despliega el mismo formulario de
// rango del resto de la consola. Lo usan el Asistente (como contexto del hilo) y
// Alertas (como período de la lista).
//
// Es un desplegable NO modal (la página sigue viva detrás): Escape y un clic
// afuera lo cierran, y el foco vuelve al chip.
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { IconCalendar, IconChevronDown } from "@/app/components/asistente/AssistantIcons";
import { RangeForm } from "@/app/components/analitica/RangeForm";
import styles from "@/app/components/analitica/rangeChip.module.css";
import { rangeLabel } from "@/app/lib/analitica/rangeLabel";
import { useDateRange } from "@/app/lib/analitica/useDateRange";

const CALENDAR_ICON_SIZE = 13;
const CHEVRON_ICON_SIZE = 12;
const ICON_STROKE = 2;

export type RangeChipProps = {
  /** Qué es este rango para la sección: nombra el chip y su desplegable. */
  readonly title: string;
  /** Prefijo de los ids del formulario: dos chips en la misma página no chocan. */
  readonly formIdPrefix: string;
  /** Qué pasa con el rango nuevo, en una línea bajo el formulario. */
  readonly note?: string;
  /** Clases de la sección para ubicar o compactar el chip en su cabecera. */
  readonly className?: string;
  readonly chipClassName?: string;
};

export function RangeChip({ title, formIdPrefix, note, className, chipClassName }: RangeChipProps) {
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
      // Un Escape ya atendido adentro (el calendario del rango) no es para el chip.
      if (event.key === "Escape" && !event.defaultPrevented) close();
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
    <div ref={wrapperRef} className={`${styles.context} ${className ?? ""}`}>
      <button
        ref={chipRef}
        type="button"
        className={`${styles.chip} ${chipClassName ?? ""}`}
        aria-label={`${title}: ${label}. Cambiar`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <IconCalendar size={CALENDAR_ICON_SIZE} strokeWidth={ICON_STROKE} />
        <span>{label}</span>
        <IconChevronDown size={CHEVRON_ICON_SIZE} strokeWidth={ICON_STROKE} />
      </button>
      {open ? (
        <div ref={panelRef} id={panelId} className={styles.popover} role="dialog" aria-label={title}>
          <p className={styles.popoverTitle}>{title}</p>
          <RangeForm idPrefix={formIdPrefix} onApplied={close} />
          {note ? <p className={styles.popoverNote}>{note}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
