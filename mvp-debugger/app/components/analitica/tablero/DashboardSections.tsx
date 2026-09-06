// El tablero cuando SÍ hay datos: las nueve casillas, en el orden en que se
// leen. Primero la alerta de frescura, después la energía del sistema, después
// cada arreglo, y al final el contexto que dice cuánto de todo eso se midió.
import { ArrayCard } from "@/app/components/analitica/tablero/ArrayCard";
import { AvailabilityCard, ConfidenceCard } from "@/app/components/analitica/tablero/ContextCards";
import { Disclosure } from "@/app/components/analitica/Disclosure";
import { FreshnessBanner } from "@/app/components/analitica/tablero/FreshnessBanner";
import { PHOTOVOLTAIC_ARRAYS, type ArrayId } from "@/app/components/analitica/tablero/arrays";
import { SystemEnergyCard } from "@/app/components/analitica/tablero/SystemEnergyCard";
import { formatDays, formatInclusiveRange } from "@/app/components/analitica/tablero/format";
import { formatRange } from "@/app/lib/analitica/dateRange";
import type { DashboardSummary } from "@/app/lib/analitica/contracts/tablero";
import styles from "@/app/components/analitica/tablero/tablero.module.css";

/** Por qué los dos arreglos no suman el total. Es metodología correcta que nadie
 * necesita para leer un número, así que va plegada: a un clic de quien la
 * busque, fuera del camino de quien no. */
const AC_VERSUS_DC_LABEL = "Por qué Inclinado + Vertical no suman el total";
const AC_VERSUS_DC_NOTE =
  "El total del sistema es corriente alterna leída del contador del inversor; las casillas por " +
  "arreglo son corriente continua integrada, porque el inversor no reporta alterna por arreglo. " +
  "No se restan entre sí.";

export function DashboardSections({ summary }: { readonly summary: DashboardSummary }) {
  const recentTitle = `Últimos ${formatDays(summary.recentWindowDays)} con datos`;

  return (
    <>
      <FreshnessBanner freshness={summary.freshness} />

      <SystemEnergyCard
        accounts={summary.accounts}
        recentTotal={summary.recentEnergy.totalAc}
        recentTitle={recentTitle}
        recentNote={describeRecentWindow(summary)}
        periodLabel={formatRange(summary.window)}
      />

      <div className={styles.arrays}>
        {PHOTOVOLTAIC_ARRAYS.map((array) => (
          <ArrayCard
            key={array.id}
            array={array}
            {...figuresFor(summary, array.id)}
            recentTitle={recentTitle}
          />
        ))}
      </div>

      <Disclosure label={AC_VERSUS_DC_LABEL}>
        <p>{AC_VERSUS_DC_NOTE}</p>
      </Disclosure>

      <div className={styles.context}>
        <ConfidenceCard confidence={summary.confidence} />
        <AvailabilityCard availability={summary.confidence?.availability ?? null} />
      </div>
    </>
  );
}

/** Los tres números de un arreglo. El resumen los trae en tres bloques distintos
 * (período, reciente y rendimiento) y la tarjeta los quiere juntos. */
function figuresFor(summary: DashboardSummary, id: ArrayId) {
  if (id === "tilted") {
    return {
      periodEnergy: summary.periodEnergy.tilted,
      recentEnergy: summary.recentEnergy.tilted,
      specificYield: summary.tiltedYield,
    };
  }
  return {
    periodEnergy: summary.periodEnergy.vertical,
    recentEnergy: summary.recentEnergy.vertical,
    specificYield: summary.verticalYield,
  };
}

/** Los «últimos días» se cuentan contra el último día CON DATOS, jamás contra
 * hoy: contra hoy las tres casillas darían cero, y un cero se lee como «no
 * produjo» y no como «no hay dato». Se dice UNA vez, con las fechas: repetirlo
 * en las tres casillas era la misma advertencia tres veces. */
function describeRecentWindow(summary: DashboardSummary): string {
  if (summary.recentWindow === null) return "En este rango no hubo ningún día con datos.";
  return `${formatInclusiveRange(summary.recentWindow)}, no los últimos del calendario.`;
}
