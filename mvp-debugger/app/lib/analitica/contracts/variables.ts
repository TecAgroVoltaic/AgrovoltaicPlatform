// El contrato de `GET /analitica/variables`: qué se puede graficar y desde cuándo.
//
// Es METADATO, no la lectura de un período, así que NO viaja dentro del sobre de
// `resultado`: no hay `ventana` ni `confianza` que llenar. Por eso no usa
// `analysisResponse` y vive en su propio archivo en vez de junto a los dos
// payloads con rango de la vista Series.
//
// Los tres campos que deciden qué se le muestra a la persona, y que antes esta
// vista tenía que adivinar:
//   `graficable`     lo resuelve la MISMA puerta que usa /analitica/series, así
//                    que el selector ya no puede ofrecer una clave que dé 400.
//   `dato_desde/hasta` el tramo en que la variable EXISTE. Fuera de él no es que
//                    falte el dato: el sensor no estaba puesto.
//   `hueco`          un agujero INTERIOR ya contado, que un par de fechas no
//                    puede expresar (los acumuladores cubren 144 días, pero
//                    ninguno entre noviembre 2025 y febrero 2026).
import { z } from "zod";

export type CatalogVariable = {
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  /** `electrico`, `termico`, `radiacion`, `ambiental`. Se deja como texto: una
   *  familia nueva del backend no tiene por qué romper la validación. */
  readonly family: string;
  /** Primer día en que existe, o null si existe desde el inicio del histórico. */
  readonly from: string | null;
  /** Último día, INCLUSIVE, o null si llega hasta el final del histórico. */
  readonly until: string | null;
  readonly innerGap: string | null;
  /** El porqué en prosa de que no haya fuente. Acompaña a `plottable: false`. */
  readonly missingSource: string | null;
  /** El gate real: si es false, `/analitica/series` no la acepta. */
  readonly plottable: boolean;
};

export type VariableCatalog = {
  readonly variables: readonly CatalogVariable[];
  readonly families: readonly string[];
  readonly note: string | null;
};

const catalogVariableSchema = z
  .object({
    clave: z.string(),
    etiqueta: z.string(),
    unidad: z.string(),
    familia: z.string(),
    dato_desde: z.string().nullable(),
    dato_hasta: z.string().nullable(),
    hueco: z.string().nullable(),
    fuente_ausente: z.string().nullable(),
    graficable: z.boolean(),
  })
  .transform((raw): CatalogVariable => ({
    key: raw.clave,
    label: raw.etiqueta,
    unit: raw.unidad,
    family: raw.familia,
    from: raw.dato_desde,
    until: raw.dato_hasta,
    innerGap: raw.hueco,
    missingSource: raw.fuente_ausente,
    plottable: raw.graficable,
  }));

export const variableCatalogSchema = z
  .object({
    variables: z.array(catalogVariableSchema).min(1),
    familias: z.array(z.string()),
    nota: z.string().nullish(),
  })
  .transform((raw): VariableCatalog => ({
    variables: raw.variables,
    families: raw.familias,
    note: raw.nota ?? null,
  }));
