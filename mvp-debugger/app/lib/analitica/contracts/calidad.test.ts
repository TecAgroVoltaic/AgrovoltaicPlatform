// Lo que protegen estas pruebas: que el contrato aguante los payloads que de
// verdad llegan, no los que uno imagina. Cada caso de acá salió de una respuesta
// real del servicio, y los tres primeros son formas que un esquema ingenuo
// rechaza o, peor, convierte en un número falso.
import { describe, expect, it } from "vitest";

import {
  DAYS_WIRE,
  EMPTY_SUMMARY_WIRE,
  FINDINGS_WIRE,
  GLOSSARY_WIRE,
  SPREAD_WARNING,
  SUMMARY_WIRE,
  VIGILANCE_NOTE,
} from "@/app/components/analitica/calidad/fixtures";
import {
  findingGlossarySchema,
  findingsPageSchema,
  qualityDaysSchema,
  qualitySummarySchema,
} from "@/app/lib/analitica/contracts/calidad";

describe("contrato de calidad/resumen", () => {
  it("conserva la advertencia del servicio palabra por palabra", () => {
    // Given el resumen real de todo el histórico
    // When se valida en la frontera
    const summary = qualitySummarySchema.parse(SUMMARY_WIRE);

    // Then la advertencia viaja literal: reescribirla la desincroniza del número
    expect(summary.verdict.warning).toBe(SPREAD_WARNING);
    expect(summary.verdict.usableDays).toBe(25);
    expect(summary.verdict.byVariable).toHaveLength(3);
  });

  it("separa el eje del equipo del eje del dato", () => {
    // Given un período con 96 días de planta parada y 25 días utilizables
    // When se valida
    const { availability } = qualitySummarySchema.parse(SUMMARY_WIRE).verdict;

    // Then la disponibilidad es un bloque aparte, con su propia advertencia
    expect(availability.stoppedDays).toBe(96);
    expect(availability.stoppedUnderSunDays).toBe(69);
    expect(availability.warning).toMatch(/no un problema de calidad de dato/);
  });

  it("un tipo sin conteo de lecturas queda en null, jamás en cero", () => {
    // Given `cambio_de_cadencia`, que el servicio devuelve con `lecturas: null`
    // When se valida
    const cadenceChange = qualitySummarySchema
      .parse(SUMMARY_WIRE)
      .types.find((row) => row.type === "cambio_de_cadencia");

    // Then no se inventa un 0, que se leería como "no afectó a ninguna lectura"
    expect(cadenceChange?.readings).toBeNull();
    expect(cadenceChange?.severity).toBe("info");
  });

  it("acepta un período vacío, que llega sin desglose por variable", () => {
    // Given un rango de febrero 2025, dentro del hueco de 126 días
    // When se valida
    const summary = qualitySummarySchema.parse(EMPTY_SUMMARY_WIRE);

    // Then no revienta por los campos ausentes o nulos, y lo dice con el texto
    // del servicio en vez de con un cero mudo
    expect(summary.verdict.byVariable).toEqual([]);
    expect(summary.verdict.availability.fraction).toBeNull();
    expect(summary.verdict.warning).toMatch(/no tiene datos/);
  });
});

