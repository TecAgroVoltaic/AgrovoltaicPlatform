// El mensaje que manda «Armar archivo» (contrato §4.2). Es TEXTO del usuario y
// no una llamada directa: el backend tiene un solo camino para armar archivos,
// y el agente negocia rango e intervalo en el turno siguiente.

/** «Junto» = un archivo con todo; «Por fuente» = uno por cada fuente. */
export type FileGrouping = "together" | "perSource";

export type ChosenVariable = { readonly id: string; readonly etiqueta: string };

const GROUPING_PHRASE: Readonly<Record<FileGrouping, string>> = {
  together: "un archivo junto",
  perSource: "un archivo por fuente",
};

/** Las variables van en el orden en que se eligieron, una por renglón. */
export function selectorMessage(variables: readonly ChosenVariable[], grouping: FileGrouping): string {
  const lines = variables.map((variable, index) => `${index + 1}. ${variable.etiqueta} [${variable.id}]`);
  return [`Armá ${GROUPING_PHRASE[grouping]} con estas variables, en este orden:`, ...lines].join("\n");
}
