"use client";
// Qué variable miran las tres figuras que dependen del foco.
//
// Los nombres son los del sitio, no los de la columna: PV1 es el arreglo
// INCLINADO y PV2 el VERTICAL, y llamarlos PV1 y PV2 a secas ya confundió a más
// de uno leyendo un gráfico.
import { FOCUS_VARIABLES, type FocusVariable } from "@/app/components/analitica/estadistica/focusVariables";

export type VariablePickerProps = {
  readonly selected: FocusVariable;
  readonly onSelect: (variable: FocusVariable) => void;
};

const LABEL = "Variable en foco";

export function VariablePicker({ selected, onSelect }: VariablePickerProps) {
  return (
    <div className="ctl">
      <span className="lbl">{LABEL}</span>
      <div className="chips" role="group" aria-label={LABEL}>
        {FOCUS_VARIABLES.map((variable) => {
          const active = variable.key === selected.key;
          return (
            <button
              key={variable.key}
              type="button"
              className={active ? "chip on" : "chip"}
              aria-pressed={active}
              onClick={() => onSelect(variable)}
            >
              {variable.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
