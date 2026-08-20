/**
 * EL VOCABULARIO DE LOS MODOS. Único lugar del frontend donde se escriben.
 *
 * Hubo un momento en que la misma cosa tenía cuatro nombres: el backend decía
 * `analisis` / `prediccion`, el chip decía «modo backtest» / «predicción a
 * ciegas», el botón decía «Analizar» / «Predecir a ciegas» y el código decía
 * `ciego`. Nadie podía saber cuáles eran lo mismo. Peor: «modo backtest» era
 * directamente falso, porque el endpoint `/backtest` dibuja el gráfico en LOS
 * DOS modos.
 *
 * Ahora hay un solo eje, y de él salen los dos nombres: **qué puede ver el
 * agente**. Los identificadores son idénticos a los de `agent.MODOS` en el
 * servicio, y las etiquetas se escriben acá una sola vez.
 */
export const MODO = {
  con_respuesta: {
    id: "con_respuesta",
    etiqueta: "con la respuesta",
    /** Qué hace el agente en este modo, en un verbo. Va en el botón. */
    verbo: "Juzgar con la respuesta",
    gerundio: "Juzgando…",
    ayuda: "El agente VE lo que midió el sensor y lo juzga. Sirve para evaluar el "
         + "método, no para demostrar que predice.",
  },
  a_ciegas: {
    id: "a_ciegas",
    etiqueta: "a ciegas",
    verbo: "Predecir a ciegas",
    gerundio: "Prediciendo…",
    ayuda: "El agente NO ve lo que midió el sensor: el servicio le quita `backtest` "
         + "del juego de herramientas. La consola lo consulta después, ya con la "
         + "respuesta del agente en la mano.",
  },
} as const;

export type IdModo = keyof typeof MODO;

export const CON_RESPUESTA: IdModo = "con_respuesta";
export const A_CIEGAS: IdModo = "a_ciegas";

/**
 * Etiqueta legible de un modo que llega del servicio. Tolera un id desconocido
 * (el mapa de arquitectura se dibuja con lo que el servicio publique, no con lo
 * que la consola cree saber) devolviéndolo sin guiones bajos.
 */
export function etiquetaModo(id: string): string {
  return (MODO as Record<string, { etiqueta: string }>)[id]?.etiqueta
      ?? id.replace(/_/g, " ");
}
