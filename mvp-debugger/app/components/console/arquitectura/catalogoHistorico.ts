// Prosa de la arquitectura del Agente Histórico. El mismo reparto que su gemelo
// del Predictivo (`catalogo.ts`): el servicio aporta lo verificable (nombres,
// parámetros, umbrales, familias), este archivo aporta lo que ningún esquema
// puede decir, que es POR QUÉ existe cada pieza.
//
// Si acá falta una ficha, la vista dibuja la herramienta igual con su contrato y
// la marca «sin documentar». Si sobra una, la vista lo avisa. Nunca calla la
// diferencia: el valor de esta pantalla es que no puede mostrar un agente que no
// sea el que está corriendo.//
// Barril: las fichas de cada familia, la geometría del lienzo y las piezas fijas
// del relato viven en `catalogoHistorico/`.
import type { Ficha } from "./catalogo";
import { HERRAMIENTAS_ANALISIS } from "./catalogoHistorico/analisis";
import { HERRAMIENTAS_CALIDAD } from "./catalogoHistorico/calidad";

export const HERRAMIENTAS_HISTORICO: Record<string, Ficha> = {
  ...HERRAMIENTAS_ANALISIS,
  ...HERRAMIENTAS_CALIDAD,
};

export { LIENZO_H, COL_H, ANCHO_H, TOOL_H, NODOS_FIJOS_H, type NodoFijoH } from "./catalogoHistorico/lienzo";
export { FAMILIAS, CEREBRO_H, DESTINO, BARRIDO } from "./catalogoHistorico/piezas";
