// Las secciones del modo avanzado, en un solo sitio: de acá salen la barra
// lateral y las cabeceras de cada página.
//
// Ruta, etiqueta y descripción vienen del catálogo (`secciones.json`), que es lo
// que también lee el agente: una descripción escrita dos veces se desincroniza
// sola. Este archivo solo agrega lo que es de la interfaz (ícono, indicador y
// tipo de cascarón) y el ORDEN de la barra lateral. `inicio` no está: es el chat
// del modo simple, que no vive en este cascarón.
import type { ComponentType } from "react";

import { AlertsNavBadge } from "@/app/components/analitica/alertas/AlertsNavBadge";
import {
  IconoAsistente,
  IconoCalidad,
  IconoCampana,
  IconoDescarga,
  IconoEstadistica,
  IconoFuentes,
  IconoReconciliar,
  IconoSerie,
  IconoTablero,
} from "@/app/components/Iconos";
import { findSectionEntry } from "@/app/lib/navegacion/catalog";

/** `full`: el cascarón pone la barra de rango, la barra superior del cajón y el
 *  pie. `bare`: la sección dibuja su propia cabecera a ancho completo y pone ella
 *  el botón del menú con `SectionMenuButton` (el Asistente, donde el rango viaja
 *  como contexto del hilo, y Alertas, que lleva período y «Evaluar ahora» en
 *  esa misma fila). */
export type SectionShell = "full" | "bare";

export type AnalysisSection = {
  readonly id: string;
  /** Ruta exacta. Es también la clave: no hay dos secciones con la misma. */
  readonly path: string;
  readonly label: string;
  /** Qué se responde en esa sección, para la cabecera de la página. */
  readonly description: string;
  readonly Icon: ComponentType<{ size?: number }>;
  /** Indicador opcional junto a la etiqueta del menú (p. ej. un contador). */
  readonly Badge?: ComponentType;
  readonly shell: SectionShell;
};

type SectionDecoration = Pick<AnalysisSection, "id" | "Icon" | "Badge" | "shell">;

const SIDEBAR: readonly SectionDecoration[] = [
  { id: "tablero", Icon: IconoTablero, shell: "full" },
  { id: "series", Icon: IconoSerie, shell: "full" },
  { id: "estadistica", Icon: IconoEstadistica, shell: "full" },
  { id: "calidad", Icon: IconoCalidad, shell: "full" },
  { id: "comparativa", Icon: IconoReconciliar, shell: "full" },
  { id: "descargas", Icon: IconoDescarga, shell: "full" },
  { id: "asistente", Icon: IconoAsistente, shell: "bare" },
  { id: "alertas", Icon: IconoCampana, Badge: AlertsNavBadge, shell: "bare" },
  { id: "fuentes", Icon: IconoFuentes, shell: "full" },
];

/** @throws Error al cargar el módulo si una sección decorada no está en el
 *  catálogo: falla el build, no la barra lateral en la mano de alguien. */
function decorate(decoration: SectionDecoration): AnalysisSection {
  const entry = findSectionEntry(decoration.id);
  if (!entry) throw new Error(`La sección «${decoration.id}» no está en secciones.json`);
  return { ...decoration, path: entry.ruta, label: entry.etiqueta, description: entry.descripcion };
}

export const ANALYSIS_SECTIONS: readonly AnalysisSection[] = SIDEBAR.map(decorate);

export function findSection(path: string): AnalysisSection | undefined {
  return ANALYSIS_SECTIONS.find((section) => section.path === path);
}

/** Sin sección conocida (p. ej. una ruta nueva) el cascarón va completo. */
export function isBareShell(path: string): boolean {
  return findSection(path)?.shell === "bare";
}
