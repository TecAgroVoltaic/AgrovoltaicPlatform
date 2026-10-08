"use client";
// El contenido de la ficha: cabecera, cuerpo que se desplaza y barra de acciones
// fija. El orden del cuerpo es el de la pregunta de quien la abre: qué pasó, en
// qué me baso, dónde sigo mirando, qué se hizo ya.
import { useCallback, useId, useState } from "react";

import { AffectedDaysStrip } from "@/app/components/analitica/alertas/AffectedDaysStrip";
import { AlertActions } from "@/app/components/analitica/alertas/AlertActions";
import { AlertDetailHead } from "@/app/components/analitica/alertas/AlertDetailHead";
import { AlertLinks } from "@/app/components/analitica/alertas/AlertLinks";
import { AlertTimeline } from "@/app/components/analitica/alertas/AlertTimeline";
import styles from "@/app/components/analitica/alertas/drawer.module.css";
import { KeyFigures } from "@/app/components/analitica/alertas/KeyFigures";
import { ResourceState } from "@/app/components/analitica/alertas/ResourceState";
import { useAlertDetail } from "@/app/components/analitica/alertas/useAlertsData";
import { Disclosure } from "@/app/components/analitica/Disclosure";

export type AlertDetailPanelProps = {
  readonly alertId: number;
  readonly titleId: string;
  /** Avisa a la vista que algo cambió (lista, resumen y contador se refrescan). */
  readonly onChanged: () => void;
};

export function AlertDetailPanel({ alertId, titleId, onChanged }: AlertDetailPanelProps) {
  const { state, reload } = useAlertDetail(alertId);
  const [meaningOpen, setMeaningOpen] = useState(false);
  const meaningId = useId();
  const refresh = useCallback(() => {
    reload();
    onChanged();
  }, [reload, onChanged]);

  if (state.status !== "ready") {
    return (
      <>
        <header className={styles.head}>
          <h2 id={titleId} className={styles.title}>
            Alerta {alertId}
          </h2>
        </header>
        <div className={styles.body}>
          <ResourceState what="la ficha de la alerta" state={state} />
        </div>
      </>
    );
  }

  const { alert, events, whatItIs, links } = state.data;
  const { findings } = alert.evidence;
  return (
    <>
      <AlertDetailHead alert={alert} titleId={titleId} />
      <div className={styles.body}>
        <section className={styles.section}>
          <p className={styles.description}>
            {alert.description}{" "}
            <button
              type="button"
              className={styles.meaningToggle}
              aria-expanded={meaningOpen}
              aria-controls={meaningId}
              onClick={() => setMeaningOpen((open) => !open)}
            >
              Qué significa
            </button>
          </p>
          <p id={meaningId} className={styles.meaning} hidden={!meaningOpen}>
            {whatItIs}
          </p>
        </section>
        <KeyFigures figures={alert.evidence.figures} />
        <AffectedDaysStrip dates={alert.evidence.dates} severity={alert.severity} />
        {findings.length > 0 ? (
          <Disclosure label="¿De qué hallazgos sale?">
            <ul className={styles.timeline}>
              {findings.map((finding) => (
                <li key={`${finding.date}:${finding.source}:${finding.variable}:${finding.type}`} className={styles.eventMeta}>
                  {finding.date} · {finding.source} · {finding.variable} · {finding.type}
                </li>
              ))}
            </ul>
          </Disclosure>
        ) : null}
        <AlertLinks alert={alert} links={links} />
        <AlertTimeline events={events} />
      </div>
      <AlertActions key={alert.id} alertId={alert.id} status={alert.status} onChanged={refresh} />
    </>
  );
}
