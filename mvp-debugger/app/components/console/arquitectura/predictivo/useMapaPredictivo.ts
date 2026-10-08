"use client";
import { useEffect, useState } from "react";

import { jget } from "@/app/lib/client";
import { MEDICION_VISIBLE } from "@/app/components/console/modos";
import type { Mapa } from "../mapa";
import { MAPA_RESPALDO } from "../mapaRespaldo";

const RUTA = "/api/predictivo/arquitectura";

/** El mapa del Predictivo (o su copia guardada) y el modo elegido en él. */
export function useMapaPredictivo() {
  const [mapa, setMapa] = useState<Mapa | null>(null);
  // Si el mapa que se esta viendo salio de la copia y no del servicio, hay que
  // decirlo: una copia y la realidad no valen lo mismo.
  const [esRespaldo, setEsRespaldo] = useState(false);
  const [modo, setModo] = useState<string>(MEDICION_VISIBLE);

  useEffect(() => {
    let vivo = true;
    jget<Mapa>(RUTA).then((r) => {
      if (!vivo) return;
      // El mapa describe la FORMA del agente, no datos medidos: cambia con el
      // codigo, no con la hora. Si el servicio no esta (apagado de noche o el
      // fin de semana), se dibuja la copia en vez de dejar la pantalla vacia.
      // `modos` es la firma del mapa del Predictivo. Sirve de doble chequeo: si
      // llegara un JSON de otra forma, no se dibuja como si fuera este agente.
      const vivo_ok = r.ok && !!r.data?.modos;
      const usable = vivo_ok ? r.data : (MAPA_RESPALDO as unknown as Mapa);
      setEsRespaldo(!vivo_ok);
      setMapa(usable);
      // El modo inicial es el primero que publica el servicio, no uno fijo.
      setModo(Object.keys(usable.modos ?? {})[0] || MEDICION_VISIBLE);
    });
    return () => { vivo = false; };
  }, []);

  return { mapa, esRespaldo, modo, setModo };
}
