// La leyenda mínima del pie: de dónde puede sacar datos el asistente. Son las
// tres fuentes que una persona distingue; el store ambiental de Supabase es una
// copia de las cajas SC de AgroDash y no suma una cuarta para quien lee.
import { SourceBadge } from "@/app/components/fuentes/SourceBadge";
import styles from "@/app/components/inicio/welcome.module.css";
import type { SourceId } from "@/app/lib/fuentes/registry";

const LEGEND_SOURCES: readonly SourceId[] = ["supabase_pv", "agrodash_sc", "agrodash_cartago"];

export function SourceLegend() {
  return (
    <p className={styles.legend}>
      <span className={styles.legendTitle}>Fuentes</span>
      {LEGEND_SOURCES.map((source) => (
        <SourceBadge key={source} source={source} />
      ))}
    </p>
  );
}
