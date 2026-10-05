"use client";
// El respaldo del veredicto: quién queda arriba con cada forma de medir.
//
// El backend manda SEIS variantes del PR (dos caminos para la energía del día
// por tres irradiancias) y un cruce punto a punto que no es un PR. Cada una se
// agrega sobre SU propio conjunto de días o de lecturas, y esa muestra viaja al
// lado del veredicto de cada método: sin ella, el método que discrepa parecería
// pesar lo mismo que los otros.
//
// Los números exactos y el cómo se mide van detrás del gesto. Lo que nunca se
// pliega es un aviso: el PR imposible y el aval pendiente de Hugo se leen sin
// abrir nada.
import { Disclosure } from "@/app/components/analitica/Disclosure";
import type { AnalyticsResult } from "@/app/lib/analitica/errors";
import type {
  ArrayComparison,
  PerformanceReport,
} from "@/app/lib/analitica/contracts/comparativa";
import { chartStateFrom, emptyBecause } from "@/app/components/analitica/comparativa/chartState";
import { StatePanel } from "@/app/components/analitica/comparativa/StatePanel";
import { CutList } from "@/app/components/analitica/comparativa/CutList";
import { cutsOf } from "@/app/components/analitica/comparativa/cuts";
import { readVariants, type Variant } from "@/app/components/analitica/comparativa/variants";
import { VariantsTable } from "@/app/components/analitica/comparativa/VariantsTable";
import { PointToPointPanel } from "@/app/components/analitica/comparativa/PointToPointPanel";
import { ImpossiblePrNotice } from "@/app/components/analitica/comparativa/ImpossiblePrNotice";
import { PendingApprovalNotice } from "@/app/components/analitica/comparativa/PendingApprovalNotice";
import styles from "@/app/components/analitica/comparativa/comparativa.module.css";

const PANEL_TITLE = "¿Cambia el ganador según el método?";
const NUMBERS_LABEL = "¿Cuánto da exactamente cada método?";
const CROSS_LABEL = "¿Por qué el cruce punto a punto no es un Performance Ratio?";
const EMPTY_MESSAGE = "el período no tiene ni un día con dato para medir el PR.";

export type MethodSectionProps = {
  readonly report: AnalyticsResult<PerformanceReport> | null;
  /** El cruce punto a punto sale de OTRO endpoint: comparte la pregunta de esta
   *  sección, no su fuente de datos. Sin él la tabla muestra los seis del PR. */
  readonly comparison: AnalyticsResult<ArrayComparison> | null;
  readonly onRetry: () => void;
};

export function MethodSection({ report, comparison, onRetry }: MethodSectionProps) {
  const state = chartStateFrom<PerformanceReport, PerformanceReport>(report, {
    onRetry,
    adapt: (data) => data,
    // El aviso de cobertura de la POA va de segunda línea: cuando el rango cae
    // fuera de su ventana, ese texto explica el vacío mejor que el genérico.
    emptiness: (data) =>
      data.dayCounts.withData === 0
        ? emptyBecause("NO_ROWS", EMPTY_MESSAGE, data.poaOutOfCoverage ?? undefined)
        : null,
  });

  return (
    <StatePanel title={PANEL_TITLE} state={state}>
      {(data) => (
        <MethodBody
          report={data}
          variants={readVariants(data)}
          comparison={comparison}
          onRetry={onRetry}
        />
      )}
    </StatePanel>
  );
}

type MethodBodyProps = {
  readonly report: PerformanceReport;
  readonly variants: readonly Variant[];
  readonly comparison: AnalyticsResult<ArrayComparison> | null;
  readonly onRetry: () => void;
};

function MethodBody({ report, variants, comparison, onRetry }: MethodBodyProps) {
  return (
    <>
      <CutList cuts={cutsOf(report, comparison?.ok ? comparison.data : null)} />
      <ImpossiblePrNotice variants={variants} />
      <PendingApprovalNotice approval={report.pendingApproval} />
      {/* Sin aviso no se pinta el párrafo: un hueco en blanco se lee como un
          texto que no cargó, y acá lo correcto es que no haya nada que decir. */}
      {report.energyPaths.warning ? (
        <p className="muted small">{report.energyPaths.warning}</p>
      ) : null}
      <div className={styles.disclosures}>
        <Disclosure label={NUMBERS_LABEL}>
          <div className={styles.foldedTable}>
            <VariantsTable variants={variants} />
          </div>
          <p>
            Contra la irradiancia horizontal el denominador es el mismo para los dos
            arreglos, así que esa comparación mide energía por kWp instalado y no eficiencia
            de conversión.
          </p>
          <p>{report.energyPaths.counterUnitNote}</p>
        </Disclosure>
        <Disclosure label={CROSS_LABEL}>
          <PointToPointPanel comparison={comparison} onRetry={onRetry} />
        </Disclosure>
      </div>
    </>
  );
}
