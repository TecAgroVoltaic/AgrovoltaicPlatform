// Las cifras clave de la evidencia, como fichas. Nombre y unidad salen del mapa
// de `figures.ts`; lo que no se conoce va con su nombre crudo.
import { keyFigures } from "@/app/components/analitica/alertas/figures";
import styles from "@/app/components/analitica/alertas/drawer.module.css";
import type { Alert } from "@/app/lib/alertas/contracts";

export function KeyFigures({ figures }: { readonly figures: Alert["evidence"]["figures"] }) {
  const items = keyFigures(figures);
  return (
    <section className={styles.section} aria-labelledby="alerta-cifras">
      <h3 id="alerta-cifras" className={styles.label}>
        Cifras clave
      </h3>
      {items.length > 0 ? (
        <dl className={styles.figures}>
          {items.map((figure) => (
            <div key={figure.key} className={styles.figure}>
              <dt>{figure.label}</dt>
              <dd>
                {figure.value}
                {figure.unit ? <span className={styles.unit}>{figure.unit}</span> : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className={styles.empty}>El servicio no adjuntó cifras a esta alerta.</p>
      )}
    </section>
  );
}
