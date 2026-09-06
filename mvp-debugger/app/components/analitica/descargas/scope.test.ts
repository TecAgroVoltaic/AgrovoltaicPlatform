// Lo que protege esta prueba: los bordes de la cobertura.
//
// El `hasta` del backend es el último día CON dato (inclusive) y el de la
// aplicación es exclusivo. Ese desfase de un día es lo que decide si el último
// día se descarga o se pierde en silencio, así que se prueba en el borde exacto
// y no con rangos cómodos por el medio.
import { describe, expect, it } from "vitest";

import { relationScope, relationWindowLabel } from "@/app/components/analitica/descargas/scope";
import { relationByKey } from "@/app/components/analitica/descargas/fixtures";
import { exportRelationsSchema } from "@/app/lib/analitica/contracts/exportar";
import type { DateRange } from "@/app/lib/analitica/dateRange";

function range(from: string, toExclusive: string): DateRange {
  return { from, toExclusive, granularity: "day" };
}

/** Una tabla con una ventana de diez días y diez filas por día: con números
 *  redondos, la estimación se puede afirmar exacta en vez de «alrededor de». */
const TEN_DAY_RELATION = exportRelationsSchema.parse({
  relaciones: [
    {
      clave: "prueba",
      etiqueta: "Tabla de diez días",
      descripcion: "Diez días, cien filas.",
      columna_tiempo: "timestamp",
      filas: 100,
      desde: "2026-01-01",
      hasta: "2026-01-10",
      columnas: [{ nombre: "timestamp", etiqueta: "Marca de tiempo", unidad: null, por_defecto: true }],
    },
  ],
})[0];

describe("relationScope", () => {
  it("dado un rango dentro de la cobertura, cuando lo evalúa, entonces no hay nada que avisar", () => {
    // Given / When
    const scope = relationScope(TEN_DAY_RELATION, range("2026-01-02", "2026-01-05"));

    // Then: tres días a diez filas por día.
    expect(scope).toEqual({ kind: "covered", estimatedRows: 30 });
  });

  it("dado un rango que termina el último día con dato, cuando lo evalúa, entonces ese día entra", () => {
    // Given: `hasta` exclusivo el 11 incluye el 10, que es el último día con
    // dato. Es el borde donde un +1 mal puesto se come una jornada entera.
    const scope = relationScope(TEN_DAY_RELATION, range("2026-01-10", "2026-01-11"));

    expect(scope).toEqual({ kind: "covered", estimatedRows: 10 });
  });

  it("dado un rango que empieza justo después del último día, cuando lo evalúa, entonces queda fuera", () => {
    // Given: el otro lado del mismo borde.
    const scope = relationScope(TEN_DAY_RELATION, range("2026-01-11", "2026-01-20"));

    expect(scope.kind).toBe("outside");
    if (scope.kind !== "outside") throw new Error("se esperaba fuera de cobertura");
    expect(scope.notice).toContain("del 2026-01-01 al 2026-01-10");
    expect(scope.notice).toContain("saldría vacío");
  });

  it("dado un rango que desborda la cobertura, cuando lo evalúa, entonces dice qué días entran de verdad", () => {
    // Given: se pide desde antes de que la tabla existiera.
    const scope = relationScope(TEN_DAY_RELATION, range("2025-12-20", "2026-01-06"));

    // Then: cinco días reales (del 1 al 5), no los diecisiete pedidos.
    expect(scope.kind).toBe("clipped");
    if (scope.kind !== "clipped") throw new Error("se esperaba un recorte");
    expect(scope.estimatedRows).toBe(50);
    expect(scope.notice).toContain("del 2026-01-01 al 2026-01-05");
  });

  it("dada una tabla sin eje temporal, cuando la evalúa, entonces el rango no la recorta", () => {
    // Given: el diccionario de variables no tiene columna de tiempo.
    const scope = relationScope(relationByKey("diccionario"), range("2026-01-01", "2026-01-05"));

    // Then: se descarga entera, y el conteo es exacto, no estimado.
    expect(scope.kind).toBe("whole");
    if (scope.kind !== "whole") throw new Error("se esperaba la tabla entera");
    expect(scope.rows).toBe(148);
    expect(scope.notice).toContain("no tiene columna de tiempo");
  });

  it("dada la tabla calibrada, cuando el rango la precede, entonces avisa antes de descargar", () => {
    // Given: la irradiancia anterior a mediados de 2025 se descartó, así que un
    // rango de 2024 contra esa tabla no es un error de la persona, es un hueco
    // real que hay que nombrar.
    const scope = relationScope(relationByKey("radiacion_calibrada"), range("2024-11-10", "2025-01-01"));

    expect(scope.kind).toBe("outside");
  });
});

describe("relationWindowLabel", () => {
  it("dada una tabla con ventana, cuando la describe, entonces usa el último día INCLUSIVE", () => {
    expect(relationWindowLabel(relationByKey("electrico_crudo"))).toBe(
      "del 2024-11-10 al 2026-08-31",
    );
  });

  it("dada una tabla sin ventana, cuando la describe, entonces no se inventa fechas", () => {
    expect(relationWindowLabel(relationByKey("diccionario"))).toBe("sin eje temporal");
  });
});
