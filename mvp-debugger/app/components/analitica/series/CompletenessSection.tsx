"use client";
// Cuántos puntos llegó a registrar el servidor en cada tramo del período (Fig. 4).
//
// Un gráfico por fuente física y no los dos juntos: lo eléctrico espera 149
// lecturas al día y la radiación 3.013, así que compartir eje aplastaría al
// primero contra el suelo y nadie vería su completitud.
//
// La NOTA del servicio (cómo se mide la cadencia, qué significa que sea nominal,
// por qué la completitud puede pasar de 1) es correcta y hace falta, pero es un
// párrafo de método en medio del camino de lectura: va plegada. Lo que trae un
// número (la cadencia medida, y el aviso de que se cayó a la nominal) se queda
// visible en el pie de cada gráfico.
import { BarsChart, emptyChart, readyChart, type BarsData } from "@/app/components/charts";
import { Disclosure } from "@/app/components/analitica/Disclosure";
import { completenessSchema, type CompletenessSource } from "@/app/lib/analitica/contracts/series";
import { GapList } from "@/app/components/analitica/series/GapList";
import { pendingChartState } from "@/app/components/analitica/series/chartState";
import { useAnalyticsQuery } from "@/app/components/analitica/series/useAnalyticsQuery";
import {
  describeCadence,
  describeCompleteness,
  longestGapsFirst,
  sourceLabel,
  toBarsData,
} from "@/app/components/analitica/series/completenessChart";
import styles from "@/app/components/analitica/series/series.module.css";
import type { DateRange } from "@/app/lib/analitica/dateRange";

const COMPLETENESS_PATH = "analitica/completitud";
const TITLE = "Puntos registrados por tramo";
const NO_SOURCES_MESSAGE = "El servicio no reportó ninguna fuente de datos para este rango.";
const DEGRADED_NOTE = "Grano engordado por el servicio: el pedido era demasiado fino.";
const NOTE_LABEL = "Cómo se mide lo esperado";

export function CompletenessSection({ range }: { readonly range: DateRange }) {
  const query = useAnalyticsQuery({ path: COMPLETENESS_PATH, range, schema: completenessSchema });

  if (query.status !== "loaded") {
    return <BarsChart title={TITLE} state={pendingChartState<BarsData>(query)} />;
  }

  const { payload } = query.data;
  if (payload.sources.length === 0) {
    return (
      <BarsChart
        title={TITLE}
        state={emptyChart<BarsData>("NO_ROWS", { message: NO_SOURCES_MESSAGE })}
      />
    );
  }

  return (
    <div className="gr-grid">
      {payload.sources.map((source) => (
        <SourceCompleteness key={source.key} source={source} degraded={payload.degraded} />
      ))}
      {payload.note ? (
        <Disclosure label={NOTE_LABEL}>
          <p>{payload.note}</p>
        </Disclosure>
      ) : null}
    </div>
  );
}

type SourceProps = {
  readonly source: CompletenessSource;
  /** El servicio engordó el grano pedido. Cambia lo que mide cada barra. */
  readonly degraded: boolean;
};

function SourceCompleteness({ source, degraded }: SourceProps) {
  const label = sourceLabel(source.key);
  const state =
    source.buckets.length === 0
      ? emptyChart<BarsData>("NO_ROWS")
      : readyChart(toBarsData(source));

  return (
    <div className={styles.source}>
      <BarsChart
        title={label}
        {...(degraded ? { subtitle: DEGRADED_NOTE } : {})}
        state={state}
        caption={`${describeCompleteness(source.summary)} · ${describeCadence(source.summary)}`}
      />
      <GapList gaps={longestGapsFirst(source.summary)} sourceLabel={label} />
    </div>
  );
}
