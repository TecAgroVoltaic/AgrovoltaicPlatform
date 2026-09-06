// Una casilla del tablero.
//
// La regla que justifica que exista este componente: cuando NO hay número, la
// casilla muestra su MOTIVO, nunca un cero. El tipo `Metric` ya impide leer
// `value` de una métrica ausente, y acá se cierra el círculo del lado visual:
// sin dato tampoco se pinta la unidad, para que «sin dato kWh» no exista.
import type { ReactNode } from "react";

import { formatMetric, isMeasured, type Metric } from "@/app/lib/analitica";
import { formatUnit } from "@/app/components/analitica/tablero/format";
import styles from "@/app/components/analitica/tablero/tablero.module.css";

export type KpiTileProps = {
  readonly title: string;
  readonly metric: Metric;
  readonly decimals?: number;
  /** Qué es exactamente ese número. Se muestra haya dato o no: la definición de
   * la casilla no depende de que el período la haya podido responder. */
  readonly note?: ReactNode;
};

export function KpiTile({ title, metric, decimals, note }: KpiTileProps) {
  const measured = isMeasured(metric);
  return (
    <div className="kpi">
      <p className="d">{title}</p>
      <p className={measured ? "k" : `k ${styles.tileMissing}`}>
        {formatMetric(metric, decimals)}
        {measured ? <small>{formatUnit(metric.unit)}</small> : null}
      </p>
      {note ? <p className="muted small">{note}</p> : null}
      {measured ? null : <p className="kpi-nota">{metric.reason}</p>}
    </div>
  );
}
