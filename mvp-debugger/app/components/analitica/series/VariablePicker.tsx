"use client";
// Qué variable se está mirando, sobre el catálogo que publica el backend.
//
// Las que hoy no darían nada NO se esconden: se marcan. Que el SP722 solo tenga
// dieciocho días o que no haya anemómetro en el sitio son hallazgos del proyecto,
// y ocultarlos dejaría un catálogo que parece completo. Elegirlas lleva al
// gráfico vacío CON su explicación, que es lo que enseña.
import { useId } from "react";

import { availabilityOf } from "@/app/components/analitica/series/availability";
import {
  familyLabel,
  orderedFamilies,
  variablesOfFamily,
} from "@/app/components/analitica/series/catalog";
import styles from "@/app/components/analitica/series/series.module.css";
import type { CatalogVariable, VariableCatalog } from "@/app/lib/analitica/contracts/variables";
import type { DateRange } from "@/app/lib/analitica/dateRange";

const UNAVAILABLE_SUFFIX: Readonly<Record<string, string>> = {
  NO_SOURCE: "sin fuente todavía",
  OUT_OF_COVERAGE: "no existía en este rango",
};

export type VariablePickerProps = {
  readonly catalog: VariableCatalog;
  readonly value: string;
  readonly range: DateRange;
  readonly onChange: (key: string) => void;
};

export function VariablePicker({ catalog, value, range, onChange }: VariablePickerProps) {
  const fieldId = useId();
  return (
    <div className={styles.picker}>
      <div className={styles.field}>
        <label className="lbl" htmlFor={fieldId}>
          Variable
        </label>
        <select
          id={fieldId}
          className="select"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {orderedFamilies(catalog).map((family) => (
            <optgroup key={family} label={familyLabel(family)}>
              {variablesOfFamily(catalog, family).map((variable) => (
                <option key={variable.key} value={variable.key}>
                  {optionLabel(variable, range)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
    </div>
  );
}

function optionLabel(variable: CatalogVariable, range: DateRange): string {
  const name = `${variable.label} (${variable.unit})`;
  const availability = availabilityOf(variable, range);
  if (availability.status === "available") return name;
  return `${name} · ${UNAVAILABLE_SUFFIX[availability.reason.code] ?? "sin datos"}`;
}
