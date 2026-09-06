// Casillas 4 a 6 (Inclinado) y 7 a 9 (Vertical): energía del período, energía
// de los últimos días con datos y rendimiento específico de un arreglo.
//
// La geometría va en la cabecera y no en una nota al pie porque es la causa de
// todo lo que se lee debajo: los dos arreglos tienen la misma potencia pico y
// producen distinto justamente por cómo están orientados.
//
// Ninguna casilla repite el rango del período: ya está en la barra de arriba, y
// escribirlo tres veces por tarjeta era la mitad del texto de esta pantalla.
import { KpiTile } from "@/app/components/analitica/tablero/KpiTile";
import {
  ARRAY_PEAK_POWER_WP,
  type PhotovoltaicArray,
} from "@/app/components/analitica/tablero/arrays";
import { formatMetric, isMeasured, type Metric } from "@/app/lib/analitica";
import { formatInteger, formatUnit } from "@/app/components/analitica/tablero/format";
import type { SpecificYield } from "@/app/lib/analitica/contracts/tablero";
import styles from "@/app/components/analitica/tablero/tablero.module.css";

/** El anualizado es contexto, no la casilla: en cientos de kWh/kWp los decimales
 * no aportan y compiten visualmente con el número principal. */
const ANNUALIZED_DECIMALS = 0;

export type ArrayCardProps = {
  readonly array: PhotovoltaicArray;
  readonly periodEnergy: Metric;
  readonly recentEnergy: Metric;
  readonly specificYield: SpecificYield;
  readonly recentTitle: string;
};

export function ArrayCard({
  array,
  periodEnergy,
  recentEnergy,
  specificYield,
  recentTitle,
}: ArrayCardProps) {
  return (
    <section className={`card ${styles.arrayCard}`} aria-label={`Arreglo ${array.name}`}>
      <h2 className={styles.cardTitle}>{array.name}</h2>
      <p className={styles.cardSub}>
        {array.geometry} · {formatInteger(ARRAY_PEAK_POWER_WP)} Wp
      </p>

      <div className={styles.tiles}>
        <KpiTile title="Energía del período" metric={periodEnergy} />
        <KpiTile title={recentTitle} metric={recentEnergy} />
        <KpiTile
          title="Rendimiento específico"
          metric={specificYield.period}
          note={annualizedNote(specificYield.annualized)}
        />
      </div>
    </section>
  );
}

/** El PDF deja abierta la unidad de tiempo del rendimiento específico, así que
 * el backend manda las dos lecturas. La anualizada es un número que la casilla
 * NO muestra, y por eso sobrevive: lo demás («acumulado del período, sobre 1.420
 * Wp») ya estaba en el título y en la cabecera de la tarjeta. */
function annualizedNote(annualized: Metric): string | undefined {
  if (!isMeasured(annualized)) return undefined;
  const value = formatMetric(annualized, ANNUALIZED_DECIMALS);
  return `${value} ${formatUnit(annualized.unit)} anualizado`;
}
