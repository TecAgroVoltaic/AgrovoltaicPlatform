// Casillas 2 y 3: la energía del sistema completo.
//
// EL PROBLEMA DE DISEÑO DE ESTA VISTA. Hay dos totales y los dos son correctos,
// porque responden preguntas distintas: cuánto REGISTRAMOS y cuánto PRODUJO la
// planta. Puestos como dos casillas sueltas en una parrilla de nueve, cualquiera
// lee uno y no ve el otro, y el que lea el chico creerá que el sistema produjo
// menos de lo que produjo.
//
// Se resuelve con el LAYOUT, no con una frase: viven en un solo marco,
// enfrentados, cada uno titulado con LA PREGUNTA que contesta, y una etiqueta
// dice cuál usan las otras ocho casillas. Eso ya lo explica, así que la línea
// que decía «hay dos respuestas y las dos son correctas» sobraba.
import { formatMetric, isMeasured, type Metric } from "@/app/lib/analitica";
import { KpiTile } from "@/app/components/analitica/tablero/KpiTile";
import { formatDays, formatUnit } from "@/app/components/analitica/tablero/format";
import type { EnergyAccounts } from "@/app/lib/analitica/contracts/tablero";
import styles from "@/app/components/analitica/tablero/tablero.module.css";

export type SystemEnergyCardProps = {
  readonly accounts: EnergyAccounts;
  /** Energía AC de los últimos días CON DATOS (casilla 3). */
  readonly recentTotal: Metric;
  readonly recentTitle: string;
  readonly recentNote: string;
  readonly periodLabel: string;
};

export function SystemEnergyCard({
  accounts,
  recentTotal,
  recentTitle,
  recentNote,
  periodLabel,
}: SystemEnergyCardProps) {
  return (
    <section className={`card ${styles.hero}`}>
      <div className={styles.cardHead}>
        <h2 className={styles.cardTitle}>Energía producida</h2>
        <span className={styles.headStat}>{periodLabel}</span>
      </div>

      <div className={styles.balance}>
        <BalanceSide
          primary
          question="¿Cuánta energía registramos?"
          metric={accounts.recorded}
          note={`Cierres diarios del inversor, ${formatDays(accounts.daysWithAcClose)} grabados.`}
          tag="Es la que usan las otras ocho casillas"
        />
        <BalanceSide
          question="¿Cuánta energía produjo la planta?"
          metric={accounts.plant}
          note={`Contador de vida del inversor, ${formatDays(
            accounts.daysWithLifetimeCounter,
          )} con lectura.`}
        />
      </div>

      <p className={styles.gapNote}>
        <UnrecordedSentence unrecorded={accounts.unrecorded} />
      </p>

      <div className={styles.tiles}>
        <KpiTile title={recentTitle} metric={recentTotal} note={recentNote} />
      </div>
    </section>
  );
}

type BalanceSideProps = {
  readonly question: string;
  readonly metric: Metric;
  readonly note: string;
  readonly tag?: string;
  readonly primary?: boolean;
};

function BalanceSide({ question, metric, note, tag, primary = false }: BalanceSideProps) {
  const measured = isMeasured(metric);
  return (
    <article className={primary ? `${styles.question} ${styles.questionPrimary}` : styles.question}>
      <h3 className={styles.questionTitle}>{question}</h3>
      <p className={measured ? styles.questionValue : `${styles.questionValue} ${styles.questionMissing}`}>
        {formatMetric(metric)}
        {measured ? <small>{formatUnit(metric.unit)}</small> : null}
      </p>
      <p className={styles.questionNote}>{measured ? note : metric.reason}</p>
      {tag && measured ? <span className={styles.questionTag}>{tag}</span> : null}
    </article>
  );
}

/** La diferencia entre las dos energías. Llega calculada del backend, que la
 * define como «el ÚNICO número del sistema que ve los huecos»: por eso es la
 * única frase de esta tarjeta que sobrevivió. */
function UnrecordedSentence({ unrecorded }: { readonly unrecorded: Metric }) {
  if (!isMeasured(unrecorded)) {
    return <>La energía generada en días sin registro no se pudo establecer: {unrecorded.reason}.</>;
  }
  return (
    <>
      <b className="mono">
        {formatMetric(unrecorded)} {formatUnit(unrecorded.unit)}
      </b>{" "}
      generados en días que nunca se grabaron: el único número que ve los huecos.
    </>
  );
}
