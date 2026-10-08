// Lo que protege: que un período se lea igual en el chip de rango y en una
// alerta, con el fin inclusivo y sin años repetidos ni ambiguos.
import { describe, expect, it } from "vitest";

import { dateSpanLabel, rangeLabel } from "@/app/lib/analitica/rangeLabel";

describe("rangeLabel", () => {
  it.each([
    [{ from: "2026-05-03", toExclusive: "2026-06-02", granularity: "day" }, "3 may – 1 jun 2026 · diaria"],
    [{ from: "2026-05-03", toExclusive: "2026-05-10", granularity: "hour" }, "3 – 9 may 2026 · horaria"],
    [{ from: "2024-11-10", toExclusive: "2026-06-02", granularity: "month" }, "10 nov 2024 – 1 jun 2026 · mensual"],
    [{ from: "2026-08-12", toExclusive: "2026-08-13", granularity: "hour" }, "12 ago 2026 · horaria"],
  ] as const)("%o se lee «%s», con el fin inclusivo", (range, expected) => {
    expect(rangeLabel(range)).toBe(expected);
  });
});

describe("dateSpanLabel", () => {
  it.each([
    ["2026-08-26", "2026-08-31", "26 – 31 ago"],
    ["2026-07-03", "2026-08-09", "3 jul – 9 ago"],
    ["2026-07-21", "2026-07-21", "21 jul"],
    // Años distintos: el año aparece aunque no se pida, o el rango sería ambiguo
    ["2025-12-28", "2026-01-03", "28 dic 2025 – 3 ene 2026"],
  ])("sin año: %s a %s se lee «%s»", (first, last, expected) => {
    expect(dateSpanLabel(first, last, false)).toBe(expected);
  });
});
