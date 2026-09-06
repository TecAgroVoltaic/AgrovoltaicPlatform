// Las secciones del sistema de evaluación de datos, en un solo sitio: de acá
// salen la barra lateral y las cabeceras de cada página. Una lista repartida
// entre la navegación y las páginas se desincroniza sola.
import type { ComponentType } from "react";

import {
  IconoCalidad,
  IconoDescarga,
  IconoEstadistica,
  IconoReconciliar,
  IconoSerie,
  IconoTablero,
} from "@/app/components/Iconos";

export type AnalysisSection = {
  /** Ruta exacta. Es también la clave: no hay dos secciones con la misma. */
  readonly path: string;
  readonly label: string;
  /** Qué se responde en esa sección, para la cabecera de la página. */
  readonly description: string;
  readonly Icon: ComponentType<{ size?: number }>;
};

export const ANALYSIS_SECTIONS: readonly AnalysisSection[] = [
  {
    path: "/",
    label: "Tablero",
    description:
      "Los indicadores del período: energía producida, rendimiento específico y frescura del dato.",
    Icon: IconoTablero,
  },
  {
    path: "/series",
    label: "Series",
    description:
      "La evolución de cada variable en el tiempo, con su tendencia, su media móvil y su banda de desviación.",
    Icon: IconoSerie,
  },
  {
    path: "/estadistica",
    label: "Estadística",
    description:
      "Distribuciones por mes y por sensor, y la relación entre irradiancia y potencia.",
    Icon: IconoEstadistica,
  },
  {
    path: "/calidad",
    label: "Calidad",
    description:
      "Completitud, validez física, consistencia temporal y anomalías estadísticas del período.",
    Icon: IconoCalidad,
  },
  {
    path: "/comparativa",
    label: "Comparativa",
    description:
      "El arreglo Inclinado (PV1) contra el Vertical (PV2): energía, rendimiento y estacionalidad.",
    Icon: IconoReconciliar,
  },
  {
    path: "/descargas",
    label: "Descargas",
    description:
      "Los datos del período en .csv, .dat o .mat: se elige la tabla, las columnas y el formato.",
    Icon: IconoDescarga,
  },
];

export function findSection(path: string): AnalysisSection | undefined {
  return ANALYSIS_SECTIONS.find((section) => section.path === path);
}
