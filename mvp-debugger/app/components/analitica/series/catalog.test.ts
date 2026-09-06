// Lo que estas pruebas protegen: que el catálogo publicado no pierda entradas al
// pintarse. El orden es una decisión de interfaz, pero «desaparecer» no: una
// familia que el backend añada mañana tiene que verse igual, aunque sea al final.
import { describe, expect, it } from "vitest";

import {
  familyLabel,
  orderedFamilies,
  resolveVariable,
  variablesOfFamily,
} from "@/app/components/analitica/series/catalog";
import type { CatalogVariable, VariableCatalog } from "@/app/lib/analitica/contracts/variables";

function variable(key: string, family: string, plottable = true): CatalogVariable {
  return {
    key,
    label: key,
    unit: "W",
    family,
    from: null,
    until: null,
    innerGap: null,
    missingSource: null,
    plottable,
  };
}

const CATALOG: VariableCatalog = {
  variables: [
    variable("humedad_relativa_pct", "ambiental", false),
    variable("potencia_pv1_w", "electrico"),
    variable("albedo", "radiacion"),
    variable("temp_inclinado", "termico"),
  ],
  families: ["ambiental", "electrico", "radiacion", "termico"],
  note: null,
};

describe("orderedFamilies", () => {
  it("ordena por lectura y deja lo ambiental al final", () => {
    // Given las cuatro familias tal como llegan del backend (alfabéticas)
    // When se ordenan para el selector
    // Then lo ambiental cierra: hoy no tiene ni una variable graficable
    expect(orderedFamilies(CATALOG)).toEqual(["electrico", "termico", "radiacion", "ambiental"]);
  });

  it("una familia nueva no desaparece del selector", () => {
    // Given un backend que empieza a publicar una familia que esta vista no conoce
    const withNew: VariableCatalog = { ...CATALOG, families: [...CATALOG.families, "abiotico"] };

    // When se ordenan
    const families = orderedFamilies(withNew);

    // Then se muestra igual, al final: perderla escondería datos nuevos
    expect(families).toContain("abiotico");
    expect(families[families.length - 1]).toBe("abiotico");
  });
});

describe("resolveVariable", () => {
  it("con una clave que el catálogo ya no publica cae en una graficable", () => {
    // Given una clave retirada del backend (la elección vive en estado local)
    const resolved = resolveVariable(CATALOG, "irradiancia_incidente");

    // When se resuelve
    // Then la vista tiene algo que mostrar, y que además se puede pedir
    expect(resolved.plottable).toBe(true);
    expect(resolved.key).toBe("potencia_pv1_w");
  });

  it("con una clave conocida devuelve esa, aunque no sea graficable", () => {
    // Given la humedad relativa, que el catálogo publica sin fuente
    const resolved = resolveVariable(CATALOG, "humedad_relativa_pct");

    // When se resuelve
    // Then se respeta la elección: el vacío explicado es lo que se quiere ver
    expect(resolved.key).toBe("humedad_relativa_pct");
  });
});

describe("familyLabel y variablesOfFamily", () => {
  it("traduce lo conocido y deja pasar lo nuevo sin romperse", () => {
    // Given una familia conocida y una que todavía no tiene nombre en castellano
    // When se piden sus etiquetas y sus variables
    // Then la conocida se lee traducida y la nueva conserva su clave
    expect(familyLabel("radiacion")).toBe("Radiación");
    expect(familyLabel("abiotico")).toBe("abiotico");
    expect(variablesOfFamily(CATALOG, "electrico").map((each) => each.key)).toEqual([
      "potencia_pv1_w",
    ]);
  });
});
