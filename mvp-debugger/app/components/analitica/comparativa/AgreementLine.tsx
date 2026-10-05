"use client";
// Lo segundo que hay que saber al entrar, después de quién gana: que el ganador
// no sale del método elegido.
//
// Va pegado al veredicto y no en la sección del método a propósito. Un resultado
// que solo aparece con una forma de medir es un resultado del método; que
// coincida en casi todas es lo único que lo vuelve creíble, y eso tiene que
// llegar antes de que nadie decida seguir leyendo.
import type { ArrayKey } from "@/app/lib/analitica/contracts/comparativa";
import { agreementWith, type Cut } from "@/app/components/analitica/comparativa/cuts";
import styles from "@/app/components/analitica/comparativa/comparativa.module.css";

export type AgreementLineProps = {
  /** El ganador que declaró el backend. Acá no se elige por mayoría. */
  readonly winner: ArrayKey | null;
  readonly cuts: readonly Cut[];
};

export function AgreementLine({ winner, cuts }: AgreementLineProps) {
  const { agreeing, comparable } = agreementWith(winner, cuts);
  if (winner === null || comparable === 0) return null;
  const outOfScale = describeOutOfScale(cuts);

  return (
    <p className={styles.agreement}>
      <b>
        {agreeing} de {comparable}
      </b>{" "}
      métodos comparables dan el mismo ganador
      {outOfScale ? <span className={styles.agreementAside}>{outOfScale}</span> : null}
    </p>
  );
}

/** Los métodos que el backend marcó por encima del límite físico no compiten:
 *  se cuentan aparte para que su ausencia de la cuenta de arriba no parezca un
 *  descarte silencioso. */
function describeOutOfScale(cuts: readonly Cut[]): string | null {
  const count = cuts.filter((cut) => cut.status === "impossible").length;
  if (count === 0) return null;
  if (count === 1) return "1 método queda fuera: su PR es imposible";
  return `${count} métodos quedan fuera: su PR es imposible`;
}
