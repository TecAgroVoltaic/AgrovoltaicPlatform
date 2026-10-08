"use client";
// La cabecera del calendario: mes anterior, salto directo a un mes y mes
// siguiente. El salto existe porque los datos tienen meses enteros vacíos
// (ene–abr y jul–ago 2025): con solo flechas, llegar de nov-2024 a ago-2026 son
// veintiún clics. Los meses sin ningún día con datos lo dicen en la opción.
import { useMemo } from "react";

import { monthsBetween, monthsWithData, sameDayInMonth } from "@/app/components/analitica/datePicker/calendarMonth";
import { IconChevronLeft, IconChevronRight } from "@/app/components/analitica/datePicker/icons";
import styles from "@/app/components/analitica/datePicker/datePicker.module.css";
import type { IsoDate } from "@/app/lib/analitica/dateRange";
import { monthKey, monthLabel, shiftMonths } from "@/app/lib/tiempo";

const NO_DATA_SUFFIX = " · sin datos";

export type MonthHeaderProps = {
  readonly active: IsoDate;
  /** Primer y último día que ofrece el salto; se estira si el cursor sale. */
  readonly span: { readonly first: IsoDate; readonly last: IsoDate };
  /** null = no se sabe qué días tienen datos, y ningún mes se marca. */
  readonly selectableDays: ReadonlySet<string> | null;
  readonly monthTitleId: string;
  readonly onNavigate: (date: IsoDate) => void;
};

export function MonthHeader({ active, span, selectableDays, monthTitleId, onNavigate }: MonthHeaderProps) {
  const dataMonths = useMemo(() => (selectableDays ? monthsWithData(selectableDays) : null), [selectableDays]);
  const months = monthsBetween(span.first < active ? span.first : active, span.last > active ? span.last : active);

  return (
    <div className={styles.header}>
      <button
        type="button"
        className={styles.navButton}
        aria-label="Mes anterior"
        onClick={() => onNavigate(shiftMonths(active, -1))}
      >
        <IconChevronLeft />
      </button>
      <span id={monthTitleId} className={styles.srOnly} aria-live="polite">
        {monthLabel(active)}
      </span>
      <select
        className={`select ${styles.monthSelect}`}
        aria-label="Ir al mes"
        value={monthKey(active)}
        onChange={(event) => onNavigate(sameDayInMonth(active, event.target.value))}
      >
        {months.map((month) => (
          <option key={month} value={month}>
            {monthLabel(`${month}-01`)}
            {dataMonths && !dataMonths.has(month) ? NO_DATA_SUFFIX : ""}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={styles.navButton}
        aria-label="Mes siguiente"
        onClick={() => onNavigate(shiftMonths(active, 1))}
      >
        <IconChevronRight />
      </button>
    </div>
  );
}
