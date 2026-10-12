"use client";
// Las cuatro sugerencias de la bienvenida, en píldoras con ícono. Las preguntas
// salen de `useExamples`, el mismo mecanismo del estado vacío del Asistente:
// llevan fechas que SÍ tienen datos, así que la primera respuesta nunca es «no
// hay datos» por culpa de una sugerencia nuestra.
import type { ComponentType } from "react";

import { IconoCalidad, IconoDatos, IconoDescarga, IconoSerie } from "@/app/components/Iconos";
import styles from "@/app/components/inicio/welcome.module.css";
import type { IntentKind } from "@/app/lib/asistente/intents";
import { useExamples } from "@/app/lib/asistente/useExamples";

const ICON_SIZE = 16;

const INTENT_ICON: Readonly<Record<IntentKind, ComponentType<{ size?: number }>>> = {
  query: IconoDatos,
  chart: IconoSerie,
  download: IconoDescarga,
  diagnose: IconoCalidad,
};

export type SuggestionPillsProps = {
  readonly onAsk: (question: string) => void;
  readonly disabled: boolean;
};

export function SuggestionPills({ onAsk, disabled }: SuggestionPillsProps) {
  const { examples } = useExamples();
  return (
    <ul className={styles.suggestions} aria-label="Sugerencias">
      {examples.map((example) => {
        const Icon = INTENT_ICON[example.kind];
        return (
          <li key={example.kind}>
            <button type="button" className={styles.pill} disabled={disabled} onClick={() => onAsk(example.question)}>
              <Icon size={ICON_SIZE} />
              <span>{example.question}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
