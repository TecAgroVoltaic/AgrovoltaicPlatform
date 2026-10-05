"use client";
// ¿La barra lateral de /consola está en su forma de cajón?
//
// Por qué esto vive en JS y no solo en CSS: el plegado de la barra lo deciden
// LAS DOS MITADES. El CSS esconde lo textual con `.side.compacta`, pero el texto
// de los botones de agente lo elige el componente (nombre completo o inicial), y
// eso ningún `display:none` lo puede arreglar. Mientras cada mitad decidiera por
// su lado, en un teléfono el menú quedaba con iconos mudos y el selector en
// «H»/«P». Con este enganche la condición se evalúa UNA vez y las dos mitades
// leen el mismo resultado.
import { useEffect, useState } from "react";

/**
 * Ancho máximo en el que la barra lateral se dibuja como cajón.
 *
 * El número está escrito dos veces, acá y en la media query de `globals.css`, y
 * no hay forma de compartirlo: una media query no se puede leer desde JS sin
 * volver a escribirla. `barraEnCajon.test.ts` compara los dos y falla si se
 * separan, que es exactamente cómo nació el defecto que esto arregla.
 */
export const ANCHO_MAXIMO_DE_CAJON_PX = 900;

/**
 * @returns `true` cuando la ventana está en el escalón del cajón. Arranca en
 * `false` para coincidir con lo que pinta el servidor (que no tiene ventana):
 * el valor real llega al montar, y el cajón cerrado no se ve, así que ese primer
 * cuadro no muestra nada fuera de lugar.
 */
export function useBarraEnCajon(): boolean {
  const [enCajon, setEnCajon] = useState(false);

  useEffect(() => {
    const consulta = matchMedia(`(max-width: ${ANCHO_MAXIMO_DE_CAJON_PX}px)`);
    const sincronizar = () => setEnCajon(consulta.matches);
    sincronizar();
    // Girar el teléfono cruza el umbral sin recargar nada: sin escuchar el
    // cambio, la barra se queda en la forma del arranque.
    consulta.addEventListener("change", sincronizar);
    return () => consulta.removeEventListener("change", sincronizar);
  }, []);

  return enCajon;
}
