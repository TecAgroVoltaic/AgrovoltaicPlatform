"use client";
// Un mes del calendario: cabecera y grilla de días. El cursor (`active`) es la
// única pieza de estado: el mes visible es el del cursor, así teclado, flechas y
// salto rápido no pueden desincronizarse.
//
// Patrón de grilla de WAI-ARIA: un solo día en el orden de tabulación (el del
// cursor) y las flechas lo mueven; Enter elige, salvo que el día no tenga datos.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { isSelectableDay, type DayAvailability } from "@/app/components/analitica/datePicker/availability";
import { monthWeeks, moveByKey } from "@/app/components/analitica/datePicker/calendarMonth";
import { DayButton } from "@/app/components/analitica/datePicker/DayButton";
import { MonthHeader } from "@/app/components/analitica/datePicker/MonthHeader";
import styles from "@/app/components/analitica/datePicker/datePicker.module.css";
import type { IsoDate } from "@/app/lib/analitica/dateRange";

const WEEKDAYS = [
  { short: "lu", full: "lunes" },
  { short: "ma", full: "martes" },
  { short: "mi", full: "miércoles" },
  { short: "ju", full: "jueves" },
  { short: "vi", full: "viernes" },
  { short: "sá", full: "sábado" },
  { short: "do", full: "domingo" },
];

export type MonthCalendarProps = {
  readonly initialDate: IsoDate;
  /** null = todavía no se eligió ninguna. */
  readonly selectedDate: IsoDate | null;
  readonly today: IsoDate;
  readonly availability: DayAvailability;
  /** Primer y último día que ofrece el salto rápido de mes. */
  readonly span: { readonly first: IsoDate; readonly last: IsoDate };
  readonly onSelect: (date: IsoDate) => void;
};

export function MonthCalendar({ initialDate, selectedDate, today, availability, span, onSelect }: MonthCalendarProps) {
  const [active, setActive] = useState(initialDate);
  const gridRef = useRef<HTMLTableElement>(null);
  // El foco va al cursor al abrir y tras una tecla, NO tras usar la cabecera:
  // robarle el foco al selector de mes dejaría a la persona sin saber dónde está.
  const focusActiveDay = useRef(true);
  const monthTitleId = useId();

  useEffect(() => {
    if (!focusActiveDay.current) return;
    focusActiveDay.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${active}"]`)?.focus();
  }, [active]);

  function choose(date: IsoDate) {
    setActive(date);
    if (isSelectableDay(availability, date)) onSelect(date);
  }

  function onGridKeyDown(event: KeyboardEvent<HTMLTableElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      choose(active);
      return;
    }
    const next = moveByKey(active, event.key);
    if (next === null) return;
    event.preventDefault();
    focusActiveDay.current = true;
    setActive(next);
  }

  return (
    <>
      <MonthHeader
        active={active}
        span={span}
        selectableDays={availability.selectableDays}
        monthTitleId={monthTitleId}
        onNavigate={setActive}
      />
      <table ref={gridRef} role="grid" className={styles.grid} aria-labelledby={monthTitleId} onKeyDown={onGridKeyDown}>
        <thead>
          <tr>
            {WEEKDAYS.map((weekday) => (
              <th key={weekday.short} scope="col" abbr={weekday.full} className={styles.weekday}>
                {weekday.short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {monthWeeks(active).map((week, weekIndex) => (
            <tr key={weekIndex}>
              {week.map((day, dayIndex) =>
                day === null ? (
                  <td key={dayIndex} />
                ) : (
                  <td key={day} aria-selected={day === selectedDate}>
                    <DayButton
                      date={day}
                      isActive={day === active}
                      isSelected={day === selectedDate}
                      isToday={day === today}
                      isSelectable={isSelectableDay(availability, day)}
                      unavailableLabel={availability.unavailableLabel}
                      onChoose={choose}
                    />
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
