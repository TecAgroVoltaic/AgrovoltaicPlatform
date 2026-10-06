// Qué acciones ofrece la ficha según el estado (contrato §4.2, tabla de
// transiciones). Es una tabla y no una cadena de `if` para que se lea igual
// que el contrato y se compare con él de un vistazo.
//
// El backend sigue siendo la autoridad: si la tabla quedara atrás, el 409
// `transicion_invalida` llega a la pantalla como mensaje claro, no se calla.
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
