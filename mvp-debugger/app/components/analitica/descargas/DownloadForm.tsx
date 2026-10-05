"use client";
// Los cuatro pasos, sobre un catálogo ya resuelto.
//
// El estado de la selección NO va a la URL: el selector de rango del cascarón
// reescribe la query al cambiar de período y se lo llevaría por delante. Es la
// misma deuda anotada en la vista Estadística, y se paga en el mismo sitio.
import { buildDownloadUrl } from "@/app/components/analitica/descargas/download";
import { ColumnPicker } from "@/app/components/analitica/descargas/ColumnPicker";
import { DownloadPanel } from "@/app/components/analitica/descargas/DownloadPanel";
import { FormatPicker } from "@/app/components/analitica/descargas/FormatPicker";
import { RelationPicker } from "@/app/components/analitica/descargas/RelationPicker";
import { relationScope } from "@/app/components/analitica/descargas/scope";
import { useDownloadSelection } from "@/app/components/analitica/descargas/useDownloadSelection";
import type { DateRange } from "@/app/lib/analitica/dateRange";
import type { ExportRelation } from "@/app/lib/analitica/contracts/exportar";

export type DownloadFormProps = {
  readonly relations: readonly ExportRelation[];
  readonly range: DateRange;
};

export function DownloadForm({ relations, range }: DownloadFormProps) {
  const selection = useDownloadSelection(relations);
  const { relation, columns, actions } = selection;

  return (
    <>
      <RelationPicker
        relations={relations}
        selectedKey={relation.key}
        range={range}
        onSelect={actions.selectRelation}
      />
      <ColumnPicker
        relation={relation}
        selected={columns}
        onToggle={actions.toggleColumn}
        onSelectAll={actions.selectAllColumns}
        onClear={actions.clearColumns}
      />
      <FormatPicker
        relation={relation}
        columns={columns}
        format={selection.format}
        matlabNumeric={selection.matlabNumeric}
        metadata={selection.metadata}
        metadataEnabled={selection.metadataEnabled}
        onFormat={actions.setFormat}
        onMatlabNumeric={actions.setMatlabNumeric}
        onMetadata={actions.setMetadata}
      />
      <DownloadPanel
        range={range}
        scope={relationScope(relation, range)}
        columnCount={columns.length}
        format={selection.format}
        href={buildDownloadUrl({
          relationKey: relation.key,
          range,
          columns,
          wireFormat: selection.wireFormat,
          metadata: selection.metadata,
        })}
      />
    </>
  );
}
