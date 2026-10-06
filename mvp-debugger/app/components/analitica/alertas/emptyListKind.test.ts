// Lo que protege: que cada vacío de la lista se reconozca por su causa, con la
// tabla de decisión de evaluación × página × filtros.
import { describe, expect, it } from "vitest";

import { emptyListKind } from "@/app/components/analitica/alertas/emptyListKind";
import { DEFAULT_ALERT_FILTERS, type AlertsQuery } from "@/app/lib/alertas/query";

const EVALUATED = "2026-10-06T16:15:00+00:00";
const DEFAULT_QUERY: AlertsQuery = { filters: DEFAULT_ALERT_FILTERS, offset: 0, selectedId: null };
const FILTERED: AlertsQuery = { ...DEFAULT_QUERY, filters: { ...DEFAULT_ALERT_FILTERS, severity: "critical" } };
const CLOSED_TAB: AlertsQuery = { ...DEFAULT_QUERY, filters: { ...DEFAULT_ALERT_FILTERS, status: "closed" } };

describe("emptyListKind", () => {
  it.each([
    ["nunca evaluado, aunque haya filtros", FILTERED, null, "neverEvaluated"],
    ["evaluado, página dos vacía", { ...DEFAULT_QUERY, offset: 20 }, EVALUATED, "pageOutOfRange"],
    ["evaluado, filtros por defecto", DEFAULT_QUERY, EVALUATED, "nothingOpen"],
    ["resumen desconocido, filtros por defecto", DEFAULT_QUERY, undefined, "nothingOpen"],
    ["evaluado, con gravedad elegida", FILTERED, EVALUATED, "filteredOut"],
    ["evaluado, en la pestaña Cerradas", CLOSED_TAB, EVALUATED, "filteredOut"],
  ] as const)("%s → %s", (_case, query, lastEvaluation, expected) => {
    expect(emptyListKind(query, lastEvaluation)).toBe(expected);
  });
});
