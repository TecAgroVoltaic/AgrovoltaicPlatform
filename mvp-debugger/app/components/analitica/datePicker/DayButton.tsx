"use client";
// Un día de la grilla. Sin datos lleva `aria-disabled` y NO `disabled`: así el
// cursor del teclado puede pasar por él, y el lector de pantalla lo anuncia como
// no disponible en vez de saltearlo como si no existiera.
import styles from "@/app/components/analitica/datePicker/datePicker.module.css";
import type { IsoDate } from "@/app/lib/analitica/dateRange";
import { longDateLabel } from "@/app/lib/tiempo";

const DAY_OF_MONTH_DIGITS = 2;

export type DayButtonProps = {
  readonly date: IsoDate;
  /** El día del cursor: el único que entra en el orden de tabulación. */
  readonly isActive: boolean;
  readonly isSelected: boolean;
  readonly isToday: boolean;
  readonly isSelectable: boolean;
  /** Por qué no se elige, si no se elige: «sin datos», «ya pasó». */
  readonly unavailableLabel: string;
  readonly onChoose: (date: IsoDate) => void;
};

export function DayButton(props: DayButtonProps) {
  const { date, isActive, isSelected, isToday, isSelectable, unavailableLabel, onChoose } = props;
  const label = `${longDateLabel(date)}${isSelectable ? "" : `, ${unavailableLabel}`}${isToday ? ", hoy" : ""}`;
  return (
    <button
      type="button"
      data-date={date}
      className={styles.day}
      tabIndex={isActive ? 0 : -1}
      aria-label={label}
      aria-disabled={isSelectable ? undefined : true}
      aria-current={isToday ? "date" : undefined}
      data-selected={isSelected || undefined}
      data-today={isToday || undefined}
      onClick={() => onChoose(date)}
    >
      {Number(date.slice(-DAY_OF_MONTH_DIGITS))}
    </button>
  );
}
