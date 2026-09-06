// El desglose comprimido que acompaña SIEMPRE al número grande.
//
// "24 días utilizables" es lo que queda al exigir que las 18 variables estén
// sanas a la vez, y por variable va de 24 a 241: enseñar el agregado solo miente
// por omisión. Por eso el desglose no vive únicamente en su pestaña, sino
// también acá, dentro de la tarjeta del número, donde no hay gesto que lo pueda
// dejar fuera de la pantalla.
//
// Una barra por variable, de la peor a la mejor, con la altura que el servicio
// ya publicó como `cobertura`. La tira llena serían todos los días del rango,
// así que lo bajo que se queda incluso la mejor se ve sin leer una cifra. Los
// nombres de los dos extremos van escritos porque la advertencia del backend,
// que va justo debajo, trae los números pero no dice de qué variable son.
import styles from "@/app/components/analitica/calidad/calidad.module.css";
import { formatCount, formatFraction, toCssHeight } from "@/app/components/analitica/calidad/format";
import type { VariableUsability } from "@/app/lib/analitica/contracts/calidad";

const STRIP_LABEL =
  "Días utilizables de cada variable, de la peor a la mejor. La tira llena serían todos los días del rango.";

export type UsableSpreadProps = {
  readonly variables: readonly VariableUsability[];
};

export function UsableSpread({ variables }: UsableSpreadProps) {
  if (variables.length === 0) return null;
  const ranked = [...variables].sort((one, other) => one.usableDays - other.usableDays);
  const worst = ranked[0];
  const best = ranked[ranked.length - 1];

  return (
    <div>
      <ul className={styles.spread} aria-label={STRIP_LABEL}>
        {ranked.map((variable) => (
          // La descripción va en el `li`, que ya tiene papel de elemento de
          // lista: un `span` sin papel con `aria-label` no lo anuncian todos
          // los lectores de pantalla.
          <li
            key={variable.variable}
            className={styles.spreadSlot}
            aria-label={`${variable.variable}: ${formatCount(variable.usableDays)} días utilizables, ${formatFraction(variable.coverage)}`}
          >
            <span className={styles.spreadBar} style={{ height: toCssHeight(variable.coverage) }} />
          </li>
        ))}
      </ul>
      <p className={styles.ends}>
        <span>
          peor <b className="mono">{worst.variable}</b>
        </span>
        <span>
          mejor <b className="mono">{best.variable}</b>
        </span>
      </p>
    </div>
  );
}
