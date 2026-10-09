// La cabecera de un gráfico: título con su fuente a la derecha y, debajo, una
// línea de qué se mira. La fuente va junto al título y no en el pie porque es
// lo que decide cómo leer todo lo demás.
import { SourceBadge } from "@/app/components/fuentes/SourceBadge";
import type { SourceId } from "@/app/lib/fuentes/registry";

export type ChartHeaderProps = {
  readonly title: string;
  readonly subtitle?: string;
  readonly source?: SourceId;
};

export function ChartHeader({ title, subtitle, source }: ChartHeaderProps) {
  return (
    <figcaption className="gr-cab">
      <div className="gr-cab-fila">
        <h3 className="gr-titulo">{title}</h3>
        {source ? <SourceBadge source={source} /> : null}
      </div>
      {subtitle ? <p className="gr-sub">{subtitle}</p> : null}
    </figcaption>
  );
}
