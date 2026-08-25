// Que agentes expone la consola. Fuente UNICA de verdad del bloqueo del agente
// historico (Agente Histórico): esta semana la demo es solo el agente predictivo.
//
// Por que un flag y no borrar codigo: el bloqueo es temporal. Volver a mostrar
// el analizador tiene que ser una variable de entorno, no un revert.
//
// Por que se lee SOLO del lado servidor (route handlers + server components) y
// baja como prop a los componentes de cliente: una NEXT_PUBLIC_* quedaria
// horneada en el bundle del browser, y entonces habria dos fuentes de verdad
// (la del build y la del proceso) que pueden discrepar tras un redeploy.
//
//   AGENTE_ANALIZADOR=on|1|true   -> visible otra vez (vistas + chat + proxy)
//   ausente o cualquier otro valor -> BLOQUEADO (default)
export const ENV_HISTORICO = "AGENTE_ANALIZADOR";

/** ¿Esta habilitado el agente analizador (historico) en esta consola? */
export function historicoActivo(): boolean {
  const v = (process.env[ENV_HISTORICO] || "").trim().toLowerCase();
  return v === "on" || v === "1" || v === "true";
}

/** Mensaje unico para cuando alguien intenta usarlo estando bloqueado. */
export const MSG_BLOQUEADO =
  `El agente analizador (histórico) está desactivado en esta consola. ` +
  `Definí ${ENV_HISTORICO}=on para volver a habilitarlo.`;
