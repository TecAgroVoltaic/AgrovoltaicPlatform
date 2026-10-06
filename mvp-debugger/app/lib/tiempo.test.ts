// La hora del sitio no puede depender de dónde esté parado quien mira. Cada caso
// corre con el reloj de la máquina en varias zonas: si un resultado cambia con
// la zona, es el bug que este módulo existe para impedir.
import { afterEach, describe, expect, it } from "vitest";

import {
  daysInMonth,
  diaEnSitio,
  elapsedSince,
  longDateLabel,
  monthLabel,
  monthStart,
  shiftMonths,
  weekdayMondayFirst,
  fechaCorta,
  hoyEnSitio,
  instanteEnSitio,
  momentoEnSitio,
  moverDias,
  moverReloj,
} from "@/app/lib/tiempo";

// Al oeste de UTC, UTC, al este, muy al este y una zona con horario de verano
// cuyo cambio cae en una de las fechas de prueba.
const ZONAS = ["America/Costa_Rica", "UTC", "Europe/Berlin", "Asia/Tokyo", "Pacific/Auckland"];
const ZONA_ORIGINAL = process.env.TZ;

afterEach(() => {
  process.env.TZ = ZONA_ORIGINAL;
});

describe.each(ZONAS)("con el reloj de la máquina en %s", (zona) => {
  const enZona = <T>(fn: () => T): T => {
    process.env.TZ = zona;
    return fn();
  };

  it("el día siguiente es siempre el día siguiente", () => {
    // Given una fecha de calendario / When se corre un día / Then no depende de la zona
    expect(enZona(() => moverDias("2026-10-03", 1))).toBe("2026-10-04");
    expect(enZona(() => moverDias("2026-10-05", -1))).toBe("2026-10-04");
  });

  it("cruza fin de mes, fin de año y el 29 de febrero", () => {
    expect(enZona(() => moverDias("2026-12-31", 1))).toBe("2027-01-01");
    expect(enZona(() => moverDias("2028-02-28", 1))).toBe("2028-02-29");
    expect(enZona(() => moverDias("2026-03-01", -1))).toBe("2026-02-28");
  });

  it("no pierde ni gana un día en el cambio de hora de la zona del navegador", () => {
    // 2026-03-29 y 2026-10-25: cambio de hora en Europa.
    expect(enZona(() => moverDias("2026-03-28", 1))).toBe("2026-03-29");
    expect(enZona(() => moverDias("2026-03-29", 1))).toBe("2026-03-30");
    expect(enZona(() => moverDias("2026-10-25", 1))).toBe("2026-10-26");
  });

  it("el reloj del sitio se mueve en segundos exactos, sin pasar por la zona", () => {
    expect(enZona(() => moverReloj("2026-10-03T12:00:00", -3600))).toBe("2026-10-03T11:00:00");
    expect(enZona(() => moverReloj("2026-10-03T00:15", -1800))).toBe("2026-10-02T23:45:00");
    // La hora que NO existe en Europa el día del cambio sí existe en el sitio.
    expect(enZona(() => moverReloj("2026-03-29T03:00:00", -1800))).toBe("2026-03-29T02:30:00");
  });

  it("hoy es el día del sitio, no el de UTC ni el del navegador", () => {
    // Given las 02:00 UTC del 6 de octubre: en Costa Rica son las 20:00 del 5
    const ahora = new Date("2026-10-06T02:00:00Z");
    expect(enZona(() => hoyEnSitio(ahora))).toBe("2026-10-05");
    // Y a las 06:00 UTC ya es medianoche en el sitio
    expect(enZona(() => hoyEnSitio(new Date("2026-10-06T06:00:00Z")))).toBe("2026-10-06");
  });

  it("un instante real se muestra en hora del sitio", () => {
    // Given las 02:30 UTC del 6 de octubre = 20:30 del 5 en el sitio
    const texto = enZona(() => instanteEnSitio("2026-10-06T02:30:00Z"));
    expect(texto).toContain("5/10/26");
    expect(texto).toMatch(/20:30|8:30/);
    expect(enZona(() => diaEnSitio("2026-10-06T02:30:00Z"))).toContain("05");
  });

  it("el calendario ubica cada día en su día de la semana, lunes primero", () => {
    // Given fechas cuyo día de la semana se conoce / Then no depende de la zona
    expect(enZona(() => weekdayMondayFirst("2026-06-01"))).toBe(0); // lunes
    expect(enZona(() => weekdayMondayFirst("2026-05-31"))).toBe(6); // domingo
    expect(enZona(() => weekdayMondayFirst("2026-03-29"))).toBe(6); // cambio de hora en Europa
    expect(enZona(() => weekdayMondayFirst("2024-11-10"))).toBe(6);
  });

  it("el largo del mes y el salto de mes respetan bisiestos y fin de año", () => {
    expect(enZona(() => daysInMonth(2028, 2))).toBe(29);
    expect(enZona(() => daysInMonth(2026, 2))).toBe(28);
    expect(enZona(() => daysInMonth(2026, 12))).toBe(31);
    // When se salta de un 31 a un mes más corto / Then cae en su último día
    expect(enZona(() => shiftMonths("2026-01-31", 1))).toBe("2026-02-28");
    expect(enZona(() => shiftMonths("2026-12-15", 1))).toBe("2027-01-15");
    expect(enZona(() => shiftMonths("2025-01-10", -2))).toBe("2024-11-10");
    expect(enZona(() => monthStart("2026-05-23"))).toBe("2026-05-01");
  });

  it("tolera nulos y basura sin romper la vista", () => {
    expect(enZona(() => instanteEnSitio(null))).toBe("—");
    expect(enZona(() => instanteEnSitio("no-es-fecha"))).toBe("no-es-fecha");
    expect(enZona(() => diaEnSitio(undefined))).toBe("—");
  });

  it("el momento de un hilo dice «hoy» con el día del sitio, no el de la máquina", () => {
    // Given las 02:30 UTC del 6 de octubre, que en el sitio son las 20:30 del 5
    const ahora = new Date("2026-10-06T03:00:00Z");
    // When se rotula un instante de la misma noche del sitio y otro del día anterior
    // Then el primero es «hoy» y el segundo lleva su fecha corta
    expect(enZona(() => momentoEnSitio(new Date("2026-10-06T02:30:00Z"), ahora))).toBe("hoy 20:30");
    expect(enZona(() => momentoEnSitio(new Date("2026-10-04T15:05:00Z"), ahora))).toBe("4 oct 09:05");
    expect(enZona(() => momentoEnSitio(new Date("2025-09-04T15:05:00Z"), ahora))).toBe("4 set 2025 09:05");
  });
});

