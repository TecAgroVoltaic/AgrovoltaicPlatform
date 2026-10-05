// Lo que estas pruebas protegen: que un hueco NUNCA se dibuje como un cero.
//
// En este histórico el contador por arreglo falta meses enteros y hay 31 días
// descartados que igual traen número. Una barra en cero diría «ese mes no
// produjo» y una línea en cero diría «ese día no generó»: las dos son mentira, y
// las dos se ven perfectamente normales en pantalla.
import { describe, expect, it } from "vitest";

import {
  toDailyPrSeries,
  toHourlyBars,
  toMonthlyPrBars,
} from "@/app/components/analitica/comparativa/chartData";
import { readVariants } from "@/app/components/analitica/comparativa/variants";
import {
  arrayComparison,
  performanceReport,
} from "@/app/components/analitica/comparativa/fixtures";

const DISCARDED_DAY_PR = 1.43;

const REPORT_WITH_DAYS = () =>
  performanceReport({
    por_dia: [
      {
        dia: "2025-09-05",
        valido: true,
        pr: {
          por_fuente: {
            contador: { inclinado: 0.897, vertical: 0.698 },
            integral: { inclinado: 0.938, vertical: 0.75 },
          },
        },
      },
      {
        dia: "2025-09-22",
        valido: false,
        pr: {
          por_fuente: {
            contador: { inclinado: DISCARDED_DAY_PR, vertical: 0.794 },
            integral: { inclinado: 0.822, vertical: 0.45 },
          },
        },
      },
    ],
  });

describe("toMonthlyPrBars", () => {
  it("un mes sin ese camino de energía va como hueco y no como cero", () => {
    // Given noviembre, que no tiene contador por arreglo pero sí integral
    const report = performanceReport();

    // When se arman las barras del camino del contador
    const bars = toMonthlyPrBars(report.months, { source: "contador", input: "ghi" });

    // Then el mes conserva su categoría y su valor es nulo
    expect(bars.categories).toEqual(["2025-11"]);
    expect(bars.series.map((series) => series.values)).toEqual([[null], [null]]);
  });

  it("con el camino que sí cubre el mes, trae los dos arreglos", () => {
    // Given el mismo mes por la integral de la potencia
    const report = performanceReport();

    // When se arman esas barras
    const bars = toMonthlyPrBars(report.months, { source: "integral", input: "ghi" });

    // Then hay una serie por arreglo, con el PR que mandó el backend
    expect(bars.series.map((series) => series.values)).toEqual([[0.723], [0.501]]);
  });
});

describe("toDailyPrSeries", () => {
  it("un día descartado queda como hueco aunque su PR exista en el dato", () => {
    // Given un día válido y otro descartado que igual trae PR
    const report = REPORT_WITH_DAYS();

    // When se arma la serie diaria
    const series = toDailyPrSeries(report.days ?? [], "contador");

    // Then el día descartado no dibuja punto: su número existe, pero el criterio
    // ya lo rechazó y pintarlo sugeriría que se puede leer
    expect(series.lines[0].points).toEqual([
      { timestamp: "2025-09-05", value: 0.897 },
      { timestamp: "2025-09-22", value: null },
    ]);
  });
});

describe("toHourlyBars", () => {
  it("la hora se escribe como hora local, sin convertir zona", () => {
    // Given la curva horaria del período
    const comparison = arrayComparison();

    // When se arman las barras por hora
    const bars = toHourlyBars(comparison.hourly);

    // Then las categorías son la hora tal como vino
    expect(bars.categories).toEqual(["11:00", "15:00"]);
    expect(bars.unit).toBe("W");
  });
});
