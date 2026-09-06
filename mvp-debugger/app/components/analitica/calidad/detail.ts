// Lectura del `detalle` de un hallazgo, que es JSON libre: cada tipo mete sus
// propias claves y no hay una forma común que valga la pena fijar en el contrato.
//
// Se lee con `unknown` y narrowing, nunca con `as`: afirmarle al compilador que
// ahí hay una cadena es exactamente cómo un `undefined` termina impreso.
export type FindingDetail = Readonly<Record<string, unknown>>;

export function readText(detail: FindingDetail, key: string): string | null {
  const value = detail[key];
  return typeof value === "string" ? value : null;
}
