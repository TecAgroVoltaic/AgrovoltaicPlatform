"use client";
// Lo que se ve antes de la primera pregunta: qué se le puede pedir al asistente,
// un ejemplo de cada intención que se manda con un clic, y los hilos recientes.
//
// La línea de cobertura no lleva fechas a propósito: la única cobertura a mano
// (`VERIFIED_COVERAGE`) quedó vieja con la carga de setiembre, y ningún dato que
// esta vista ya pida la publica. Una fecha equivocada acá contestaría mal la
// primera pregunta antes de que la persona la haga.
import type { ComponentType } from "react";

import {
  IconDiagnose,
  IconDownload,
  IconSearch,
  IconSun,
  IconTrend,
} from "@/app/components/asistente/AssistantIcons";
import styles from "@/app/components/asistente/empty.module.css";
import { EXAMPLE_INTENTS, type IntentKind } from "@/app/lib/asistente/intents";
import type { Thread } from "@/app/lib/asistente/threads";

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
  return (
    <div className={styles.empty}>
      <div className={styles.intro}>
        <div className={styles.mark} aria-hidden="true">
          <IconSun size={MARK_ICON_SIZE} strokeWidth={MARK_ICON_STROKE} />
        </div>
        <h2 className={styles.heading}>¿Qué querés saber de la planta?</h2>
        <p className={styles.lead}>
          Datos de la planta de San Carlos. Respondo con los mismos cálculos de las vistas, grafico y
          preparo descargas.
        </p>
      </div>

      <div className={styles.grid}>
        {EXAMPLE_INTENTS.map((intent) => {
          const Icon = INTENT_ICON[intent.kind];
          return (
            <div key={intent.kind} className={styles.intent}>
              <span className={styles.intentTitle}>
                <Icon size={INTENT_ICON_SIZE} strokeWidth={INTENT_ICON_STROKE} />
                {intent.title}
              </span>
              <button type="button" className={styles.example} disabled={disabled} onClick={() => onAsk(intent.example)}>
                <span className={styles.exampleText}>{intent.example}</span>
              </button>
              <span className={styles.scope}>{intent.scope}</span>
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
