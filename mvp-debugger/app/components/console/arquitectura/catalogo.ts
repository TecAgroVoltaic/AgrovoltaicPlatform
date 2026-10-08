// Catálogo de la vista de arquitectura: la PROSA y la GEOMETRÍA.
//
// Reparto deliberado con el servicio:
//   * `/arquitectura` aporta lo verificable: nombres, parámetros, tipos,
//     rangos, obligatoriedad, en qué modo vive cada herramienta, los límites y
//     la cobertura de datos. Eso se deriva del código, así que no puede mentir.
//   * este archivo aporta lo que ningún esquema puede decir: POR QUÉ existe cada
//     pieza, qué límite es una decisión y no un detalle, y qué prueba la blinda.
//
// La consecuencia práctica: si alguien agrega una herramienta y no la documenta
// acá, la vista la dibuja igual (con su esquema y una marca «sin documentar»).
// Y si acá queda una ficha de algo que el servicio ya no expone, la vista lo
// avisa en vez de seguir mostrándola. Nunca puede aparecer una ficción callada.
//
// La prosa se escribe en markdown y se pinta con `renderMd` (lib/markdown.ts):
// escapa el HTML antes de formatear, así que no hay marcado suelto en el DOM.

// Cada pieza vive en `catalogo/`: la ficha, las herramientas, la geometría, los
// nodos fijos y el núcleo (cerebro, capa determinista y barrera).
export type { Ficha } from "./catalogo/ficha";
export { HERRAMIENTAS } from "./catalogo/herramientas";
export { ANCHO, COL, LIENZO, TOOL, type Grupo, type NodoFijo } from "./catalogo/geometria";
export { NODOS_FIJOS } from "./catalogo/nodosFijos";
export { BARRERA, CAPA, CEREBRO } from "./catalogo/nucleo";
