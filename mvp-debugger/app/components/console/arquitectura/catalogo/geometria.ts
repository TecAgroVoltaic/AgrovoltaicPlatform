import type { Ficha } from "./ficha";

// ── Geometría del lienzo ───────────────────────────────────────────────────
export const LIENZO = { w: 1140, margenInferior: 34 };
export const COL = { entrada: 16, puerta: 200, cerebro: 316, tool: 596, dato: 890 };
export const ANCHO = { entrada: 168, puerta: 96, cerebro: 232, tool: 246, dato: 234 };
/** Alto, separación y arranque de la pila de herramientas. */
export const TOOL = { h: 64, gap: 14, y0: 76, entreGrupos: 82, encabezado: 20 };

export type Grupo = "entrada" | "puerta" | "cerebro" | "servidor" | "dato";

export type NodoFijo = {
  id: string;
  grupo: Grupo;
  x: number; y: number; w: number; h: number;
  titulo: string;
  sub: string;
  ficha: Ficha;
};