describe("contrato del bloque de vigilancia", () => {
  it("no vigilada y sin peso en el veredicto son dos campos, no uno", () => {
    // Given la POA (1.089 hallazgos, ninguno pesa) y el albedo (886, sí pesan)
    const { unwatched } = qualitySummarySchema.parse(SUMMARY_WIRE).vigilance;
    const poa = unwatched.find((variable) => variable.key === "poa_pv1_wm2");
    const albedo = unwatched.find((variable) => variable.key === "albedo");

    // When se comparan
    // Then las dos están fuera de vigilancia y solo una cuenta: colapsarlas en
    // un booleano haría afirmar algo falso sobre 5.000 hallazgos
    expect(poa?.findingsInPeriod).toBe(1089);
    expect(poa?.countsForVerdict).toBe(false);
    expect(albedo?.findingsInPeriod).toBe(886);
    expect(albedo?.countsForVerdict).toBe(true);
  });

  it("conserva los cuatro motivos y la nota que los define", () => {
    // Given el bloque completo
    const { vigilance } = qualitySummarySchema.parse(SUMMARY_WIRE);

    // When se valida
    // Then los motivos llegan sin colapsar y la nota va literal
    expect(new Set(vigilance.unwatched.map((variable) => variable.reason))).toEqual(
      new Set([
        "fuente_sin_denominador",
        "columna_no_barrida",
        "variable_derivada",
        "sin_fuente_en_la_base",
      ]),
    );
    expect(vigilance.note).toBe(VIGILANCE_NOTE);
    expect(vigilance.verdictSources).toEqual(["monitoreo_sc_electrico", "radiacion_sc_15s"]);
  });

  it("una variable derivada llega sin fuente, y eso no es un fallo", () => {
    // Given `kt_star`, que no existe cruda en ninguna tabla
    const { unwatched } = qualitySummarySchema.parse(SUMMARY_WIRE).vigilance;

    // When se valida
    const derived = unwatched.find((variable) => variable.reason === "variable_derivada");

    // Then su fuente es null y se conserva como tal, sin inventar una cadena
    expect(derived?.source).toBeNull();
    expect(derived?.key).toBe("kt_star");
  });
});

describe("contrato de calidad/dias", () => {
  it("un día sin filas queda marcado como ausente y no como aprobado", () => {
    // Given tres días: uno sin ninguna fila, uno limpio y uno grave
    // When se valida
    const days = qualityDaysSchema.parse(DAYS_WIRE);

    // Then el ausente tiene su propio veredicto, distinto del aprobado
    expect(days[0].verdict).toBe("noData");
    expect(days[1].verdict).toBe("ok");
    expect(days[0].verdict).not.toBe(days[1].verdict);
  });

  it("las banderas del equipo no contaminan el veredicto del dato", () => {
    // Given el día con la planta parada bajo sol
    // When se valida
    const stopped = qualityDaysSchema.parse(DAYS_WIRE)[2];

    // Then la parada viaja en campos propios, al lado del veredicto de calidad
    expect(stopped.plantStopped).toBe(true);
    expect(stopped.stoppedUnderSun).toBe(true);
    expect(stopped.verdict).toBe("critical");
  });
});

describe("contratos de hallazgos", () => {
  it("cada hallazgo trae la explicación del servicio", () => {
    // Given la primera página de hallazgos
    // When se valida
    const page = findingsPageSchema.parse(FINDINGS_WIRE);

    // Then el total y el truncado sobreviven, y `que_es` llega sin tocar
    expect(page.total).toBe(26023);
    expect(page.truncated).toBe(true);
    expect(page.findings[0].whatItIs).toMatch(/lo que falló fue el EQUIPO/);
  });

  it("la paginación llega con el desplazamiento siguiente y el orden que la sostiene", () => {
    // Given la primera página de un filtro con 26.023 hallazgos
    const page = findingsPageSchema.parse(FINDINGS_WIRE);

    // When se valida
    // Then el salto lo dicta el servicio, y el orden incluye `fuente`: sin ese
    // desempate, avanzar repite un hallazgo y se salta otro en silencio
    expect(page.page).toEqual({ offset: 0, limit: 50, hasMore: true, nextOffset: 50 });
    expect(page.order).toContain("fuente");
    expect(page.total).not.toBe(page.returned);
  });

  it("el glosario se indexa por tipo, con las palabras del servicio", () => {
    // Given el bloque `hallazgos.tipos` de /arquitectura
    // When se valida
    const glossary = findingGlossarySchema.parse(GLOSSARY_WIRE);

    // Then hay una explicación por tipo, y ninguna la escribió el navegador
    expect(glossary.get("saturado_85")).toMatch(/DS18B20/);
    expect(glossary.get("tipo_que_no_existe")).toBeUndefined();
  });
});
