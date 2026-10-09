// Qué fuente del registro corresponde a una elección de Descargas.
//
// El catálogo de exportación agrupa por VÍA de acceso (`supabase`, `agrodash`)
// y el registro por ORIGEN del dato: el store ambiental vive en Supabase pero no
// es fotovoltaico, y la API de AgroDash sirve tanto a Cartago como a las cajas
// de San Carlos (las que llevan el sufijo «SC»).
import type { SourceId } from "@/app/lib/fuentes/registry";

const SUPABASE_EXPORT_SOURCE = "supabase";
const AMBIENT_STORE_DATASET = "ambiental_crudo";
const SAN_CARLOS_BOX_SUFFIX = " SC";

export type ExportChoice = {
  /** Clave de la fuente en el catálogo de exportación. */
  readonly exportSource: string;
  readonly datasetKey: string;
  /** Cajas filtradas; vacío = todas. */
  readonly boxes: ReadonlySet<string>;
};

export function sourceOfExport({ exportSource, datasetKey, boxes }: ExportChoice): SourceId {
  if (exportSource === SUPABASE_EXPORT_SOURCE) {
    return datasetKey === AMBIENT_STORE_DATASET ? "supabase_ambiental" : "supabase_pv";
  }
  const onlySanCarlos =
    boxes.size > 0 && [...boxes].every((box) => box.endsWith(SAN_CARLOS_BOX_SUFFIX));
  return onlySanCarlos ? "agrodash_sc" : "agrodash_cartago";
}
