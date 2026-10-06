// Lo que protege esta prueba: que la ficha no ofrezca un botón que el backend
// rechaza con 409, ni esconda uno que acepta. La tabla esperada es la de
// `historico/alertas/ciclo.py` (TRANSICIONES), copiada a mano a propósito: si
// alguien toca `transitions.ts` sin mirar el backend, esto lo frena.
import { describe, expect, it } from "vitest";

import { availableActions } from "@/app/lib/alertas/transitions";
import type { AlertAction, AlertStatus } from "@/app/lib/alertas/vocabulary";

const BACKEND_TRANSITIONS: ReadonlyArray<readonly [AlertStatus, readonly AlertAction[]]> = [
  ["new", ["acknowledge", "dismiss"]],
  ["acknowledged", ["followUp", "dismiss"]],
  ["tracking", ["followUp", "resolve", "dismiss"]],
  ["resolved", ["reopen"]],
  ["dismissed", ["reopen"]],
];

describe("acciones por estado", () => {
  it.each(BACKEND_TRANSITIONS)("desde %s se ofrece exactamente %j", (status, expected) => {
    // Given un estado / When se piden sus acciones / Then son las que acepta el backend
    expect([...availableActions(status)].sort()).toEqual([...expected].sort());
  });

  it("resolver solo se ofrece en seguimiento", () => {
    // Given todos los estados / When se busca dónde aparece «resolver»
    const where = BACKEND_TRANSITIONS.filter(([status]) => availableActions(status).includes("resolve"));

    // Then es uno solo: una nueva o aprobada no se resuelve sin seguimiento
    expect(where.map(([status]) => status)).toEqual(["tracking"]);
  });
});
