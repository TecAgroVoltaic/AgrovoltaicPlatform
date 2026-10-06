"use client";
// El servicio no respondió, o respondió mal. Se distingue de los vacíos con su
// propio panel: pide avisar a quien opera el servicio, no evaluar ni filtrar.
// El detalle técnico (método, ruta, código HTTP, mensaje) queda plegado pero a
// mano, para copiarlo en el aviso.
import { IconoAlerta } from "@/app/components/Iconos";
import { describeFailure } from "@/app/components/analitica/alertas/labels";
import styles from "@/app/components/analitica/alertas/states.module.css";
import { useNow } from "@/app/components/analitica/alertas/useNow";
import type { ResourceFailure } from "@/app/components/analitica/alertas/useReloadableResource";
import { elapsedSince } from "@/app/lib/tiempo";

const MARK_ICON_SIZE = 22;
const SECOND_TICK_MS = 1000;

export type ServiceErrorPanelProps = {
  /** Qué se pidió, como lo ve quien opera el servicio: «GET /alertas». */
  readonly request: string;
  readonly lastFailure: ResourceFailure | null;
  readonly onRetry?: () => void;
};

export function ServiceErrorPanel({ request, lastFailure, onRetry }: ServiceErrorPanelProps) {
  const now = useNow(SECOND_TICK_MS);
  const failure = lastFailure?.failure;
  return (
    <section className={styles.panel} data-tone="error" role="alert" aria-label="No se pudieron cargar las alertas">
      <span className={styles.mark} data-tone="error" aria-hidden="true">
        <IconoAlerta size={MARK_ICON_SIZE} />
      </span>
      <h2 className={styles.heading}>No se pudieron cargar las alertas</h2>
      <p className={styles.text}>
        {failure ? describeFailure(failure) : "El servicio de alertas no respondió."} Que la lista no se vea no quiere
        decir que no haya alertas.
      </p>
      {failure ? (
        <details className={styles.details}>
          <summary>Detalle técnico</summary>
          <p className={styles.technical}>
            {request} → {failure.status ?? "sin respuesta HTTP"} · {failure.code} · {failure.message}
          </p>
        </details>
      ) : null}
      <div className={styles.actions}>
        {onRetry ? (
          <button type="button" className={styles.primary} onClick={onRetry}>
            Reintentar
          </button>
        ) : null}
        {lastFailure ? <span className={styles.since}>último intento {elapsedSince(lastFailure.at, now)}</span> : null}
      </div>
    </section>
  );
}
