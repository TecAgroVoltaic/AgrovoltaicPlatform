// Lo que protege: que la tira de días marque exactamente los días de la
// evidencia, se parta por mes y no se rompa con fechas sucias.
import { describe, expect, it } from "vitest";

import { affectedDays, MAX_MONTH_STRIPS } from "@/app/components/analitica/alertas/affectedDays";

describe("affectedDays", () => {
  it("una racha con huecos va del primer al último día afectado, marcando solo esos", () => {
    // Given el inversor parado el 26 y del 29 al 31 de agosto
    const { strips, hiddenMonths } = affectedDays(["2026-08-31", "2026-08-26", "2026-08-29", "2026-08-30"]);

    // Then una sola tira de agosto, del 26 al 31, con el 27 y el 28 sin marcar
    expect(strips).toHaveLength(1);
    expect(strips[0].label).toBe("agosto 2026");
    expect(strips[0].days.map((day) => [day.date.slice(-2), day.affected])).toEqual([
      ["26", true],
      ["27", false],
      ["28", false],
      ["29", true],
      ["30", true],
      ["31", true],
    ]);
    expect(hiddenMonths).toBe(0);
  });

  it("días de dos meses dan dos tiras, sin rellenar el hueco entre meses", () => {
    const { strips } = affectedDays(["2026-07-30", "2026-08-02"]);
    expect(strips.map((strip) => strip.days.length)).toEqual([1, 1]);
  });

  it("descarta fechas inválidas y repetidas; sin fechas no hay tiras", () => {
    expect(affectedDays(["2026-02-30", "basura", "2026-07-21", "2026-07-21"]).strips[0].days).toHaveLength(1);
    expect(affectedDays([]).strips).toEqual([]);
  });

  it("con más meses que el tope muestra los más recientes y cuenta los que quedan fuera", () => {
    // Given un día afectado por mes durante ocho meses
    const dates = ["01", "02", "03", "04", "05", "06", "07", "08"].map((month) => `2026-${month}-10`);

    // When se arman las tiras
    const { strips, hiddenMonths } = affectedDays(dates);

    // Then quedan los últimos meses y se dice cuántos se omitieron
    expect(strips).toHaveLength(MAX_MONTH_STRIPS);
    expect(strips[0].month).toBe("2026-03");
    expect(hiddenMonths).toBe(2);
  });
});
