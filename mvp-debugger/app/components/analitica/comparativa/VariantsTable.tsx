"use client";
// Las seis variantes del PR, con sus días y quién queda arriba en cada una.
//
// Es la tabla la que lleva los números exactos (tres decimales) porque el
// gráfico redondea al dibujar, y con un decimal 0,648 y 0,612 se verían iguales.
// También es la versión accesible de la figura: la comparación se lee en texto,
// no en la altura de una barra ni en un color.
import { formatDays, formatPr } from "@/app/components/analitica/comparativa/format";
import type { Variant } from "@/app/components/analitica/comparativa/variants";
import {
  ARRAY_KEYS,
  ARRAY_LABEL,
  describeMissingReason,
} from "@/app/components/analitica/comparativa/vocabulary";
import styles from "@/app/components/analitica/comparativa/comparativa.module.css";

const IMPOSSIBLE_TEXT = "PR imposible";
const TIE_TEXT = "empatan";
const SCROLL_LABEL = "Matriz de variantes del Performance Ratio, tabla desplazable";

export function VariantsTable({ variants }: { readonly variants: readonly Variant[] }) {
  return (
    // Se desplaza de lado, no se repliega: la comparación que se viene a hacer
    // acá es el PR del Inclinado contra el del Vertical DENTRO de una fila, y
    // apilar cada celda como par etiqueta-valor separa justo esos dos números.
    // Con el nombre del método envolviendo (ver `.variantCell`) la tabla baja de
    // 544 a 408 px, así que desde un contenedor de 408 ya no hace falta el gesto:
    // a 768 px de ventana entra entera, y antes de esto no entraba.
    <div
      className={`tbl-scroll ${styles.tablaAncha}`}
      role="region"
      aria-label={SCROLL_LABEL}
      tabIndex={0}
    >
      <table className="tbl">
        <caption className="muted small">
          Un PR mayor que 1 no es un rendimiento alto: es una irradiancia mal
          medida o mal modelada, y por eso esa fila no declara ganador.
        </caption>
        <thead>
          <tr>
            <th scope="col">Variante</th>
            <th scope="col">Días</th>
            {ARRAY_KEYS.map((array) => (
              <th key={array} scope="col">
                PR {ARRAY_LABEL[array]}
              </th>
            ))}
            <th scope="col">Queda arriba</th>
          </tr>
        </thead>
        <tbody>
          {variants.map((variant) => (
            <tr key={variant.id}>
              <th scope="row" className={styles.variantCell}>
                {variant.label}
                {variant.provisional ? (
                  <span className={styles.provisionalTag}>provisional</span>
                ) : null}
              </th>
              <td className="mono">{formatDays(variant.days)}</td>
              {ARRAY_KEYS.map((array) => (
                <td key={array} className="mono">
                  {formatPr(variant.cells[array].pr)}
                  {variant.cells[array].exceedsPhysicalLimit ? (
                    <span className={styles.impossibleTag}>{IMPOSSIBLE_TEXT}</span>
                  ) : null}
                </td>
              ))}
              <td>{describeLeader(variant)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function describeLeader(variant: Variant): string {
  if (!variant.readable) return "no comparable";
  if (variant.leader) return ARRAY_LABEL[variant.leader];
  if (variant.cells.inclinado.pr === null) {
    return describeMissingReason(variant.missingReason);
  }
  return TIE_TEXT;
}
