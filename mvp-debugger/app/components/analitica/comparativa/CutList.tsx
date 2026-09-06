"use client";
// Quién queda arriba con cada método, en una sola tabla corta.
//
// Es la respuesta a «¿cambia el ganador según cómo se mida?» sin obligar a leer
// seis PR: acá va el veredicto de cada método con su muestra al lado, y los
// números exactos viven un gesto más abajo. La muestra es la mitad del
// argumento, y por eso se dibuja: que un método conserve 3.041 de 28.996
// lecturas se ve en la barra antes de leer el número.
//
// La escala del PR no puede decir «este valor es imposible», así que esas filas
// no traen ganador: llevan su marca y salen de la comparación.
import type { Cut, CutSample } from "@/app/components/analitica/comparativa/cuts";
import { formatCount } from "@/app/components/analitica/comparativa/format";
import { ARRAY_LABEL } from "@/app/components/analitica/comparativa/vocabulary";
import styles from "@/app/components/analitica/comparativa/comparativa.module.css";

const TABLE_LABEL = "Qué arreglo queda arriba con cada método";
const IMPOSSIBLE_TEXT = "PR imposible";
const MISSING_TEXT = "sin dato";
const TIE_TEXT = "empatan";
const FULL_WIDTH_PERCENT = 100;

export function CutList({ cuts }: { readonly cuts: readonly Cut[] }) {
  return (
    <table className={styles.cutTable} aria-label={TABLE_LABEL}>
      <thead>
        <tr>
          <th scope="col">Método</th>
          <th scope="col">Muestra</th>
          <th scope="col">Queda arriba</th>
        </tr>
      </thead>
      <tbody>
        {cuts.map((cut) => (
          <tr key={cut.id}>
            <th scope="row">{cut.label}</th>
            <td>
              <SampleBar sample={cut.sample} />
            </td>
            <td>
              <CutOutcome cut={cut} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** La barra es GEOMETRÍA: los dos números son del backend y ninguno sale de
 *  dividir al otro. Lo único que se calcula acá es el ancho en pantalla. */
function SampleBar({ sample }: { readonly sample: CutSample }) {
  return (
    <span className={styles.sample}>
      <span className={styles.sampleTrack} aria-hidden="true">
        <span className={styles.sampleFill} style={{ width: widthOf(sample) }} />
      </span>
      <span className="mono">
        {formatCount(sample.value)} de {formatCount(sample.total)} {sample.unit}
      </span>
    </span>
  );
}

/** Un total en cero deja la barra vacía en vez de dividir por cero. */
function widthOf({ value, total }: CutSample): string {
  if (total <= 0) return "0%";
  return `${(value / total) * FULL_WIDTH_PERCENT}%`;
}

function CutOutcome({ cut }: { readonly cut: Cut }) {
  if (cut.status === "impossible") {
    return <span className={styles.impossibleTag}>{IMPOSSIBLE_TEXT}</span>;
  }
  if (cut.status === "missing") {
    return (
      <span className="muted small">
        {MISSING_TEXT}
        {cut.note ? `: ${cut.note}` : ""}
      </span>
    );
  }
  if (cut.leader === null) return <span className="muted small">{TIE_TEXT}</span>;
  return <b>{ARRAY_LABEL[cut.leader]}</b>;
}
