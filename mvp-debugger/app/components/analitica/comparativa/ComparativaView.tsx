"use client";
// La vista Comparativa: el arreglo Inclinado contra el Vertical sobre un mismo
// rango.
//
// El orden ES el argumento, y ahora también la jerarquía: arriba el veredicto y
// que no depende del método, porque es lo único que hace falta saber para
// quedarse o irse. Debajo, en tarjetas más livianas, dónde se abre la brecha a
// lo largo del año y del día. Al final el día a día, que se pide aparte.
//
// Las dos consultas de la primera pantalla salen juntas (ver `useComparison`) y
// cada figura decide su propio estado: si una fuente se cae, apaga su figura y
// las demás siguen pintadas.
import { Disclosure } from "@/app/components/analitica/Disclosure";
import { useDateRange } from "@/app/lib/analitica/useDateRange";
import { useComparison } from "@/app/components/analitica/comparativa/useComparison";
import { VerdictSection } from "@/app/components/analitica/comparativa/VerdictSection";
import { MethodSection } from "@/app/components/analitica/comparativa/MethodSection";
import { SeasonalPrFigure } from "@/app/components/analitica/comparativa/SeasonalPrFigure";
import { MonthlyEnergyFigure } from "@/app/components/analitica/comparativa/MonthlyEnergyFigure";
import { HourlyFigure } from "@/app/components/analitica/comparativa/HourlyFigure";
import { DailyDetailSection } from "@/app/components/analitica/comparativa/DailyDetailSection";
import styles from "@/app/components/analitica/comparativa/comparativa.module.css";

const GAP_ID = "comparativa-brecha";

export function ComparativaView() {
  const { range } = useDateRange();
  const { comparison, report, detail, detailRequested, requestDetail, reload } =
    useComparison(range);

  return (
    <>
      <VerdictSection comparison={comparison} report={report} onRetry={reload} />

      <MethodSection report={report} comparison={comparison} onRetry={reload} />

      <section className={styles.block} aria-labelledby={GAP_ID}>
        <h2 id={GAP_ID} className="gr-titulo">
          Dónde se abre y se cierra la brecha
        </h2>
        <Disclosure label="¿Por qué la brecha cambia con la estación?">
          <p>
            Con el sol alto y cerca del cenit los dos arreglos se acercan. Con el sol bajo y
            al sur, que es hacia donde mira el inclinado, el inclinado se despega y el
            vertical pasa a vivir de la luz difusa y de la reflejada.
          </p>
        </Disclosure>
        {/* `styles.par` y no `gr-grid gr-2`: el punto de corte del cascarón mira la
            ventana y no sabe que la barra lateral se lleva 230 px, así que a
            1100 px partía estas dos figuras en columnas de 387 px de lienzo. */}
        <div className={styles.par}>
          <SeasonalPrFigure result={report} onRetry={reload} />
          <MonthlyEnergyFigure result={comparison} onRetry={reload} />
        </div>
        <HourlyFigure result={comparison} onRetry={reload} />
      </section>

      <DailyDetailSection
        result={detail}
        requested={detailRequested}
        onRequest={requestDetail}
        onRetry={reload}
      />
    </>
  );
}
