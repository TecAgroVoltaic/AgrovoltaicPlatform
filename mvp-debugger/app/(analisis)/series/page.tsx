// Series (Fig. 4 y Fig. 5 del PDF).
//
// Server Component por dos motivos. Uno: lee el rango de la URL con el mismo
// intérprete que usa el selector del cascarón, así que el primer pintado ya sabe
// qué período se mira y no hay un segundo estado de rango que pueda discrepar.
// Dos: resuelve acá el catálogo de variables, que es metadato y no depende del
// rango. Si lo pidiera el navegador, la serie tendría que esperarlo para saber
// si esa variable existe en este rango, y eso sería una cascada.
import type { Metadata } from "next";

import { SeriesView } from "@/app/components/analitica/series/SeriesView";
import { findSection } from "@/app/components/analitica/sections";
import { loadVariableCatalog } from "@/app/components/analitica/series/loadCatalog";
import { parseRangeParams, readerFromRecord } from "@/app/lib/analitica/urlRange";

export const metadata: Metadata = { title: "Series · AgroVoltaic" };

const SECTION_PATH = "/series";

export default async function SeriesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const { range } = parseRangeParams(readerFromRecord(searchParams));
  const catalogLoad = await loadVariableCatalog();
  const section = findSection(SECTION_PATH);

  return (
    <div className="vista">
      <header className="phead">
        <h1>{section?.label ?? "Series"}</h1>
        <p>{section?.description}</p>
      </header>
      <SeriesView range={range} catalogLoad={catalogLoad} />
    </div>
  );
}
