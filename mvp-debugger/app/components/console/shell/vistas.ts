import type { ComponentType } from "react";
import {
  IconoCalidad, IconoCosto, IconoDatos, IconoGrafo,
  IconoPrediccion, IconoReconciliar, IconoRendimiento, IconoSalud,
} from "@/app/components/Iconos";

export type View = "recon" | "pred" | "arq" | "calidad" | "datos" | "perf" | "costo" | "salud";
export type Icono = ComponentType<{ size?: number }>;

// DOS AGENTES. No hay más, y estos son sus nombres.
export type Agente = { id: string; nombre: string; inicial: string; sub: string };
export const AGENTES: Agente[] = [
  { id: "historico",  nombre: "Agente Histórico",  inicial: "H",
    sub: "qué pasó y si el dato sirve" },
  { id: "predictivo", nombre: "Agente Predictivo", inicial: "P",
    sub: "humedad e irradiancia" },
];

// La navegación tiene DOS mitades y se arma sola.
//
// Arriba, las vistas DEL AGENTE: cambian al cambiar de agente porque hablan de
// ese agente. «Arquitectura» aparece en las dos y NO es la misma vista con otros
// datos: cada agente tiene su propia pantalla porque no están organizados igual
// (el Predictivo por modos, el Histórico por familias). `ArqView` despacha.
//
// Abajo, las FIJAS: se ven siempre, con cualquier agente, porque no son de
// ninguno. La base de datos es una sola, el costo se mira junto y la salud del
// sistema es del sistema.
export const VISTAS_AGENTE: Record<string, [View, string, Icono][]> = {
  historico: [
    ["calidad", "Calidad de datos", IconoCalidad],
    ["recon", "Reconciliación", IconoReconciliar],
    ["perf", "Rendimiento", IconoRendimiento],
    ["arq", "Arquitectura del agente", IconoGrafo],
  ],
  predictivo: [
    ["pred", "Predicción vs Real", IconoPrediccion],
    ["arq", "Arquitectura del agente", IconoGrafo],
  ],
};
export const VISTAS_FIJAS: [View, string, Icono][] = [
  ["datos", "Base de datos", IconoDatos],
  ["costo", "Costo y uso", IconoCosto],
  ["salud", "Salud del sistema", IconoSalud],
];

export const LABEL = Object.fromEntries(
  [...Object.values(VISTAS_AGENTE).flat(), ...VISTAS_FIJAS].map(([v, l]) => [v, l]),
) as Record<View, string>;

/** ¿A qué agente pertenece la vista? undefined = es fija (de ninguno). */
export function agenteDe(v: View): string | undefined {
  return Object.keys(VISTAS_AGENTE).find((a) => VISTAS_AGENTE[a].some(([x]) => x === v));
}
