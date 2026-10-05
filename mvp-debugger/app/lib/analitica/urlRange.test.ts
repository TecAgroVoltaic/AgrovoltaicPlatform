// El rango de la URL es el parámetro del que cuelga TODO el análisis. Si se lee
// mal, cada número de la pantalla habla de otro período sin que nada falle.
import { describe, expect, it } from "vitest";

import { DEFAULT_RANGE } from "@/app/lib/analitica/coverage";
import { rangeDays } from "@/app/lib/analitica/dateRange";
import {
  parseRangeParams,
  rangeToQuery,
  readerFromRecord,
  type RangeProblemCode,
} from "@/app/lib/analitica/urlRange";

const reader = (query: string) => new URLSearchParams(query);

function problemCodes(parse: ReturnType<typeof parseRangeParams>): RangeProblemCode[] {
  return parse.outcome === "fallback" ? parse.problems.map((problem) => problem.code) : [];
}

describe("parseRangeParams", () => {
  it("acepta un rango completo y válido tal como viene", () => {
    // Given una URL con las dos fechas y un grano conocido
    const params = reader("desde=2026-05-01&hasta=2026-06-01&granularidad=semana");

    // When se interpreta
    const parse = parseRangeParams(params);

    // Then se usa ese rango, sin tocarlo
    expect(parse.outcome).toBe("parsed");
    expect(parse.range).toEqual({
      from: "2026-05-01",
      toExclusive: "2026-06-01",
      granularity: "week",
    });
  });

  it("sin parámetros abre el rango por defecto y no lo trata como un error", () => {
    // Given una primera visita, sin rango en la URL
    const params = reader("");

    // When se interpreta
    const parse = parseRangeParams(params);

    // Then se abre el rango por defecto y no hay nada que avisar
    expect(parse.outcome).toBe("default");
    expect(parse.range).toEqual(DEFAULT_RANGE);
  });

  it("avisa cuando el fin no es posterior al inicio, en vez de invertirlo", () => {
    // Given un rango al revés (el fin es EXCLUSIVO: iguales tampoco vale)
    const invertido = parseRangeParams(reader("desde=2026-06-01&hasta=2026-05-01"));
    const iguales = parseRangeParams(reader("desde=2026-05-01&hasta=2026-05-01"));

    // When / Then los dos caen al rango por defecto y lo dicen
    expect(problemCodes(invertido)).toEqual(["END_NOT_AFTER_START"]);
    expect(problemCodes(iguales)).toEqual(["END_NOT_AFTER_START"]);
    expect(invertido.range).toEqual(DEFAULT_RANGE);
  });

  it("un solo día es un rango válido, porque el fin es exclusivo", () => {
    // Given el mínimo rango que tiene sentido pedir
    const parse = parseRangeParams(reader("desde=2026-05-01&hasta=2026-05-02"));

    // When / Then entra, y cubre exactamente un día
    expect(parse.outcome).toBe("parsed");
    expect(rangeDays(parse.range)).toBe(1);
  });

  it("rechaza fechas con formato roto y fechas que no existen en el calendario", () => {
    // Given una fecha mal escrita y una que parece bien pero no existe
    const formato = parseRangeParams(reader("desde=01-05-2026&hasta=2026-06-01"));
    const inexistente = parseRangeParams(reader("desde=2026-02-30&hasta=2026-06-01"));

    // When / Then las dos se reportan como fecha inválida
    expect(problemCodes(formato)).toEqual(["INVALID_DATE"]);
    expect(problemCodes(inexistente)).toEqual(["INVALID_DATE"]);
  });

  it("con una sola fecha no adivina la otra", () => {
    // Given media URL (típico de un copiar y pegar cortado)
    const parse = parseRangeParams(reader("desde=2026-05-01"));

    // When / Then se avisa en vez de inventar el otro extremo
    expect(problemCodes(parse)).toEqual(["INCOMPLETE_RANGE"]);
  });

  it("un grano desconocido no tumba el rango: se avisa y se usa el de por defecto", () => {
    // Given fechas buenas y un grano que el backend no acepta
    const parse = parseRangeParams(reader("desde=2026-05-01&hasta=2026-06-01&granularidad=quincena"));

    // When / Then el problema se reporta y la pantalla sigue siendo utilizable
    expect(problemCodes(parse)).toEqual(["INVALID_GRANULARITY"]);
    expect(parse.range.granularity).toBe(DEFAULT_RANGE.granularity);
  });

  it("acumula los problemas en vez de quedarse con el primero", () => {
    // Given una URL con dos cosas mal a la vez
    const parse = parseRangeParams(reader("desde=nada&hasta=tampoco&granularidad=quincena"));

    // When / Then se reportan las tres, que es lo que hay que arreglar
    expect(problemCodes(parse).sort()).toEqual(
      ["INVALID_DATE", "INVALID_DATE", "INVALID_GRANULARITY"].sort(),
    );
  });

  it("lee también el searchParams de una página de servidor", () => {
    // Given el objeto que Next entrega a un Server Component, con un repetido
    const params = readerFromRecord({
      desde: ["2026-05-01", "2026-01-01"],
      hasta: "2026-06-01",
    });

    // When se interpreta
    const parse = parseRangeParams(params);

    // Then gana el primer valor y el rango es válido
    expect(parse.outcome).toBe("parsed");
    expect(parse.range.from).toBe("2026-05-01");
  });
});

const RANGE = { from: "2025-09-05", toExclusive: "2026-06-02", granularity: "month" } as const;

describe("rangeToQuery", () => {
  it("conserva los parámetros ajenos y reescribe los del rango", () => {
    // Given una URL con la variable elegida, un rango viejo y un vacío
    const current = reader("variable=albedo&desde=2024-11-10&hasta=2025-01-01&foco=");

    // When se mueve el rango sobre esa query
    const query = reader(rangeToQuery(RANGE, current).slice(1));

    // Then la variable sobrevive (el enlace sigue mostrando lo que se mira), el
    // rango se reescribe sin duplicarse, y el parámetro vacío no ensucia
    expect(query.get("variable")).toBe("albedo");
    expect(query.getAll("desde")).toEqual([RANGE.from]);
    expect(query.get("hasta")).toBe(RANGE.toExclusive);
    expect(query.has("foco")).toBe(false);
  });

  it("sin query previa produce solo el rango, como antes", () => {
    // Given ninguna query de partida
    // When se serializa el rango
    // Then no aparece nada más: no se inventan parámetros
    expect([...reader(rangeToQuery(RANGE).slice(1)).keys()].sort()).toEqual([
      "desde",
      "granularidad",
      "hasta",
    ]);
  });

  it("vuelve a producir una URL que se interpreta igual (ida y vuelta)", () => {
    // Given un rango cualquiera
    // When se serializa y se vuelve a leer
    const parse = parseRangeParams(reader(rangeToQuery(RANGE).slice(1)));

    // Then no se perdió ni se cambió nada por el camino
    expect(parse.range).toEqual(RANGE);
  });
});
