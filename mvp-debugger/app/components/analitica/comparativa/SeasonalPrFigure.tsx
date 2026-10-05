"use client";
// El PR mes a mes: la estacionalidad es el argumento físico, no un adorno.
//
// El promedio anual esconde justo lo que explica la diferencia entre los dos
// arreglos. Con el sol alto y cerca del cenit la brecha se cierra; con el sol
// bajo y al sur (que es hacia donde mira el inclinado) el inclinado se despega,
// porque en esos meses el vertical vive de difusa y de reflejada. Un solo número
// anual borra ese patrón.
import { useState } from "react";

import { BarsChart, type BarsData } from "@/app/components/charts";
import type { AnalyticsResult } from "@/app/lib/analitica/errors";
import type { PerformanceReport } from "@/app/lib/analitica/contracts/comparativa";
import { chartStateFrom, emptyBecause } from "@/app/components/analitica/comparativa/chartState";
import { toMonthlyPrBars } from "@/app/components/analitica/comparativa/chartData";
import { formatDays } from "@/app/components/analitica/comparativa/format";
import {
  readVariants,
  readableVariants,
  variantPath,
  type Variant,
  type VariantId,
} from "@/app/components/analitica/comparativa/variants";
import { VariantChips } from "@/app/components/analitica/comparativa/VariantChips";
import { ARRAY_KEYS } from "@/app/components/analitica/comparativa/vocabulary";
import styles from "@/app/components/analitica/comparativa/comparativa.module.css";

/** El camino que cubre los 197 días válidos, y contra la irradiancia MEDIDA:
 *  es el punto de partida que no depende de ningún modelo. */
const DEFAULT_VARIANT_ID: VariantId = "integral/ghi";
/** Solo se alcanza si el gráfico se pinta sin variante, y entonces `BarsChart`
 *  lo convierte en un vacío con motivo antes de dibujar nada. */
const NO_BARS: BarsData = { categories: [], series: [], unit: "" };
const MONTH_SEPARATOR = ", ";

export type SeasonalPrFigureProps = {
  readonly result: AnalyticsResult<PerformanceReport> | null;
  readonly onRetry: () => void;
};

export function SeasonalPrFigure({ result, onRetry }: SeasonalPrFigureProps) {
  // La variante elegida vive en React y no en la URL: el selector de rango del
  // cascarón reescribe la query entera al cambiar de período y un parámetro
  // propio se perdería en silencio.
  const [chosenId, setChosenId] = useState<VariantId>(DEFAULT_VARIANT_ID);
  const options = result?.ok ? readableVariants(readVariants(result.data)) : [];
  const selected = options.find((variant) => variant.id === chosenId) ?? options[0] ?? null;

  const state = chartStateFrom<PerformanceReport, BarsData>(result, {
    onRetry,
    adapt: (report) => (selected ? toMonthlyPrBars(report.months, selected) : NO_BARS),
    emptiness: (report) => emptinessOf(report, selected),
  });

  return (
    <div className={styles.figure}>
      {options.length > 0 ? (
        <VariantChips options={options} selected={selected} onSelect={setChosenId} />
      ) : null}
      {result?.ok && selected ? (
        <ImpossibleMonths report={result.data} selected={selected} />
      ) : null}
      {selected ? (
        <p className="muted small">{describeSelection(selected, result)}</p>
      ) : null}
      <BarsChart
        title="Performance Ratio mes a mes"
        subtitle="Cada mes sobre sus propios días válidos. Un mes sin barra es un mes sin ese dato, nunca un mes con rendimiento cero."
        state={state}
      />
    </div>
  );
}

function emptinessOf(report: PerformanceReport, selected: Variant | null) {
  if (report.months.length === 0) {
    return emptyBecause("NO_ROWS", "el período no tiene ni un mes con días válidos.");
  }
  if (selected === null) {
    return emptyBecause(
      "FILTERED_OUT",
      "ninguna variante del período se puede leer en una escala de rendimiento.",
    );
  }
  return null;
}

/** Va FUERA del pie del gráfico a propósito: el pie solo se pinta con datos, y
 *  justo cuando el camino elegido no cubre ningún mes es cuando hace falta leer
 *  por qué. */
function describeSelection(
  selected: Variant,
  result: AnalyticsResult<PerformanceReport> | null,
): string {
  const base = `${selected.label}, ${formatDays(selected.days)} válidos en el período.`;
  if (selected.source !== "contador" || !result?.ok) return base;
  // Sin advertencia el contador cubre todos los días válidos: no hay sesgo de
  // muestreo que contar, y agregar un texto propio contradiría al servicio.
  const { warning } = result.data.energyPaths;
  return warning ? `${base} ${warning}` : base;
}

/** Un mes de la variante elegida puede superar 1 aunque el total no lo haga. Se
 *  nombra en texto en vez de marcarse en la barra: la escala del gráfico no
 *  puede decir «este valor es imposible», y sin el aviso se leería como el mejor
 *  mes del año. */
function ImpossibleMonths({
  report,
  selected,
}: {
  readonly report: PerformanceReport;
  readonly selected: Variant;
}) {
  const flagged = report.months
    .filter((month) =>
      ARRAY_KEYS.some((array) =>
        month.exceedsPhysicalLimit.includes(variantPath(selected.source, selected.input, array)),
      ),
    )
    .map((month) => month.month);
  if (flagged.length === 0) return null;
  return (
    <p className={styles.impossibleMonths}>
      Con esta variante el PR supera 1 en {flagged.join(MONTH_SEPARATOR)}: ahí el número no
      mide rendimiento, mide una irradiancia mal medida o mal modelada.
    </p>
  );
}
