"use client";
// Los años de la climatología como chips. Mientras se carga queda deshabilitado:
// un segundo clic mientras vuelve la primera consulta no agrega nada.
import { YEAR_SELECTOR_LABEL } from "@/app/components/analitica/tablero/climatologia/labels";
import styles from "@/app/components/analitica/tablero/climatologia/climatology.module.css";

export type YearSelectorProps = {
  readonly years: readonly number[];
  readonly selected: number | null;
  readonly disabled: boolean;
  readonly onSelect: (year: number) => void;
};

export function YearSelector({ years, selected, disabled, onSelect }: YearSelectorProps) {
  return (
    <div className={`chips ${styles.years}`} role="group" aria-label={YEAR_SELECTOR_LABEL} aria-busy={disabled}>
      {years.map((year) => (
        <button
          key={year}
          type="button"
          className={year === selected ? "chip on" : "chip"}
          aria-pressed={year === selected}
          disabled={disabled}
          onClick={() => onSelect(year)}
        >
          {year}
        </button>
      ))}
    </div>
  );
}
