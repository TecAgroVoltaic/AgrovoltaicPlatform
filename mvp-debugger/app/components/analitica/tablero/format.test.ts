// Formato: se prueba lo que puede mentir. La hora es la más peligrosa de las
// tres, porque interpretarla como UTC corre seis horas todo lo que se lea.
import { describe, expect, it } from "vitest";

import {
  formatDays,
  formatInclusiveRange,
  formatInteger,
  formatLocalStamp,
  formatUnit,
} from "@/app/components/analitica/tablero/format";

describe("formatLocalStamp", () => {
  it("no corre la hora aunque la marca venga etiquetada UTC", () => {
    // Given la marca del último dato, etiquetada +00 pero con hora local de CR
    const stamp = "2026-06-01T17:55:00+00:00";

    // When se formatea
    const shown = formatLocalStamp(stamp);

    // Then se muestran las 17:55, que es lo guardado, y no las 11:55 de restar
    // seis horas: la base etiqueta UTC pero guarda hora local
    expect(shown).toBe("2026-06-01, 17:55");
  });

  it("muestra solo el día cuando la marca no trae hora", () => {
    // Given una fecha sin parte horaria
    // When se formatea
    // Then no aparece una hora inventada
    expect(formatLocalStamp("2026-06-01")).toBe("2026-06-01");
  });
});

describe("formatInclusiveRange", () => {
  it("convierte el fin exclusivo en el último día que sí entra", () => {
    // Given la ventana [2026-05-26, 2026-06-02) que manda el backend
    const range = { from: "2026-05-26", toExclusive: "2026-06-02" };

    // When se escribe para una persona
    // Then el último día es el 01 y no el 02, que no forma parte del rango
    expect(formatInclusiveRange(range)).toBe("2026-05-26 a 2026-06-01");
  });

  it("cruza el cambio de mes sin perder un día", () => {
    // Given una ventana que termina el primer día de un mes
    const range = { from: "2026-01-28", toExclusive: "2026-02-01" };

    // When se escribe
    // Then el último día es el 31 de enero
    expect(formatInclusiveRange(range)).toBe("2026-01-28 a 2026-01-31");
  });
});

describe("formatUnit", () => {
  it("escribe bien la unidad anual y deja pasar el resto tal cual", () => {
    // Given las unidades que manda el backend
    // When se traducen a pantalla
    // Then solo se corrige la que viene sin eñe: ninguna unidad se inventa
    expect(formatUnit("kWh/kWp/ano")).toBe("kWh/kWp/año");
    expect(formatUnit("kWh")).toBe("kWh");
    expect(formatUnit("kWh/kWp")).toBe("kWh/kWp");
  });
});

describe("formatDays", () => {
  it("concuerda el singular y no dice «1 días»", () => {
    // Given conteos de cero, uno y varios días
    // When se formatean
    // Then solo el uno va en singular
    expect(formatDays(0)).toBe("0 días");
    expect(formatDays(1)).toBe("1 día");
    expect(formatDays(274)).toBe("274 días");
  });
});

describe("formatInteger", () => {
  it("agrupa los miles sin tocar las cifras", () => {
    // Given la potencia pico de un arreglo y un conteo pequeño
    // When se formatean
    // Then las cifras son las mismas: el separador depende del ICU del entorno,
    // así que se comprueba el contenido y no qué carácter lo separa
    expect(formatInteger(1420).replace(/\D/g, "")).toBe("1420");
    expect(formatInteger(274)).toBe("274");
  });

  it("no inventa decimales en un conteo", () => {
    // Given un número entero
    // When se formatea
    // Then no aparece ninguna coma decimal
    expect(formatInteger(228)).not.toContain(",");
  });
});
