"use client";
// El contenido de la ficha: lee la alerta y compone cabecera, descripción,
// acciones, evidencia e historial. El orden es el de la pregunta que se hace
// quien la abre: qué pasó, qué hago, en qué me baso, qué se hizo ya.
import { useCallback } from "react";

import styles from "@/app/components/analitica/alertas/alertas.module.css";
import { AlertActions } from "@/app/components/analitica/alertas/AlertActions";
import { AlertEvidence } from "@/app/components/analitica/alertas/AlertEvidence";
import { AlertTimeline } from "@/app/components/analitica/alertas/AlertTimeline";
import { ResourceState } from "@/app/components/analitica/alertas/ResourceState";
import { AlertSummaryLine } from "@/app/components/analitica/alertas/AlertSummaryLine";
import { useAlertDetail } from "@/app/components/analitica/alertas/useAlertsData";
import { Disclosure } from "@/app/components/analitica/Disclosure";
import { SeverityTag } from "@/app/components/analitica/calidad/SeverityTag";

export type AlertDetailPanelProps = {
  readonly alertId: number;
  readonly titleId: string;
  /** Avisa a la vista que algo cambió (lista y contador se refrescan). */
  readonly onChanged: () => void;
};

export function AlertDetailPanel({ alertId, titleId, onChanged }: AlertDetailPanelProps) {
  const { state, reload } = useAlertDetail(alertId);
  const refresh = useCallback(() => {
    reload();
    onChanged();
  }, [reload, onChanged]);

  if (state.status !== "ready") {
    return (
      <>
        <h2 id={titleId} className={styles.detailTitle}>
          Alerta {alertId}
        </h2>
        <ResourceState what="la ficha de la alerta" state={state} />
      </>
    );
  }

  const { alert, events, whatItIs, links } = state.data;
  return (
    <>
      <header className={styles.detailHead}>
        <SeverityTag severity={alert.severity} />
        <h2 id={titleId} className={styles.detailTitle}>
          {alert.title}
        </h2>
        <AlertSummaryLine alert={alert} withNextReview />
      </header>
      <p className={styles.description}>{alert.description}</p>
      <Disclosure label="¿Qué es este tipo de alerta?">
        <p>{whatItIs}</p>
      </Disclosure>
      <AlertActions key={alert.id} alertId={alert.id} status={alert.status} onChanged={refresh} />
      <AlertEvidence evidence={alert.evidence} links={links} />
      <AlertTimeline events={events} />
    </>
  );
}
