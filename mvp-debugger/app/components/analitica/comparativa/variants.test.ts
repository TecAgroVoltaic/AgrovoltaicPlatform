// Lo que estas pruebas protegen: que un PR imposible NUNCA gane una comparación.
//
// Contra POA frontal el vertical da 1,217, que es más energía que la luz
// recibida. Es el número más alto de la matriz, así que cualquier lectura
// ingenua lo corona ganador; y significa exactamente lo contrario, que la
// irradiancia con la que se lo juzga está mal. Si esta regla se rompe, la vista
// entera da vuelta el hallazgo del proyecto sin que falle nada más.
import { describe, expect, it } from "vitest";

import {
  readVariants,
  readableVariants,
  variantPath,
} from "@/app/components/analitica/comparativa/variants";
import {
  COUNTER_DAYS,
  emptyPerformanceReport,
  IMPOSSIBLE_WARNING,
  performanceReport,
  VALID_DAYS,
} from "@/app/components/analitica/comparativa/fixtures";

const READABLE_IDS = [
  "contador/ghi",
  "contador/poa_bifacial",
  "integral/ghi",
  "integral/poa_bifacial",
];

describe("readVariants", () => {
  it("la variante marcada por el backend no declara ganador", () => {
    // Given un informe donde el vertical contra POA frontal supera el límite físico
    const report = performanceReport();

    // When se lee esa variante
    const frontal = readVariants(report).find((variant) => variant.id === "integral/poa_frontal");

    // Then queda fuera de lo legible, sin ganador y con el aviso del backend
    expect(frontal?.readable).toBe(false);
    expect(frontal?.leader).toBeNull();
    expect(frontal?.limitWarning).toBe(IMPOSSIBLE_WARNING);
  });

  it("cada variante conserva SU propio conjunto de días", () => {
    // Given el contador, que cubre menos días que la integral
    const variants = readVariants(performanceReport());

    // When se leen los días de una y de otra
    const counter = variants.find((variant) => variant.id === "contador/ghi");
    const integral = variants.find((variant) => variant.id === "integral/ghi");

    // Then no comparten muestra: mezclarlas daría un número con sesgo estacional
    expect(counter?.days).toBe(COUNTER_DAYS);
    expect(integral?.days).toBe(VALID_DAYS);
  });

  it("en las cuatro variantes legibles queda arriba el mismo arreglo", () => {
    // Given el informe completo del período
    const variants = readVariants(performanceReport());

    // When se filtran las que se pueden leer en una escala de rendimiento
    const readable = readableVariants(variants);

    // Then son las cuatro sin marca, y todas ordenan igual: el resultado no
    // depende del método elegido
    expect(readable.map((variant) => variant.id)).toEqual(READABLE_IDS);
    expect(readable.map((variant) => variant.leader)).toEqual(READABLE_IDS.map(() => "inclinado"));
    expect(variants.filter((variant) => !variant.readable)).toHaveLength(2);
  });

  it("los insumos modelados viajan marcados como provisionales", () => {
    // Given que R2 dejó la ecuación de transposición esperando a Hugo
    const variants = readVariants(performanceReport());

    // When se mira cuáles dependen de ese modelo
    const provisional = variants.filter((variant) => variant.provisional).map((v) => v.input);

    // Then son las dos POA, y ninguna de las que se miden contra GHI
    expect(new Set(provisional)).toEqual(new Set(["poa_bifacial", "poa_frontal"]));
  });

  it("sin PR no inventa un ganador: trae el motivo del backend", () => {
    // Given un rango sin una sola fila (200 con pr en null y motivo)
    const variants = readVariants(emptyPerformanceReport());

    // When se busca quién queda arriba
    const ghi = variants.find((variant) => variant.id === "integral/ghi");

    // Then no hay ganador ni cero, hay motivo, y nada queda para dibujar
    expect(ghi?.leader).toBeNull();
    expect(ghi?.cells.inclinado.pr).toBeNull();
    expect(ghi?.missingReason).toBe("sin_lecturas");
    expect(readableVariants(variants)).toHaveLength(0);
  });
});

describe("variantPath", () => {
  it("arma la misma ruta con que el backend marca una celda", () => {
    // Given la variante que el servicio nombra `integral/poa_frontal/vertical`
    // When se construye su ruta
    const path = variantPath("integral", "poa_frontal", "vertical");

    // Then coincide con la marca que viaja en `supera_limite_fisico`
    const report = performanceReport();
    expect(report.months[0].exceedsPhysicalLimit).toContain(path);
  });
});
