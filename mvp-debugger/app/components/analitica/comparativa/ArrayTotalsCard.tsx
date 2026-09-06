"use client";
// La tarjeta de un arreglo: su geometría y los dos números que lo describen.
//
// La geometría va en la cabecera y no en un párrafo aparte porque es lo único
// que separa a los dos: misma potencia pico, distinta inclinación y distinto
// azimut. Con los 1.420 Wp escritos en las dos tarjetas no hace falta explicar
// por qué el rendimiento específico es comparable.
import { formatMetric, isMeasured, type Metric } from "@/app/lib/analitica";
import type { ArrayKey } from "@/app/lib/analitica/contracts/comparativa";
import { formatCount } from "@/app/components/analitica/comparativa/format";
import {
  ARRAY_GEOMETRY,
  ARRAY_LABEL,
  ARRAY_PEAK_POWER_WP,
  describeMissingReason,
} from "@/app/components/analitica/comparativa/vocabulary";
import styles from "@/app/components/analitica/comparativa/comparativa.module.css";

const ENERGY_DECIMALS = 0;
const YIELD_DECIMALS = 1;

export type ArrayTotalsCardProps = {
  readonly array: ArrayKey;
  readonly energy: Metric;
  readonly specificYield: Metric;
  readonly readings: number;
  readonly highlighted: boolean;
};

export function ArrayTotalsCard({
  array,
  energy,
  specificYield,
  readings,
  highlighted,
}: ArrayTotalsCardProps) {
  return (
    <article className={highlighted ? `${styles.arrayCard} ${styles.arrayLead}` : styles.arrayCard}>
      <h3 className={styles.arrayName}>{ARRAY_LABEL[array]}</h3>
      <p className={styles.arrayGeometry}>
        {ARRAY_GEOMETRY[array]} · {formatCount(ARRAY_PEAK_POWER_WP)} Wp
      </p>
      <ValueLine label="Energía del período" metric={energy} decimals={ENERGY_DECIMALS} />
      <ValueLine label="Rendimiento específico" metric={specificYield} decimals={YIELD_DECIMALS} />
      <p className="muted small">{formatCount(readings)} lecturas</p>
    </article>
  );
}

function ValueLine({
  label,
  metric,
  decimals,
}: {
  readonly label: string;
  readonly metric: Metric;
  readonly decimals: number;
}) {
  const measured = isMeasured(metric);
  return (
    <p className={styles.valueLine}>
      <span className="muted small">{label}</span>
      <span className={measured ? styles.value : styles.valueMissing}>
        {formatMetric(metric, decimals)}
        {measured ? <small> {metric.unit}</small> : null}
      </span>
      {measured ? null : <span className="kpi-nota">{describeMissingReason(metric.reason)}</span>}
    </p>
  );
}
