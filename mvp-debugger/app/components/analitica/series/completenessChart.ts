// De la respuesta de `/analitica/completitud` a lo que dibuja `BarsChart` (Fig. 4).
//
// Se dibujan DOS barras por tramo, registradas y esperadas, y no una sola. El
// motivo es la cadencia: lo eléctrico está remuestreado a 5 min y la radiación va
// a 15 s, así que el mismo día espera 149 lecturas de una fuente y 3.013 de la
// otra. Con una sola barra, dos períodos con la misma completitud se ven idénticos
// midiendo contra objetivos que difieren en veinte veces. La barra de lo esperado
// es también la que hace VISIBLE un día vacío: queda sola, sin nada al lado.
//
// El cero es un dato acá y por eso se pasa como cero y no como null: «cero filas
// registradas» es justo lo que este gráfico mide. Es al revés que en una serie de
// potencia, donde un cero inventado sobre un hueco sería una mentira.
import type { BarsData } from "@/app/components/charts";
import type { CompletenessSource, SourceSummary } from "@/app/lib/analitica/contracts/series";

const LOCALE = "es-CR";
const READINGS_UNIT = "lecturas";

const SOURCE_LABEL: Readonly<Record<string, string>> = {
  electrico: "Eléctrico (inversor)",
  radiacion: "Radiación (piranómetros)",
};

/** El caso `nominal` grita porque cambia la lectura del gráfico: la barra de lo
 *  esperado sale de una constante y no de una medición. El cómo se mide la otra
 *  vive en la nota plegada, no en el pie. */
const CADENCE_ORIGIN_LABEL = {
  measured: "medida",
  nominal: "NOMINAL, el tramo no tenía ni una fila con la que medirla",
} as const;

export function sourceLabel(key: string): string {
  return SOURCE_LABEL[key] ?? key;
}

export function toBarsData(source: CompletenessSource): BarsData {
  return {
    unit: READINGS_UNIT,
    categories: source.buckets.map((bucket) => bucket.period),
    series: [
      {
        id: `${source.key}-registradas`,
        label: "Registradas",
        values: source.buckets.map((bucket) => bucket.readings),
      },
      {
        id: `${source.key}-esperadas`,
        label: "Esperadas a la cadencia del tramo",
        color: "ceil",
        values: source.buckets.map((bucket) => bucket.expected),
      },
    ],
  };
}

function count(value: number): string {
  return value.toLocaleString(LOCALE);
}

function percent(fraction: number): string {
  return fraction.toLocaleString(LOCALE, { style: "percent", maximumFractionDigits: 1 });
}

/** Contra qué se midió lo esperado. Sin esto, la completitud no significa nada. */
export function describeCadence(summary: SourceSummary): string {
  return `1 lectura cada ${summary.cadenceSeconds} s, cadencia ${
    CADENCE_ORIGIN_LABEL[summary.cadenceOrigin]
  }`;
}

export function describeCompleteness(summary: SourceSummary): string {
  return (
    `${count(summary.readings)} de ${count(summary.expectedReadings)} lecturas ` +
    `(${percent(summary.completeness)}) en ${summary.daysWithData} de ` +
    `${summary.calendarDays} días`
  );
}

/** Los tramos sin una sola fila, del más largo al más corto. Los cuenta el backend. */
export function longestGapsFirst(summary: SourceSummary) {
  return [...summary.gaps].sort((first, second) => second.days - first.days);
}
