"use client";
// Lo que se ve antes de la primera pregunta: qué se le puede pedir al asistente,
// un ejemplo de cada intención que se manda con un clic, y los hilos recientes.
//
// La línea de cobertura y los ejemplos salen de lo que la base de verdad tiene
// (`useExamples`), nunca de fechas escritas a mano: una fecha equivocada acá
// contestaría mal la primera pregunta antes de que la persona la haga.
import type { ComponentType } from "react";

import {
  IconDiagnose,
  IconDownload,
  IconSearch,
  IconSun,
  IconTrend,
} from "@/app/components/asistente/AssistantIcons";
import styles from "@/app/components/asistente/empty.module.css";
import { describeCoverage } from "@/app/lib/asistente/examples";
import type { IntentKind } from "@/app/lib/asistente/intents";
import type { Thread } from "@/app/lib/asistente/threads";
import { useExamples } from "@/app/lib/asistente/useExamples";

const MARK_ICON_SIZE = 22;
const MARK_ICON_STROKE = 2.2;
const INTENT_ICON_SIZE = 16;
const INTENT_ICON_STROKE = 2;
const RECENT_THREADS_SHOWN = 3;

const INTENT_ICON: Readonly<Record<IntentKind, ComponentType<{ size?: number; strokeWidth?: number }>>> = {
  query: IconSearch,
  chart: IconTrend,
  download: IconDownload,
  diagnose: IconDiagnose,
};

export type EmptyStateProps = {
  readonly onAsk: (question: string) => void;
  readonly recentThreads: readonly Thread[];
  readonly onOpenThread: (threadId: string) => void;
  /** Mientras otra respuesta llega no se puede preguntar ni cambiar de hilo. */
  readonly disabled: boolean;
};

export function EmptyState({ onAsk, recentThreads, onOpenThread, disabled }: EmptyStateProps) {
  const recent = recentThreads.slice(0, RECENT_THREADS_SHOWN);
  const { examples, bounds } = useExamples();
  return (
    <div className={styles.empty}>
      <div className={styles.intro}>
        <div className={styles.mark} aria-hidden="true">
          <IconSun size={MARK_ICON_SIZE} strokeWidth={MARK_ICON_STROKE} />
        </div>
        <h2 className={styles.heading}>¿Qué querés saber de la planta?</h2>
        <p className={styles.lead}>
          {describeCoverage(bounds)} Respondo con los mismos cálculos de las vistas, grafico y
          preparo descargas.
        </p>
      </div>

      <div className={styles.grid}>
        {examples.map((example) => {
          const Icon = INTENT_ICON[example.kind];
          return (
            <div key={example.kind} className={styles.intent}>
              <span className={styles.intentTitle}>
                <Icon size={INTENT_ICON_SIZE} strokeWidth={INTENT_ICON_STROKE} />
                {example.title}
              </span>
              <button type="button" className={styles.example} disabled={disabled} onClick={() => onAsk(example.question)}>
                <span className={styles.exampleText}>{example.question}</span>
              </button>
              <span className={styles.scope}>{example.scope}</span>
            </div>
          );
        })}
      </div>

      {recent.length > 0 ? (
        <div className={styles.recent}>
          <span>Hilos recientes:</span>
          {recent.map((thread) => (
            <button
              key={thread.id}
              type="button"
              className={styles.recentThread}
              disabled={disabled}
              onClick={() => onOpenThread(thread.id)}
            >
              <span className={styles.recentTitle}>{thread.title}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