describe("rótulos de calendario", () => {
  it("nombra el mes y la fecha completa en español de Costa Rica", () => {
    expect(monthLabel("2025-09-04")).toBe("setiembre 2025");
    expect(longDateLabel("2026-05-03")).toBe("3 de mayo de 2026");
  });
});

describe("fechaCorta", () => {
  it("abrevia el mes como en Costa Rica y agrega el año solo si se pide", () => {
    expect(fechaCorta("2026-09-03", false)).toBe("3 set");
    expect(fechaCorta("2026-01-31", true)).toBe("31 ene 2026");
  });
});

describe("elapsedSince", () => {
  const now = new Date("2026-10-06T16:15:00Z");

  it.each([
    ["2026-10-06T16:14:52Z", "hace 8 s"],
    ["2026-10-06T16:14:00Z", "hace 1 min"],
    ["2026-10-06T15:15:01Z", "hace 59 min"],
    ["2026-10-06T14:15:00Z", "hace 2 h"],
    ["2026-10-05T16:15:00Z", "hace 1 d"],
  ])("desde %s se lee «%s», en la unidad más grande que cabe entera", (since, expected) => {
    expect(elapsedSince(new Date(since), now)).toBe(expected);
  });

  it("un instante en el futuro (relojes desfasados) no da un tiempo negativo", () => {
    expect(elapsedSince(new Date("2026-10-06T16:16:00Z"), now)).toBe("hace 0 s");
  });
});
