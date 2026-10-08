// Las preguntas de ejemplo del estado vacío, armadas con fechas que SÍ tienen
// datos. Un ejemplo fijo envejece con cada carga y termina apuntando a un día
// vacío: la primera respuesta del asistente sería «no hay datos», con el sistema
// quedando mal por una pregunta que él mismo sugirió.
//
// Sin cobertura (cargando, o el endpoint falló) los ejemplos van SIN fecha y
// dejan que el backend resuelva «el último día con datos». Nunca una fecha
// inventada ni una cobertura escrita a mano.
//
// Puro: sin React ni red, se prueba con datos.
import type { CoverageBounds } from "@/app/lib/analitica/contracts/daysWithData";
import { addDays, type IsoDate } from "@/app/lib/analitica/dateRange";
import { INTENT_CARDS, type IntentCard, type IntentKind } from "@/app/lib/asistente/intents";
import { fechaCorta, monthLabel } from "@/app/lib/tiempo";

const WITH_YEAR = true;
const SITE_NAME = "Datos de la planta de San Carlos";

export type ExampleCoverage = {
  /** Días con datos de cualquier fuente. */
  readonly days: Iterable<IsoDate>;
  readonly daysBySource: {
    readonly electrical: readonly IsoDate[];
    readonly radiation: readonly IsoDate[];
  };
  readonly bounds: CoverageBounds;
};

export type ExamplesInput = {
  /** null mientras carga o si el endpoint falló. */
  readonly coverage: ExampleCoverage | null;
  /** `fecha_fin` de la última alerta abierta de inversor parado con sol, si hay. */
  readonly latestOutageDate: IsoDate | null;
};

export type Example = IntentCard & { readonly question: string };

function latestOf(days: Iterable<IsoDate>): IsoDate | null {
  let latest: IsoDate | null = null;
  for (const day of days) if (latest === null || day > latest) latest = day;
  return latest;
}

function shortDate(day: IsoDate): string {
  return fechaCorta(day, WITH_YEAR);
}

function queryQuestion(latestRadiationDay: IsoDate | null): string {
  const when = latestRadiationDay ? shortDate(latestRadiationDay) : "último día con datos";
  return `¿Cómo estuvo la irradiancia el ${when}?`;
}

function chartQuestion(latestElectricalDay: IsoDate | null): string {
  const month = latestElectricalDay ? `de ${monthLabel(latestElectricalDay)}` : "del último mes con datos";
  return `Graficá la potencia ${month} por arreglo`;
}

function diagnoseQuestion(latestOutageDate: IsoDate | null, latestDay: IsoDate | null): string {
  if (latestOutageDate) return `¿Por qué el ${shortDate(latestOutageDate)} la planta no generó?`;
  const when = latestDay ? shortDate(latestDay) : "último día con datos";
  return `¿Qué pasó con la planta el ${when}?`;
}

/** Una pregunta por intención, en el orden de `INTENT_CARDS`. */
export function buildExamples({ coverage, latestOutageDate }: ExamplesInput): readonly Example[] {
  const questions: Readonly<Record<IntentKind, string>> = {
    query: queryQuestion(coverage ? latestOf(coverage.daysBySource.radiation) : null),
    chart: chartQuestion(coverage ? latestOf(coverage.daysBySource.electrical) : null),
    download: "Dame la temperatura de la última semana con datos en csv",
    diagnose: diagnoseQuestion(latestOutageDate, coverage ? latestOf(coverage.days) : null),
  };
  return INTENT_CARDS.map((card) => ({ ...card, question: questions[card.kind] }));
}

/** «Datos de la planta de San Carlos del 10 nov 2024 al 31 ago 2026»; sin
 *  cobertura, sin fechas. El fin exclusivo se muestra como el último día que entra. */
export function describeCoverage(bounds: CoverageBounds | null): string {
  if (bounds === null) return `${SITE_NAME}.`;
  const lastDay = addDays(bounds.toExclusive, -1);
  return `${SITE_NAME} del ${shortDate(bounds.from)} al ${shortDate(lastDay)}.`;
}
