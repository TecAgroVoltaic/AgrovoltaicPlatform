"use client";
// Carga del mapa del Agente Histórico, en un solo lugar.
//
// Lo usan DOS pantallas: el lienzo de arquitectura de la consola y la sección del
// Histórico en la documentación, que muestra los umbrales y los tipos de hallazgo.
// Que compartan esta función no es ahorro de líneas: es que las dos digan lo
// mismo. Una documentación con los umbrales transcritos a mano envejece sin que
// nadie se entere, y entonces el documento y el agente discrepan sobre el número
// que decide si un dato sirve, que es exactamente lo que no puede pasar.
import { useEffect, useState } from "react";

import { jget } from "@/app/lib/client";
import { esMapaHistorico, type MapaHistorico } from "./mapaHistorico";
import { RESPALDO_HISTORICO } from "./respaldoHistorico";

const RUTA = "/api/historico/arquitectura";

export type EstadoMapa = {
  mapa: MapaHistorico | null;
  /** true si lo que se está mostrando salió de la copia y no del servicio. */
  esRespaldo: boolean;
  cargando: boolean;
};

export function useMapaHistorico(): EstadoMapa {
  const [estado, setEstado] = useState<EstadoMapa>({
    mapa: null, esRespaldo: false, cargando: true,
  });

  useEffect(() => {
    let vivo = true;
    jget<MapaHistorico>(RUTA).then((r) => {
      if (!vivo) return;
      // El mapa describe la FORMA del agente, no datos medidos: no cambia con la
      // hora. Si el servicio no está (el servidor se apaga de noche), se dibuja la
      // copia. Pero solo si de verdad es el mapa de ESTE agente: `esMapaHistorico`
      // está para que un JSON de otra forma nunca se cuele con este rótulo.
      if (esMapaHistorico(r.data)) {
        setEstado({ mapa: r.data, esRespaldo: false, cargando: false });
      } else {
        setEstado({ mapa: RESPALDO_HISTORICO, esRespaldo: true, cargando: false });
      }
    });
    return () => { vivo = false; };
  }, []);

  return estado;
}
