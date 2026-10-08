// Lo que protege: que un ChartSpec válido pase tal cual a la primitiva, y que
// uno que se dibujaría a medias (barras sin categoría, celdas fuera de la
// rejilla) se rechace con un motivo legible.
import { describe, expect, it } from "vitest";

import { parseChartSpec, type ChartSpecKind } from "@/app/lib/asistente/contracts/chartSpec";
import { descargaSpecSchema, parseDescargaSpec } from "@/app/lib/asistente/contracts/descargaSpec";
import { CHART_SPEC_BY_KIND, CHART_SPEC_KINDS as KINDS, DESCARGA_SPEC } from "@/app/lib/asistente/fixtures";

function withData(kind: ChartSpecKind, patch: Record<string, unknown>) {
  const spec = CHART_SPEC_BY_KIND[kind];
  return { ...spec, datos: { ...spec.datos, ...patch } };
}

describe("parseChartSpec", () => {
  it.each(KINDS)("acepta la variante «%s» tal como la manda el backend y conserva `datos`", (kind) => {
    const parsed = parseChartSpec(CHART_SPEC_BY_KIND[kind]);
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.spec.datos).toEqual(CHART_SPEC_BY_KIND[kind].datos);
  });

  it.each([
    ["versión distinta de 1", { ...CHART_SPEC_BY_KIND.serie, version: 2 }, "version"],
    ["tipo desconocido", { ...CHART_SPEC_BY_KIND.serie, tipo: "torta" }, "tipo"],
    ["formato viejo de graficar", { tipo: "linea", x: [], series: [] }, ""],
    [
      "serie con un valor que no es número",
      withData("serie", { lines: [{ id: "a", label: "A", points: [{ timestamp: "2026-08-01T00:00:00", value: "1" }] }] }),
      "datos.lines.0.points.0.value",
    ],
    [
      "barras con menos valores que categorías",
      withData("barras", { series: [{ id: "a", label: "A", values: [1] }] }),
      "datos.series.0.values",
    ],
    [
      "carpeta con una celda fuera de la rejilla",
      withData("carpeta", { cells: [{ column: 5, row: 0, value: 1 }] }),
      "datos.cells.0",
    ],
    [
      "crestas con distinta cantidad de densidades que de puntos",
      withData("crestas", { curves: [{ id: "a", label: "A", x: [1, 2], density: [1] }] }),
      "datos.curves.0.density",
    ],
    ["cajas con count negativo", withData("cajas", { boxes: [{ label: "m", min: 0, q1: 0, median: 0, q3: 0, max: 0, count: -1 }] }), "datos.boxes.0.count"],
    ["dispersión sin ajuste declarado", withData("dispersion", { fit: undefined }), "datos.fit"],
  ])("rechaza %s y dice dónde", (_case, raw, path) => {
    const parsed = parseChartSpec(raw);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok && path) expect(parsed.reason).toContain(path);
  });
});

describe("parseDescargaSpec", () => {
  it("acepta la ficha del contrato con `hasta` inclusivo y la url tal cual", () => {
    const parsed = parseDescargaSpec(DESCARGA_SPEC);
    expect(parsed.ok && parsed.spec.url).toBe(DESCARGA_SPEC.url);
    expect(parsed.ok && parsed.spec.hasta).toBe("2026-08-31");
  });

  it("rechaza una url que no apunta a /datos/exportar", () => {
    const parsed = parseDescargaSpec({ ...DESCARGA_SPEC, url: "/chat?x=1" });
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.reason).toContain("url");
  });

  it("rechaza un formato fuera de csv, dat y mat", () => {
    expect(descargaSpecSchema.safeParse({ ...DESCARGA_SPEC, formato: "xlsx" }).success).toBe(false);
  });
});
