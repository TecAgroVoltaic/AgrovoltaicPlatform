// Los vacíos de la lista, cada uno con su causa y su salida (ver `emptyListKind`).
import Link from "next/link";
import type { ReactNode } from "react";

import { IconCheck, IconRefresh, IconSearch } from "@/app/components/asistente/AssistantIcons";
import { EvaluateButton } from "@/app/components/analitica/alertas/EvaluateButton";
import { momentLabel } from "@/app/components/analitica/alertas/labels";
import styles from "@/app/components/analitica/alertas/states.module.css";
import type { EvaluationController } from "@/app/components/analitica/alertas/useEvaluation";

const MARK_ICON_SIZE = 22;
const MARK_ICON_STROKE = 2;
const QUALITY_PATH = "/calidad";

type PanelProps = {
  readonly icon: ReactNode;
  readonly tone?: "good";
  readonly align?: "center";
  readonly heading: string;
  readonly children: ReactNode;
};

function Panel({ icon, tone, align, heading, children }: PanelProps) {
  return (
    <section className={styles.panel} data-align={align} role="status" aria-label={heading}>
      <span className={styles.mark} data-tone={tone} aria-hidden="true">
        {icon}
      </span>
      <h2 className={styles.heading}>{heading}</h2>
      {children}
    </section>
  );
}

export function NeverEvaluatedPanel({ evaluation }: { readonly evaluation: EvaluationController }) {
  return (
    <Panel icon={<IconRefresh size={MARK_ICON_SIZE} strokeWidth={MARK_ICON_STROKE} />} heading="Las alertas todavía no se evaluaron">
      <p className={styles.text}>
        El evaluador recorre los hallazgos de calidad y abre una alerta por cada condición que se repite. Corre al final de
        cada carga de datos; también se puede lanzar ahora. Hasta entonces, una lista vacía no dice nada.
      </p>
      <div className={styles.actions}>
        <EvaluateButton evaluation={evaluation} className={styles.primary} />
        <Link className={styles.ghost} href={QUALITY_PATH}>
          Ver hallazgos en Calidad
        </Link>
      </div>
    </Panel>
  );
}

export type NothingOpenPanelProps = {
  readonly periodLabel: string;
  /** `undefined` si no se pudo leer el resumen. */
  readonly lastEvaluation: string | undefined;
  readonly onShowClosed: () => void;
};

export function NothingOpenPanel({ periodLabel, lastEvaluation, onShowClosed }: NothingOpenPanelProps) {
  const evaluated = lastEvaluation
    ? `evaluado ${momentLabel(lastEvaluation)}`
    : "no se pudo saber cuándo se evaluó por última vez";
  return (
    <Panel
      icon={<IconCheck size={MARK_ICON_SIZE} strokeWidth={MARK_ICON_STROKE} />}
      tone="good"
      align="center"
      heading="Nada pide atención en este período"
    >
      <p className={styles.text}>
        {periodLabel} · {evaluated}. Las alertas que ya se cerraron siguen en la pestaña Cerradas.
      </p>
      <button type="button" className={styles.ghost} onClick={onShowClosed}>
        Ver cerradas
      </button>
    </Panel>
  );
}

export function FilteredOutPanel({ onClear }: { readonly onClear: () => void }) {
  return (
    <Panel icon={<IconSearch size={MARK_ICON_SIZE} strokeWidth={MARK_ICON_STROKE} />} align="center" heading="Ninguna coincide con los filtros">
      <p className={styles.text}>Hay alertas en el período, pero ninguna con este estado, gravedad, tipo o búsqueda.</p>
      <button type="button" className={styles.ghost} onClick={onClear}>
        Limpiar filtros
      </button>
    </Panel>
  );
}

export function PageOutOfRangePanel({ onFirstPage }: { readonly onFirstPage: () => void }) {
  return (
    <Panel icon={<IconSearch size={MARK_ICON_SIZE} strokeWidth={MARK_ICON_STROKE} />} align="center" heading="Esta página quedó vacía">
      <p className={styles.text}>La lista cambió desde que se abrió el enlace: volvé a la primera página.</p>
      <button type="button" className={styles.ghost} onClick={onFirstPage}>
        Ir a la primera página
      </button>
    </Panel>
  );
}
