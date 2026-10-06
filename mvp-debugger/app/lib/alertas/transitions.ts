// Qué acciones ofrece la ficha según el estado: la tabla de §4.2 tal como la
// implementa el backend (`historico/alertas/ciclo.py`, `TRANSICIONES`). Es una
// tabla y no una cadena de `if` para que se compare con aquella de un vistazo.
//
// El backend sigue siendo la autoridad: si la tabla quedara atrás, el 409
// `transicion_invalida` llega a la pantalla como mensaje claro, no se calla.
// La prueba de al lado fija la tabla del backend.
import type { AlertAction, AlertStatus } from "@/app/lib/alertas/vocabulary";

const ACTIONS_BY_STATUS: Readonly<Record<AlertStatus, readonly AlertAction[]>> = {
  new: ["acknowledge", "dismiss"],
  acknowledged: ["followUp", "dismiss"],
  tracking: ["followUp", "resolve", "dismiss"],
  resolved: ["reopen"],
  dismissed: ["reopen"],
};

export function availableActions(status: AlertStatus): readonly AlertAction[] {
  return ACTIONS_BY_STATUS[status];
}
