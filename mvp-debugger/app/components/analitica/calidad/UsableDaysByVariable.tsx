// El desglose con nombres y cifras: qué variable frena al período y por cuánto.
//
// La forma del reparto ya se ve sin ningún gesto, en la tira que acompaña al
// número grande (`UsableSpread`). Acá NO se vuelve a dibujar: un segundo gráfico
// de la misma proporción es el mismo ruido en otro formato. Lo que falta cuando
// se mira la tira es el NOMBRE y la CIFRA de cada variable, y eso es una tabla.
//
// Tampoco se repite la advertencia del servicio, que va arriba con estos mismos
// números. Lo único que se añade es lo que esa frase no dice.
//
// Los días y la cobertura vienen del backend tal cual: acá no se divide nada.
import styles from "@/app/components/analitica/calidad/calidad.module.css";
import { formatCount, formatFraction } from "@/app/components/analitica/calidad/format";
import type { VariableUsability } from "@/app/lib/analitica/contracts/calidad";

const TITLE = "Días utilizables variable por variable";
const NO_BREAKDOWN_MESSAGE = "El servicio no devolvió el desglose por variable para este período.";
const ARRAY_NAMING_NOTE =
  "PV1 es el arreglo Inclinado (20°, azimut 150) y PV2 el Vertical (90°, azimut 50).";
const DAYS_UNIT = "d";
const SCROLL_LABEL = "Días utilizables por variable, tabla desplazable";

export type UsableDaysByVariableProps = {
  readonly variables: readonly VariableUsability[];
};

export function UsableDaysByVariable({ variables }: UsableDaysByVariableProps) {
  const ranked = [...variables].sort((one, other) => one.usableDays - other.usableDays);

  return (
    <section className="card" aria-labelledby="por-variable">
      <h2 className="kpi-title" id="por-variable">
        {TITLE}
      </h2>
      <p className="muted small">{ARRAY_NAMING_NOTE}</p>
      {ranked.length === 0 ? (
        <p className="muted small">{NO_BREAKDOWN_MESSAGE}</p>
      ) : (
        // Se desplaza de lado en vez de replegarse a pares etiqueta-valor: el
        // orden de las filas ES la lectura («de la peor a la mejor»), y una
        // lista de fichas apiladas la pierde. Además el ancho mínimo lo fija un
        // nombre de variable que no se puede partir (`temperatura_inversor_c`
        // mide 176 px en la tipografía mono), así que ningún replanteo lo
        // evitaría: partirlo a mitad de palabra sería peor que desplazar.
        <div
          className={`tbl-scroll ${styles.tablaAncha}`}
          role="region"
          aria-label={SCROLL_LABEL}
          tabIndex={0}
        >
          <table className="tbl">
            <caption className="lbl">De la peor a la mejor</caption>
            <thead>
              <tr>
                <th scope="col">Variable</th>
                <th scope="col">Días utilizables</th>
                <th scope="col">Cobertura del rango</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((variable) => (
                <tr key={variable.variable}>
                  <th scope="row" className="mono">
                    {variable.variable}
                  </th>
                  <td className="mono">
                    {formatCount(variable.usableDays)} {DAYS_UNIT}
                  </td>
                  <td className="mono">{formatFraction(variable.coverage)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
