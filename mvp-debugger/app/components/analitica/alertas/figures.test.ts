// Lo que protege: que las cifras de la evidencia se lean con nombre y unidad
// cuando se conocen, y crudas (nunca inventadas ni calladas) cuando no.
import { describe, expect, it } from "vitest";

import { headlineFigures, keyFigures } from "@/app/components/analitica/alertas/figures";

describe("keyFigures", () => {
  it("nombra y da unidad a las claves del evaluador, y deja crudas las desconocidas", () => {
    // Given cifras con una clave conocida, una desconocida y un nulo
    const figures = keyFigures({ ghi_max_wm2: 1043.5, codigo_error: 302, nota_equipo: null });

    // Then la conocida sale legible y con unidad; las otras, con su nombre crudo
    expect(figures).toEqual([
      { key: "ghi_max_wm2", label: "GHI máx", value: expect.stringMatching(/^1\s?043,5$/), unit: "W/m²" },
      { key: "codigo_error", label: "codigo_error", value: "302", unit: null },
      { key: "nota_equipo", label: "nota_equipo", value: "—", unit: null },
    ]);
  });
});

describe("headlineFigures", () => {
  it("resume con la cifra del tipo y las lecturas afectadas, en ese orden", () => {
    const line = headlineFigures({ lecturas_afectadas: 147, ghi_max_wm2: 1041, otra: 3 });
    expect(line).toMatch(/^GHI máx 1\s?041 W\/m² · Lecturas afectadas 147$/);
  });

  it("sin cifras conocidas y numéricas no inventa una línea", () => {
    expect(headlineFigures({ codigo_error: 302, temp_max: "alto" })).toBeNull();
  });
});
