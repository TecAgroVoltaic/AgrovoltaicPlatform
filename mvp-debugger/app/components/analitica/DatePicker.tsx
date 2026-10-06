"use client";
// Selector de una fecha de calendario: un botón con la fecha corta del sitio que
// abre un calendario mensual en un desplegable no modal.
//
// Propio y no `<input type="date">`: el nativo no deja deshabilitar días sueltos,
// y lo que se pidió es justo eso, que no se pueda elegir un día sin datos.
//
// El desplegable atrapa el foco (Tab da la vuelta adentro), Escape lo cierra
// SIN cerrar el desplegable que lo contenga (el chip de contexto del Asistente
// también cierra con Escape) y un clic afuera lo cierra.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

import { dayAvailability } from "@/app/components/analitica/datePicker/availability";
import { IconCalendar } from "@/app/components/analitica/datePicker/icons";
import { MonthCalendar } from "@/app/components/analitica/datePicker/MonthCalendar";
import { horizontalShift } from "@/app/components/analitica/datePicker/placement";
import styles from "@/app/components/analitica/datePicker/datePicker.module.css";
import { VERIFIED_COVERAGE } from "@/app/lib/analitica/coverage";
import { addDays, type IsoDate } from "@/app/lib/analitica/dateRange";
import type { DaysWithDataState } from "@/app/lib/analitica/useDaysWithData";
import { fechaCorta, hoyEnSitio } from "@/app/lib/tiempo";

// Medir antes de pintar evita un cuadro con el calendario fuera de la pantalla;
// en el servidor no hay layout y useLayoutEffect solo dejaría un aviso.
const useLayoutEffectInBrowser = typeof window === "undefined" ? useEffect : useLayoutEffect;

const FOCUSABLE_SELECTOR = 'button:not([disabled]):not([tabindex="-1"]), select:not([disabled])';

export type DatePickerProps = {
  /** id del botón; el `<label htmlFor>` del formulario apunta acá. */
  readonly id: string;
  /** id del rótulo visible: el botón se nombra «rótulo + fecha». */
  readonly labelId: string;
  readonly value: IsoDate;
  readonly onChange: (date: IsoDate) => void;
  readonly daysWithData: DaysWithDataState;
};

export function DatePicker({ id, labelId, value, onChange, daysWithData }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [shiftPx, setShiftPx] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const valueId = useId();
  const popoverId = useId();
  const availability = dayAvailability(daysWithData);
  const coverage = daysWithData.status === "ready" ? daysWithData.bounds : VERIFIED_COVERAGE;

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useLayoutEffectInBrowser(() => {
    const popover = popoverRef.current;
    if (!open || !popover) {
      setShiftPx(0);
      return;
    }
    const { left, width } = popover.getBoundingClientRect();
    setShiftPx(horizontalShift({ left, width }, document.documentElement.clientWidth));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !wrapperRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function onPopoverKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === "Tab") trapFocus(event);
  }

  function trapFocus(event: KeyboardEvent<HTMLDivElement>) {
    const focusables = Array.from(popoverRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div ref={wrapperRef} className={styles.picker}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`input input-sm ${styles.trigger}`}
        aria-labelledby={`${labelId} ${valueId}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <IconCalendar />
        <span id={valueId}>{fechaCorta(value, true)}</span>
      </button>
      {open ? (
        <div
          ref={popoverRef}
          id={popoverId}
          role="dialog"
          aria-labelledby={labelId}
          className={styles.popover}
          style={{ transform: `translateX(${shiftPx}px)` }}
          onKeyDown={onPopoverKeyDown}
        >
          <MonthCalendar
            initialDate={value}
            selectedDate={value}
            today={hoyEnSitio()}
            availability={availability}
            span={{ first: coverage.from, last: addDays(coverage.toExclusive, -1) }}
            onSelect={(date) => {
              onChange(date);
              close();
            }}
          />
          <p className={styles.note} role="status">
            {availability.note}
          </p>
        </div>
      ) : null}
    </div>
  );
}
