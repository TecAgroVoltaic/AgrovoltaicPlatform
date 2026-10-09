"use client";
// Climatología mensual: cuatro paneles apilados que comparten el eje de meses
// (irradiación, irradiancia, temperatura y humedad). Todo número llega hecho del
// backend; acá solo se decide el estado de cada panel y su fuente.
import { BarsChart, BoxPlotChart, MIN_CHART_HEIGHT } from "@/app/components/charts";
import { climatologyPanels } from "@/app/components/analitica/tablero/climatologia/climatologyCharts";
import {
  PANEL_TITLE,
  basisSubtitle,
  boxesSubtitle,
  climatologyTitle,
  type BoxPanelId,
} from "@/app/components/analitica/tablero/climatologia/labels";
import { useClimatology } from "@/app/components/analitica/tablero/climatologia/useClimatology";
import { useClimatologyYear } from "@/app/components/analitica/tablero/climatologia/useClimatologyYear";
import { YearSelector } from "@/app/components/analitica/tablero/climatologia/YearSelector";
import styles from "@/app/components/analitica/tablero/climatologia/climatology.module.css";

const HEADING_ID = "climatologia-titulo";
const BOX_PANELS: readonly BoxPanelId[] = ["irradiance", "temperature", "humidity"];

export function ClimatologySection() {
  const { year, years, changing, setYear } = useClimatologyYear();
  const query = useClimatology(year);
  const panels = climatologyPanels(query);
  const data = query.status === "loaded" ? query.data : null;

  return (
    <section className={styles.section} aria-labelledby={HEADING_ID}>
      <div className={styles.head}>
        <h2 id={HEADING_ID} className={styles.title}>
          {climatologyTitle(year)}
        </h2>
        <YearSelector
          years={years}
          selected={year}
          disabled={changing || query.status === "loading"}
          onSelect={setYear}
        />
      </div>
      <div className={`gr-grid ${styles.panels}`}>
        <BarsChart
          title={PANEL_TITLE.irradiation}
          subtitle={basisSubtitle(data?.irradiation.basis ?? null)}
          source={data?.irradiation.source}
          height={MIN_CHART_HEIGHT}
          state={panels.irradiation}
        />
        {BOX_PANELS.map((panel) => (
          <BoxPlotChart
            key={panel}
            title={PANEL_TITLE[panel]}
            subtitle={boxesSubtitle(data?.[panel] ?? null)}
            source={data?.[panel].source}
            height={MIN_CHART_HEIGHT}
            state={panels[panel]}
          />
        ))}
      </div>
    </section>
  );
}
