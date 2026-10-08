// Dónde va cada cosa en el lienzo del Histórico: la pila de herramientas por
// familia, el panel de datos alineado a cada una y las aristas.
import type { Ficha } from "../catalogo";
import {
  ANCHO_H, CEREBRO_H, COL_H, HERRAMIENTAS_HISTORICO, LIENZO_H, NODOS_FIJOS_H, TOOL_H,
} from "../catalogoHistorico";
import { familiasOrdenadas, type HerramientaHist, type MapaHistorico } from "../mapaHistorico";
import { curva } from "../lienzo/curva";

// Puerto de salida del modelo y de entrada de la puerta de acceso.
const PUERTO_CEREBRO = { x: CEREBRO_H.x + CEREBRO_H.w, y: CEREBRO_H.y + 125 };
const PUERTO_PUERTA = { x: COL_H.puerta, y: 182 };
// Alto del panel de datos de cada familia. Se centra contra su grupo.
export const PANEL = { h: 168, gapBarrido: 40, altoBarrido: 96 };

export type Item = { h: HerramientaHist; ficha?: Ficha; y: number; centro: number };
export type Grupo = {
  familia: string; yEncabezado: number; items: Item[];
  /** Dónde va a leer esta familia: el panel de datos alineado a su altura. */
  panel: { y: number; puerto: { x: number; y: number } };
};

/** Apila las herramientas por familia y alinea el panel de datos de cada una. */
export function disponer(mapa: MapaHistorico): { grupos: Grupo[]; alto: number } {
  const porNombre = new Map(mapa.herramientas.map((h) => [h.nombre, h]));
  const grupos: Grupo[] = [];
  let y = TOOL_H.y0;

  for (const [familia, fam] of familiasOrdenadas(mapa)) {
    const tools = fam.herramientas.filter((n) => porNombre.has(n)).map((n) => porNombre.get(n)!);
    if (!tools.length) continue;
    const items = tools.map((h, i) => {
      const top = y + i * (TOOL_H.h + TOOL_H.gap);
      return { h, ficha: HERRAMIENTAS_HISTORICO[h.nombre], y: top, centro: top + TOOL_H.h / 2 };
    });
    const alto = tools.length * (TOOL_H.h + TOOL_H.gap) - TOOL_H.gap;
    // El panel se centra contra su grupo: la alineación ES el mensaje (esta
    // familia lee de acá), así que no puede quedar a ojo.
    const panelY = y + Math.max(0, (alto - PANEL.h) / 2);
    grupos.push({
      familia, yEncabezado: y - TOOL_H.encabezado, items,
      panel: { y: panelY, puerto: { x: COL_H.dato, y: panelY + PANEL.h / 2 } },
    });
    y += alto + TOOL_H.entreGrupos;
  }

  const ultimo = grupos.at(-1);
  const fondoTools = ultimo ? ultimo.items.at(-1)!.y + TOOL_H.h : TOOL_H.y0;
  const fondoBarrido = ultimo
    ? ultimo.panel.y + PANEL.h + PANEL.gapBarrido + PANEL.altoBarrido
    : 0;
  return { grupos, alto: Math.max(fondoTools, fondoBarrido) + LIENZO_H.margenInferior };
}

export type AristaHist = { d: string; clase?: string };

/** Las aristas: entradas a la puerta, la puerta al modelo y cada herramienta a su panel. */
export function aristasDe(grupos: Grupo[]): AristaHist[] {
  const aristas: AristaHist[] = [];
  for (const n of NODOS_FIJOS_H.filter((n) => n.grupo === "entrada")) {
    aristas.push({ d: curva(n.x + n.w, n.y + n.h / 2, PUERTO_PUERTA.x, PUERTO_PUERTA.y) });
  }
  aristas.push({
    d: curva(COL_H.puerta + ANCHO_H.puerta, PUERTO_PUERTA.y, CEREBRO_H.x, PUERTO_CEREBRO.y),
  });
  for (const g of grupos) {
    for (const it of g.items) {
      aristas.push({ d: curva(PUERTO_CEREBRO.x, PUERTO_CEREBRO.y, COL_H.tool, it.centro) });
      aristas.push({
        d: curva(COL_H.tool + ANCHO_H.tool, it.centro, g.panel.puerto.x, g.panel.puerto.y),
      });
    }
  }
  return aristas;
}
