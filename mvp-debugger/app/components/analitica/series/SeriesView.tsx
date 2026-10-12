"use client";
// La vista Series: la completitud del período y la serie de la variable elegida.
//
// Las dos secciones montan a la vez, así que sus dos peticiones salen en el mismo
// commit y corren en paralelo: una sola espera para quien mira, no una cascada.
// El catálogo ya vino resuelto del servidor, así que no añade un tercer turno.
// Cambiar de variable solo vuelve a pedir la serie.
//
// La variable ARRANCA en la que pide la URL (`?variables=`, lo que escribe
// «Abrir en Series» del asistente) y después vive en estado local: elegir otra
// en el selector no reescribe la URL.
import { useState } from "react";

import { CompletenessSection } from "@/app/components/analitica/series/CompletenessSection";
import { VariablePicker } from "@/app/components/analitica/series/VariablePicker";
import { VariableSeriesSection } from "@/app/components/analitica/series/VariableSeriesSection";
import { DEFAULT_VARIABLE_KEY, resolveVariable } from "@/app/components/analitica/series/catalog";
import styles from "@/app/components/analitica/series/series.module.css";
import type { CatalogLoad } from "@/app/components/analitica/series/loadCatalog";
import type { DateRange } from "@/app/lib/analitica/dateRange";

export type SeriesViewProps = {
  readonly range: DateRange;
  readonly catalogLoad: CatalogLoad;
  /** La variable con que abre; sin ella, la de por defecto. */
  readonly initialVariableKey?: string;
};

export function SeriesView({ range, catalogLoad, initialVariableKey = DEFAULT_VARIABLE_KEY }: SeriesViewProps) {
  const [variableKey, setVariableKey] = useState(initialVariableKey);

  return (
    <>
      <CompletenessSection range={range} />
      {catalogLoad.status === "failed" ? (
        <p className="rng-aviso" role="alert">
          No se pudo cargar el catálogo de variables: {catalogLoad.message}. La completitud de
          arriba sigue siendo válida.
        </p>
      ) : (
        <section className={styles.block} aria-label="Serie por variable">
          <VariablePicker
            catalog={catalogLoad.catalog}
            value={variableKey}
            range={range}
            onChange={setVariableKey}
          />
          <VariableSeriesSection
            range={range}
            variable={resolveVariable(catalogLoad.catalog, variableKey)}
          />
        </section>
      )}
    </>
  );
}
