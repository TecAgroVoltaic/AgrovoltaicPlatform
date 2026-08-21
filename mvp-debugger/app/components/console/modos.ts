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
 * Hay un solo eje, y de él salen los dos nombres: **si el agente puede ver la
 * medición del sensor**. Los identificadores son idénticos a los de
 * `agent.MODOS` en el servicio, y las etiquetas se escriben acá una sola vez.
 *
 * Sobre por qué «medición visible/oculta» y no «con la respuesta / a ciegas»,
 * que fue el par anterior: aquel era informal para una vista que se muestra
 * fuera del equipo, y «a ciegas» sugiere que falta el dato. La medición existe
 * siempre; lo único que cambia es si el agente la ve.
 */
export const MODO = {
  medicion_visible: {
    id: "medicion_visible",
    etiqueta: "Medición visible",
    /** Qué hace el agente en este modo, en un verbo. Va en el botón. */
    verbo: "Evaluar",
    gerundio: "Evaluando…",
    ayuda: "El agente VE lo que midió el sensor y lo juzga. Sirve para evaluar el "
         + "método, no para demostrar que predice.",
  },
  medicion_oculta: {
    id: "medicion_oculta",
    etiqueta: "Medición oculta",
    verbo: "Predecir",
    gerundio: "Prediciendo…",
    ayuda: "El agente NO ve lo que midió el sensor: el servicio le quita `backtest` "
         + "del juego de herramientas. La consola consulta el sensor después, ya con "
         + "el pronóstico del agente en la mano.",
  },
} as const;

export type IdModo = keyof typeof MODO;

export const MEDICION_VISIBLE: IdModo = "medicion_visible";
export const MEDICION_OCULTA: IdModo = "medicion_oculta";

/**
 * Etiqueta legible de un modo que llega del servicio. Tolera un id desconocido
 * (el mapa de arquitectura se dibuja con lo que el servicio publique, no con lo
 * que la consola cree saber) devolviéndolo sin guiones bajos.
 */
export function etiquetaModo(id: string): string {
  return (MODO as Record<string, { etiqueta: string }>)[id]?.etiqueta
      ?? id.replace(/_/g, " ");
}
