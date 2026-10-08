// El rango vive en la URL (`?desde=&hasta=&granularidad=`), no en un estado de
// React. Así una pantalla se comparte por chat tal cual se está mirando, el
// navegador la puede cachear, y un Server Component puede leerla sin hidratar.
//
// Los nombres de los parámetros van en español porque son parte del contrato
// público (URL + backend); los identificadores, en inglés. La frontera es este
// módulo: `urlRange/` lee y escribe, este archivo es su barril.
export {
  RANGE_PARAM,
  readerFromRecord,
  type ParamEntries,
  type ParamReader,
} from "@/app/lib/analitica/urlRange/params";
export {
  parseRangeParams,
  type RangeParse,
  type RangeProblem,
  type RangeProblemCode,
} from "@/app/lib/analitica/urlRange/parse";
export { rangeToParams, rangeToQuery } from "@/app/lib/analitica/urlRange/write";
