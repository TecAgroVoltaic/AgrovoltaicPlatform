"use client";
// El conmutador Simple / Avanzado: dos botones en una píldora. Quien lo pone
// dice en qué modo está (`current`): el cascarón ya lo sabe y así el botón no
// depende de leer la cookie en el navegador ni parpadea al hidratar.
import { useModeSwitch } from "@/app/lib/modo/useModeSwitch";
import type { Mode } from "@/app/lib/modo/mode";
import styles from "@/app/components/modo/modeToggle.module.css";

const OPTIONS: readonly { readonly mode: Mode; readonly label: string }[] = [
  { mode: "simple", label: "Simple" },
  { mode: "avanzado", label: "Avanzado" },
];

export type ModeToggleProps = {
  readonly current: Mode;
  readonly className?: string;
};

export function ModeToggle({ current, className }: ModeToggleProps) {
  const switchMode = useModeSwitch();
  return (
    <div className={`${styles.toggle} ${className ?? ""}`} role="group" aria-label="Modo de la consola">
      {OPTIONS.map(({ mode, label }) => {
        const active = mode === current;
        return (
          <button
            key={mode}
            type="button"
            className={styles.option}
            aria-pressed={active}
            onClick={active ? undefined : () => switchMode(mode)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
