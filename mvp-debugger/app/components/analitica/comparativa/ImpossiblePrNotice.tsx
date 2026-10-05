"use client";
// El PR que no puede existir.
//
// Un Performance Ratio mayor que 1 significaría que el arreglo entrega más
// energía que la luz que recibe. Cuando aparece NO es un rendimiento excelente:
// es la prueba de que la irradiancia con la que se juzga a ese arreglo está mal.
// Por eso ese método sale de la comparación, se queda fuera de toda escala de
// rendimiento, y este aviso se lee sin abrir nada.
import { formatDays, formatPr } from "@/app/components/analitica/comparativa/format";
import type { Variant } from "@/app/components/analitica/comparativa/variants";
import { ARRAY_KEYS, ARRAY_LABEL } from "@/app/components/analitica/comparativa/vocabulary";
import styles from "@/app/components/analitica/comparativa/comparativa.module.css";

export function ImpossiblePrNotice({ variants }: { readonly variants: readonly Variant[] }) {
  const flagged = variants.filter((variant) => variant.limitWarning !== null);
  if (flagged.length === 0) return null;

  return (
    <div className={styles.noticeCritical}>
      <p className={styles.noticeTitle}>
        Hay métodos con un PR mayor que 1, que es físicamente imposible
      </p>
      {flagged.map((variant) => (
        <FlaggedVariant key={variant.id} variant={variant} />
      ))}
    </div>
  );
}

function FlaggedVariant({ variant }: { readonly variant: Variant }) {
  return (
    <div className={styles.noticeItem}>
      {ARRAY_KEYS.filter((array) => variant.cells[array].exceedsPhysicalLimit).map((array) => (
        <p key={array} className={styles.noticeHead}>
          <b>{variant.label}</b> · {ARRAY_LABEL[array]}: PR{" "}
          {formatPr(variant.cells[array].pr)} en {formatDays(variant.days)}, con{" "}
          {formatDays(variant.cells[array].daysAboveOne)} por encima de 1 y un máximo diario
          de {formatPr(variant.cells[array].maxDailyPr)}.
        </p>
      ))}
      {variant.limitWarning ? <p className="muted small">{variant.limitWarning}</p> : null}
    </div>
  );
}
