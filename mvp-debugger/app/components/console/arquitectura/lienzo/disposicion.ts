// Dónde va cada cosa en el lienzo del Predictivo: la pila de herramientas por
// modo y las aristas que las unen al modelo y a la capa determinista.
import type { Ficha, Grupo as GrupoNodo } from "../catalogo";
import { ANCHO, CAPA, CEREBRO, COL, HERRAMIENTAS, LIENZO, NODOS_FIJOS, TOOL } from "../catalogo";
import { dia, type Cobertura, type Herramienta, type Mapa } from "../mapa";
import { curva } from "./curva";

// Puertos de salida/entrada de las aristas troncales.
const PUERTO_CEREBRO = { x: CEREBRO.x + CEREBRO.w, y: CEREBRO.y + 125 };
const PUERTO_PUERTA = { x: COL.puerta, y: 185 };
// Fondo de todo lo que tiene posición fija. El lienzo termina justo debajo del
// contenido: sin esto quedaba una franja muerta al pie.
const FONDO_FIJO = Math.max(
  ...NODOS_FIJOS.map((n) => n.y + n.h),
  CEREBRO.y + CEREBRO.h,
  CAPA.y + CAPA.h,
);

export const ROTULO: Record<GrupoNodo, string> = {
  entrada: "entrada · consola",
  puerta: "puerta de acceso",
  cerebro: "el modelo",
  servidor: "herramienta de servidor",
  dato: "fuente · solo lectura",
};

export type Item = { h: Herramienta; ficha?: Ficha; y: number; centro: number; activa: boolean };
export type Grupo = { modo: string; yEncabezado: number; items: Item[] };

/**
 * Cobertura real de cada variable, para la ficha del store. Sale del mapa que
 * publica el servicio, no del catálogo: unas fechas escritas a mano envejecen
 * sin que nadie se entere, que es justo lo que esta vista no puede permitirse.
 */
export function cobertura(datos: Record<string, Cobertura>): string[] {
  return Object.entries(datos).map(([variable, c]) =>
    c.error
      ? `**${variable}**: no se pudo leer el rango (${c.error}).`
      : `**${variable}**: ${(c.n ?? 0).toLocaleString("es-CR")} lecturas`
        + ` de ${dia(c.desde)} a ${dia(c.hasta)}, en ${c.unidad || "sin unidad"}.`);
}

/**
 * Apila las herramientas por modo, en el orden que publica el servicio.
 * Una tool que estuviera en dos modos se dibuja una sola vez, en el primero que
 * la lista: no se duplica el nodo.
 */
export function disponer(mapa: Mapa, modo: string): { grupos: Grupo[]; alto: number } {
  const porNombre = new Map(mapa.herramientas.map((h) => [h.nombre, h]));
  const ya = new Set<string>();
  const grupos: Grupo[] = [];
  let y = TOOL.y0;

  for (const [nombreModo, perfil] of Object.entries(mapa.modos)) {
    const tools = perfil.herramientas
      .filter((n) => !ya.has(n) && porNombre.has(n))
      .map((n) => { ya.add(n); return porNombre.get(n)!; });
    if (!tools.length) continue;
    grupos.push({
      modo: nombreModo,
      yEncabezado: y - TOOL.encabezado,
      items: tools.map((h, i) => {
        const top = y + i * (TOOL.h + TOOL.gap);
        return {
          h, ficha: HERRAMIENTAS[h.nombre], y: top, centro: top + TOOL.h / 2,
          activa: !!h.modos?.includes(modo),
        };
      }),
    });
    y += tools.length * (TOOL.h + TOOL.gap) - TOOL.gap + TOOL.entreGrupos;
  }

  const ultimo = grupos.at(-1)?.items.at(-1);
  const fondoTools = ultimo ? ultimo.y + TOOL.h : TOOL.y0;
  return { grupos, alto: Math.max(fondoTools, FONDO_FIJO) + LIENZO.margenInferior };
}

// Los dos troncos verticales: el modelo baja a la búsqueda web y la capa
// determinista baja al store.
const TRONCO_WEB = { x: 432, hasta: 344 };
const TRONCO_STORE = { x: 1007, desde: 474 };

export type Arista = { d: string; activa: boolean; clase?: string };

/** Las aristas del lienzo: entradas, troncal al modelo, cada herramienta y los troncos. */
export function aristasDe(grupos: Grupo[], webActiva: boolean): Arista[] {
  const aristas: Arista[] = [];
  for (const n of NODOS_FIJOS.filter((n) => n.grupo === "entrada")) {
    aristas.push({ d: curva(n.x + n.w, n.y + n.h / 2, PUERTO_PUERTA.x, PUERTO_PUERTA.y), activa: true });
  }
  aristas.push({ d: curva(COL.puerta + ANCHO.puerta, PUERTO_PUERTA.y, CEREBRO.x, PUERTO_CEREBRO.y), activa: true });
  for (const g of grupos) {
    for (const it of g.items) {
      aristas.push({
        d: curva(PUERTO_CEREBRO.x, PUERTO_CEREBRO.y, COL.tool, it.centro),
        activa: it.activa,
      });
      aristas.push({
        d: curva(COL.tool + ANCHO.tool, it.centro, CAPA.puerto.x, CAPA.puerto.y),
        activa: it.activa,
      });
    }
  }
  aristas.push({ d: `M ${TRONCO_WEB.x} ${CEREBRO.y + CEREBRO.h} L ${TRONCO_WEB.x} ${TRONCO_WEB.hasta}`, activa: webActiva, clase: "punteada" });
  aristas.push({ d: `M ${TRONCO_STORE.x} ${TRONCO_STORE.desde} L ${TRONCO_STORE.x} ${CAPA.y + CAPA.h}`, activa: true });
  return aristas;
}
