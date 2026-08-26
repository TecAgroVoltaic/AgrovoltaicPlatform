// Qué agentes expone la consola. Fuente ÚNICA de verdad del interruptor del chat
// del Agente Histórico.
//
// El valor por defecto es ENCENDIDO, y el cambio tiene una razón concreta. Antes
// era apagado, porque el Histórico contaba lo que gastaba en el LLM pero no lo
// topaba, y esconder su chat era lo único que lo contenía. Esconder un botón no
// es un límite: la puerta seguía abierta para cualquiera con la cookie de sesión
// y un `curl`. Ahora el freno vive en el servicio (`historico/limites.py`: ritmo
// por identidad y presupuesto diario), que es donde se gasta la plata, así que el
// chat puede estar siempre a la vista.
//
// Que además fuera apagado por defecto tenía un costo que ya se pagó: la variable
// se llamaba `AGENTE_ANALIZADOR` de un renombre a medias, el entorno tenía
// `AGENTE_HISTORICO`, y el chat desapareció sin que nada lo dijera. Un default
// encendido convierte ese tipo de error en «sigue funcionando» en vez de en una
// pantalla a la que le falta algo en silencio.
//
// Se lee SOLO del lado servidor (route handlers + server components) y baja como
// prop a los componentes de cliente: una NEXT_PUBLIC_* quedaría horneada en el
// bundle del browser, y entonces habría dos fuentes de verdad (la del build y la
// del proceso) que pueden discrepar tras un redeploy.
//
//   AGENTE_HISTORICO=off|0|false  -> chat del Histórico BLOQUEADO
//   cualquier otro valor, o ausente -> habilitado (default)
export const ENV_HISTORICO = "AGENTE_HISTORICO";

const APAGADO = new Set(["off", "0", "false", "no"]);

/** ¿Está habilitado el Q&A del Agente Histórico en esta consola? */
export function historicoActivo(): boolean {
  return !APAGADO.has((process.env[ENV_HISTORICO] || "").trim().toLowerCase());
}

/** Mensaje único para cuando alguien intenta usarlo estando bloqueado. */
export const MSG_BLOQUEADO =
  `El chat del Agente Histórico está desactivado en esta consola. ` +
  `Quitá ${ENV_HISTORICO}=off para volver a habilitarlo.`;
