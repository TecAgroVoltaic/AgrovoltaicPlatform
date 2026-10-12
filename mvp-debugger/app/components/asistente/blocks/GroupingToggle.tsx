"use client";
// «Junto» o «Por fuente»: un archivo con todo, o uno por cada fuente.
import styles from "@/app/components/asistente/blocks/selector.module.css";
import type { FileGrouping } from "@/app/lib/asistente/variableSelection/selectorMessage";

const OPTIONS: readonly { readonly value: FileGrouping; readonly label: string }[] = [
  { value: "together", label: "Junto" },
  { value: "perSource", label: "Por fuente" },
];

export type GroupingToggleProps = {
  readonly value: FileGrouping;
  readonly onChange: (grouping: FileGrouping) => void;
};

export function GroupingToggle({ value, onChange }: GroupingToggleProps) {
  return (
    <div className={styles.toggle} role="group" aria-label="Cómo armar los archivos">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className={styles.toggleOption}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
