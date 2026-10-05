// "Sin vigilancia" NO es "sin hallazgos", y ninguno de los dos es "limpio".
//
// Son TRES cosas y la vista tiene que distinguirlas de entrada, porque quien
// mire el conteo de hallazgos junto al veredicto va a suponer que se
// corresponden y no es así: la POA acumula 1.089 hallazgos y ninguno puede
// pesar jamás en ningún veredicto, mientras que el albedo no está vigilado y sin
// embargo sí pesa. Por eso el corte de primer orden, `countsForVerdict`, se ve
// sin ningún gesto: son los dos titulares de la tarjeta.
//
// Lo que sí se esconde detrás del gesto es la letra chica: la nota del servicio
// que define los cuatro motivos (un párrafo entero) y la lista variable por
// variable. Escondido, no borrado: el corte de arriba no se entiende sin poder
// llegar a ellos.
import styles from "@/app/components/analitica/calidad/calidad.module.css";
import { Disclosure } from "@/app/components/analitica/Disclosure";
import { UnwatchedGroup } from "@/app/components/analitica/calidad/UnwatchedGroup";
import { formatCount } from "@/app/components/analitica/calidad/format";
import type { UnwatchedVariable, Vigilance as VigilanceBlock } from "@/app/lib/analitica/contracts/calidad";

const WEIGHTLESS_TITLE = "Sin vigilancia y sin peso: sus hallazgos NUNCA entran al veredicto";
const WEIGHING_TITLE =
  "Sin vigilancia pero CON peso: el barrido no las mira una por una, y aun así cuentan";
const DETAIL_LABEL = "Por qué una variable sin vigilancia puede pesar y otra no";
const WEIGHTLESS_HEADLINE =
  "variables cuyos hallazgos no pueden pesar jamás en el veredicto, por muchos que acumulen.";
const WEIGHING_HEADLINE =
  "variables que el barrido no mira una por una y aun así pesan en el veredicto.";

export type VigilanceProps = {
  readonly vigilance: VigilanceBlock;
  /** Hallazgos del período sin filtrar, para dar escala a cada cifra. */
  readonly findingsInPeriod: number;
};

export function Vigilance({ vigilance, findingsInPeriod }: VigilanceProps) {
  const weightless = vigilance.unwatched.filter((variable) => !variable.countsForVerdict);
  const weighing = vigilance.unwatched.filter((variable) => variable.countsForVerdict);

  return (
    <section className={`card ${styles.aside}`} aria-labelledby="vigilancia">
      <h2 className="kpi-title" id="vigilancia">
        Lo que el veredicto no puede ver
      </h2>
      <Headline
        count={weightless.length}
        sentence={WEIGHTLESS_HEADLINE}
        worst={worstOf(weightless)}
        of={findingsInPeriod}
      />
      <Headline
        count={weighing.length}
        sentence={WEIGHING_HEADLINE}
        worst={worstOf(weighing)}
        of={findingsInPeriod}
      />
      <p className="muted small">
        Se calcula sobre {formatCount(vigilance.watched.length)} variables vigiladas y solo ve
        hallazgos de {vigilance.verdictSources.join(" y ")}.
      </p>
      <Disclosure label={DETAIL_LABEL}>
        <p className={styles.warning} role="note">
          {vigilance.note}
        </p>
        <UnwatchedGroup
          title={WEIGHTLESS_TITLE}
          variables={weightless}
          findingsInPeriod={findingsInPeriod}
        />
        <UnwatchedGroup
          title={WEIGHING_TITLE}
          variables={weighing}
          findingsInPeriod={findingsInPeriod}
        />
        <h3 className="lbl">Las {formatCount(vigilance.watched.length)} que sí vigila</h3>
        <ul className="chips">
          {vigilance.watched.map((variable) => (
            <li key={variable} className="pill mono">
              {variable}
            </li>
          ))}
        </ul>
      </Disclosure>
    </section>
  );
}

/** La peor del grupo, para que el titular traiga una cifra real y no solo un
 * recuento de variables. Se ordena, NO se suma: el total de "hallazgos que no
 * pesan" no lo publica ningún endpoint, y sumarlo acá lo haría discrepar del
 * agente el día que el backend cambie qué cuenta. */
function worstOf(variables: readonly UnwatchedVariable[]): UnwatchedVariable | undefined {
  return [...variables].sort((one, other) => other.findingsInPeriod - one.findingsInPeriod)[0];
}

type HeadlineProps = {
  readonly count: number;
  /** Qué le pasa a ese grupo, en una frase que empieza donde acaba la cifra. */
  readonly sentence: string;
  readonly worst: UnwatchedVariable | undefined;
  readonly of: number;
};

function Headline({ count, sentence, worst, of }: HeadlineProps) {
  if (!worst) return null;
  return (
    <p className={styles.headline}>
      <b className={styles.headlineCount}>{formatCount(count)}</b> {sentence} La mayor es{" "}
      <span className="mono">{worst.key}</span>, con{" "}
      <b className="mono">{`${formatCount(worst.findingsInPeriod)} de ${formatCount(of)} hallazgos del período`}</b>
      .
    </p>
  );
}
