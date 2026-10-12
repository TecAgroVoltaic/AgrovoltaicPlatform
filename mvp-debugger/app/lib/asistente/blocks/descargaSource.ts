// De qué fuente del registro sale una descarga de `exportar_datos`. El spec
// trae la vía (`supabase` | `agrodash`), la tabla y las cajas: lo mismo que
// elige la vista Descargas, así que se resuelve con la misma regla.
import type { DescargaSpec } from "@/app/lib/asistente/contracts/descargaSpec";
import { sourceOfExport } from "@/app/lib/fuentes/exportSource";
import type { SourceId } from "@/app/lib/fuentes/registry";

export function descargaSource(spec: DescargaSpec): SourceId {
  return sourceOfExport({
    exportSource: spec.fuente,
    datasetKey: spec.tabla,
    boxes: new Set(spec.filtros?.caja ?? []),
  });
}
