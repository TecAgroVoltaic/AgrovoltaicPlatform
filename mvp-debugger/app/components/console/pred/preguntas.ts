import { etiqueta, SEGUNDOS } from "./catalogo";

type Momento = { vari: string; fecha: string; momento: string; bucket: string };

const nombreVariable = (vari: string) => (vari === "irradiancia" ? "irradiancia" : "humedad de suelo");

/**
 * Al agente se le manda la PREGUNTA, nunca los números: llama a su herramienta
 * con la hora exacta y las cifras salen de ahí. Si se los pasáramos en el
 * prompt sería un redactor de datos que no verificó.
 *
 * Se le pide JUSTIFICACIÓN y CRÍTICA, no descripción: las cifras ya están en
 * las fichas de al lado, repetirlas no aporta nada. Lo único que el agente
 * puede agregar es por qué salió ese número, cuánto vale y qué lo limitó.
 */
export const preguntaVisible = ({ vari, fecha, momento, bucket }: Momento) =>
  `Analizá tu pronóstico de ${nombreVariable(vari)} `
  + `del ${fecha} a las ${momento} con ${etiqueta(bucket)} de anticipación `
  + `(usá bucket "${bucket}"). No describas las cifras, que ya están a la vista: `
  + `justificá por qué te dio ese valor, juzgá con honestidad qué tan bueno fue `
  + `(en escala, no en impresión) y decí qué limitación tuya lo explica. `
  + `Si te equivocaste, empezá por ahí. 3 o 4 frases, sin tablas ni listas.`;

/**
 * Con la medición oculta se le pide COMPROMETERSE, no explicar. El horizonte en
 * segundos es explícito para que no tenga que deducirlo, y se le prohíbe pedir
 * el resultado: aunque la herramienta no exista, el intento ensuciaría la traza.
 */
export const preguntaOculta = ({ vari, fecha, momento, bucket }: Momento) =>
  `Predecí la ${nombreVariable(vari)} `
  + `del ${fecha} a las ${momento} (hora local), con ${etiqueta(bucket)} de anticipación `
  + `(${SEGUNDOS[bucket]} segundos). Diagnosticá primero, medí el riesgo de nubes, `
  + `y recién ahí comprometete con un número y su banda. Declará tu confianza y decí `
  + `de qué lado podría fallar. No vas a poder ver lo que midió el sensor: no lo pidas. `
  + `3 o 4 frases, sin tablas ni listas.`;
