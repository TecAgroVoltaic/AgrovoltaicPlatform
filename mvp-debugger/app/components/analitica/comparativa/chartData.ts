// De la respuesta del backend a la forma que dibuja cada gráfico. Solo mapea:
// ni promedia, ni resta, ni convierte unidades.
//
// La regla que se repite en las cinco funciones: un valor ausente viaja como
// `null` y JAMÁS como cero. Una barra de altura cero se lee como «ese mes no
// produjo», y en este histórico casi siempre significa «ese mes no vino la
// columna» (el contador por arreglo falta entero entre noviembre y febrero).
import type { BarsData, TimeSeriesData } from "@/app/components/charts";
import type {
  ArrayKey,
  DailyPerformance,
  EnergySource,
  HourlyPoint,
  MonthlyPerformance,
  SeasonalMonth,
} from "@/app/lib/analitica/contracts/comparativa";
import { ARRAY_KEYS, ARRAY_LABEL } from "@/app/components/analitica/comparativa/vocabulary";
import type { Variant } from "@/app/components/analitica/comparativa/variants";

/** El PR es adimensional: sin unidad el eje no inventa uno. */
const NO_UNIT = "";
const WATT = "W";
const WATT_HOUR = "Wh";
const HOUR_DIGITS = 2;

function byArraySeries(values: (array: ArrayKey) => readonly (number | null)[]) {
  return ARRAY_KEYS.map((array) => ({
    id: array,
    label: ARRAY_LABEL[array],
    values: values(array),
  }));
}

export function toMonthlyPrBars(
  months: readonly MonthlyPerformance[],
  variant: Pick<Variant, "source" | "input">,
): BarsData {
  return {
    categories: months.map((month) => month.month),
    unit: NO_UNIT,
    series: byArraySeries((array) =>
      months.map((month) => month.pr[variant.source][variant.input][array]),
    ),
  };
}

export function toMonthlyEnergyBars(months: readonly SeasonalMonth[]): BarsData {
  return {
    categories: months.map((month) => month.month),
    unit: WATT_HOUR,
    series: byArraySeries((array) =>
      months.map((month) => (array === "inclinado" ? month.tiltedWh : month.verticalWh)),
    ),
  };
}

function hourLabel(hour: number): string {
  return `${String(hour).padStart(HOUR_DIGITS, "0")}:00`;
}

/** Hora LOCAL de Costa Rica: los timestamps ya lo están y nadie convierte zona. */
export function toHourlyBars(hours: readonly HourlyPoint[]): BarsData {
  return {
    categories: hours.map((point) => hourLabel(point.hour)),
    unit: WATT,
    series: byArraySeries((array) =>
      hours.map((point) => (array === "inclinado" ? point.tiltedW : point.verticalW)),
    ),
  };
}

/** El PR día a día. Los días descartados van en `null` para que se vean como el
 *  hueco que son: su PR existe en el payload pero el criterio ya lo rechazó, y
 *  pintarlo sugeriría que ese día se puede leer. */
export function toDailyPrSeries(
  days: readonly DailyPerformance[],
  source: EnergySource,
): TimeSeriesData {
  return {
    unit: NO_UNIT,
    lines: ARRAY_KEYS.map((array) => ({
      id: array,
      label: ARRAY_LABEL[array],
      points: days.map((day) => ({
        timestamp: day.day,
        value: day.valid ? day.pr[source][array] : null,
      })),
    })),
  };
}
