"use client";
// Selector de una fecha de calendario: un botón con la fecha corta del sitio que
// abre un calendario mensual en un desplegable no modal.
//
// Propio y no `<input type="date">`: el nativo no deja deshabilitar días sueltos,
// y lo que se pidió es justo eso, que no se pueda elegir un día sin datos.
//
// También sirve para fechas hacia adelante (la próxima revisión de una alerta):
// con `minDate` en vez de `daysWithData` se elige cualquier día desde esa fecha,
// y con `value` nulo el botón muestra `placeholder` hasta que se elija uno.
//
// El desplegable atrapa el foco (Tab da la vuelta adentro), Escape lo cierra
// SIN cerrar el desplegable que lo contenga (el chip de contexto del Asistente
// también cierra con Escape: lo marca con `defaultPrevented`) y un clic afuera
// lo cierra.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

import { pickerDays, type DaySource } from "@/app/components/analitica/datePicker/availability";
import { IconCalendar } from "@/app/components/analitica/datePicker/icons";
import { MonthCalendar } from "@/app/components/analitica/datePicker/MonthCalendar";
import { containingBoundary, horizontalShift } from "@/app/components/analitica/datePicker/placement";
import styles from "@/app/components/analitica/datePicker/datePicker.module.css";
import type { IsoDate } from "@/app/lib/analitica/dateRange";
import { fechaCorta, hoyEnSitio } from "@/app/lib/tiempo";

// Medir antes de pintar evita un cuadro con el calendario fuera de la pantalla;
// en el servidor no hay layout y useLayoutEffect solo dejaría un aviso.
const useLayoutEffectInBrowser = typeof window === "undefined" ? useEffect : useLayoutEffect;

const FOCUSABLE_SELECTOR = 'button:not([disabled]):not([tabindex="-1"]), select:not([disabled])';

const DEFAULT_PLACEHOLDER = "Elegir fecha";

export type DatePickerProps = DaySource & {
  /** id del botón; el `<label htmlFor>` del formulario apunta acá. */
  readonly id: string;
  /** id del rótulo visible: el botón se nombra «rótulo + fecha». */
  readonly labelId: string;
  readonly value: IsoDate | null;
  readonly onChange: (date: IsoDate) => void;
  /** Lo que dice el botón mientras no hay fecha elegida. */
  readonly placeholder?: string;
  /** «above» para un selector al pie de la pantalla, donde abajo no hay sitio. */
  readonly placement?: "below" | "above";
};

export function DatePicker(props: DatePickerProps) {
  const { id, labelId, value, onChange, placeholder = DEFAULT_PLACEHOLDER, placement = "below" } = props;
  const [open, setOpen] = useState(false);
  const [shiftPx, setShiftPx] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const valueId = useId();
  const popoverId = useId();
  const { availability, span } = pickerDays(props);
  const initialDate = value ?? span.first;

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
    setShiftPx(horizontalShift({ left, width }, containingBoundary(wrapperRef.current)));
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
      // preventDefault es la señal para el desplegable que lo contiene: en Next
      // la raíz de React ES el document, y stopPropagation no frena a otro
      // oyente del mismo nodo (el del chip de contexto). Medido en el navegador.
      event.preventDefault();
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
        <span id={valueId}>{value ? fechaCorta(value, true) : placeholder}</span>
      </button>
      {open ? (
        <div
          ref={popoverRef}
          id={popoverId}
          role="dialog"
          aria-labelledby={labelId}
          className={`${styles.popover} ${placement === "above" ? styles.popoverAbove : ""}`}
          style={{ transform: `translateX(${shiftPx}px)` }}
          onKeyDown={onPopoverKeyDown}
        >
          <MonthCalendar
            initialDate={initialDate}
            selectedDate={value}
            today={hoyEnSitio()}
            availability={availability}
            span={span}
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
