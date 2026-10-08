#!/usr/bin/env node
/**
 * Verificación de las vistas SIN navegador.
 *
 * Por qué existe: la extensión de Chrome que daría control del navegador no
 * conecta, así que no hay forma de mirar una vista renderizada. Sin esto, todo el
 * trabajo de UI se hace a ciegas, y eso ya dejó defectos que llegaron hasta la
 * pantalla del usuario.
 *
 * Qué hace: compila los componentes con `tsc` a un árbol aparte y los renderiza de
 * verdad con `react-dom/server`. No es un mock: es el mismo componente con los
 * mismos datos. Lo que se afirma no es "compila", sino PROPIEDADES DEL RESULTADO.
 *
 * Qué vale la pena afirmar: invariantes de diseño (que no vuelva el vocabulario
 * viejo, que no queden coordenadas absolutas, presupuestos de contenido,
 * relaciones estructurales). Lo que NO sirve: comparar el HTML entero contra un
 * snapshot, que se rompe con cada cambio de estilo y no dice nada.
 *
 * Cada sección vive en `scripts/verificar/`; este archivo solo las corre en orden.
 *
 *   node scripts/verificar-vistas.mjs
 */
import { compilar, limpiar, redirigirModulos } from "./verificar/entorno.mjs";
import { informar } from "./verificar/registro.mjs";
import { verificarCalidad } from "./verificar/calidad.mjs";
import { verificarConsola } from "./verificar/consola.mjs";
import { verificarApagado } from "./verificar/apagado.mjs";
import { verificarArquitecturaRutas } from "./verificar/arquitecturaRutas.mjs";
import { verificarArquitecturaLienzo } from "./verificar/arquitecturaLienzo.mjs";
import { verificarDocsCriterios } from "./verificar/docsCriterios.mjs";
import { verificarChat } from "./verificar/chat.mjs";
import { verificarRendimientoGrano } from "./verificar/rendimientoGrano.mjs";
import { verificarRegresion } from "./verificar/regresion.mjs";
import { verificarHuecos } from "./verificar/huecos.mjs";

const SECCIONES = [
  verificarCalidad,
  verificarConsola,
  verificarApagado,
  verificarArquitecturaRutas,
  verificarArquitecturaLienzo,
  verificarDocsCriterios,
  verificarChat,
  verificarRendimientoGrano,
  verificarRegresion,
  verificarHuecos,
];

compilar();
redirigirModulos();
for (const seccion of SECCIONES) seccion();
limpiar();
process.exit(informar());
