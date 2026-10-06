// La grilla del mes y el desplazamiento del desplegable: dos cálculos que si se
// corren un día o un píxel se ven enseguida en pantalla pero no en un test de
// componente (jsdom no tiene layout).
import { describe, expect, it } from "vitest";

import { monthWeeks, monthsBetween, sameDayInMonth } from "@/app/components/analitica/datePicker/calendarMonth";
import { horizontalShift } from "@/app/components/analitica/datePicker/placement";

describe("monthWeeks", () => {
  it("arranca en lunes con huecos y completa la última semana", () => {
    // Given junio 2026, que empieza lunes y termina martes
    const weeks = monthWeeks("2026-06-15");
    expect(weeks[0][0]).toBe("2026-06-01");
    expect(weeks).toHaveLength(5);
    expect(weeks[4]).toEqual(["2026-06-29", "2026-06-30", null, null, null, null, null]);
  });

  it("un mes que empieza domingo deja seis huecos delante", () => {
    // Given noviembre 2024, primer mes con datos, que empieza viernes
    const firstWeek = monthWeeks("2024-11-10")[0];
    expect(firstWeek.slice(0, 4)).toEqual([null, null, null, null]);
    expect(firstWeek[4]).toBe("2024-11-01");
    expect(monthWeeks("2026-03-01")[0]).toEqual([null, null, null, null, null, null, "2026-03-01"]);
  });
});

describe("salto de mes", () => {
  it("lista los meses entre dos fechas, cruzando el año", () => {
    expect(monthsBetween("2024-11-10", "2025-02-03")).toEqual(["2024-11", "2024-12", "2025-01", "2025-02"]);
  });

  it("conserva el día y lo recorta al largo del mes destino", () => {
    expect(sameDayInMonth("2026-05-31", "2026-06")).toBe("2026-06-30");
    expect(sameDayInMonth("2026-05-03", "2024-11")).toBe("2024-11-03");
  });
});

describe("horizontalShift", () => {
  const VIEWPORT = 360;
  const WIDTH = 314;

  it("no mueve un calendario que ya entra", () => {
    expect(horizontalShift({ left: 16, width: WIDTH }, VIEWPORT)).toBe(0);
  });

  it("corre a la izquierda el de «Hasta» que se sale por la derecha", () => {
    // Given abierto desde x=180 a 360 px: llegaría a 494
    // Then se corre para que termine a 8 px del borde
    expect(horizontalShift({ left: 180, width: WIDTH }, VIEWPORT)).toBe(360 - 8 - 494);
  });

  it("si no entra entero, se pega al margen izquierdo", () => {
    expect(horizontalShift({ left: 100, width: 400 }, VIEWPORT)).toBe(8 - 100);
  });
});
