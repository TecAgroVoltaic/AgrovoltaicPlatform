"use client";
// El informe Excel que ofrece `preparar_informe` (`salida.descarga`). Usa el
// mismo `useReportDownload` que el botón de Descargas: el Excel se arma al
// pedirlo y el agente redacta la lectura, así que se muestra el tiempo.
import { useMemo } from "react";

import { IconSheet } from "@/app/components/asistente/AssistantIcons";
import { DownloadAction } from "@/app/components/asistente/blocks/DownloadAction";
import { InvalidBlock } from "@/app/components/asistente/blocks/InvalidBlock";
import styles from "@/app/components/asistente/blocks/blockCard.module.css";
import { useReportDownload, type ReportState } from "@/app/components/analitica/descargas/useReportDownload";
import { parseInformeSpec } from "@/app/lib/asistente/contracts/informeSpec";
import { throughHistoricoProxy } from "@/app/lib/descargas/proxy";

const ICON_SIZE = 16;
/** El informe que ofrece el chat siempre pide la lectura del agente. */
const EXPECTS_READING = true;

export function ReportCard({ spec }: { readonly spec: unknown }) {
  const parsed = useMemo(() => parseInformeSpec(spec), [spec]);
  if (!parsed.ok) return <InvalidBlock what="El informe" reason={parsed.reason} />;
  return <ValidReportCard route={parsed.spec.ruta} />;
}

function ValidReportCard({ route }: { readonly route: string }) {
  const { state, generate, cancel } = useReportDownload(throughHistoricoProxy(route), EXPECTS_READING);
  const period = reportPeriod(route);

  return (
    <section className={styles.card} aria-label="Informe Excel">
      <div className={styles.head}>
        <IconSheet size={ICON_SIZE} />
        <p className={styles.title}>Informe del período</p>
        {period ? <p className={styles.headMeta}>{period}</p> : null}
      </div>
      <div className={styles.actions}>
        <DownloadAction
          busy={state.phase === "generating"}
          label="Descargar informe (.xlsx)"
          onStart={() => void generate()}
          onCancel={cancel}
        />
        <p className={styles.status} aria-live="polite">
          {reportStatusText(state)}
        </p>
      </div>
      {state.phase === "error" ? (
        <p className={styles.alert} role="alert">
          No se pudo generar: {state.reason}
        </p>
      ) : null}
      {state.phase === "done" && state.withoutReading ? (
        <p className={styles.alert} role="alert">
          Salió sin lectura. El motivo está en la hoja Resumen.
        </p>
      ) : null}
    </section>
  );
}

function reportPeriod(route: string): string | null {
  const query = new URLSearchParams(route.slice(route.indexOf("?") + 1));
  const from = query.get("desde");
  const to = query.get("hasta");
  return from && to ? `${from} a ${to}` : null;
}

function reportStatusText(state: ReportState): string | null {
  if (state.phase === "generating") return `Generando… ${state.seconds} s · el agente redacta la lectura`;
  if (state.phase === "done") return `Listo · ${state.fileName}`;
  return null;
}

