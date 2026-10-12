"use client";
// El registro `kind` → renderer. Es un tipo mapeado sobre `MessageBlockKind`:
// un bloque nuevo sin su renderer no compila, y cada renderer recibe su
// variante exacta sin casteos.
import type { ReactNode } from "react";

import { ChartCard } from "@/app/components/asistente/ChartCard";
import { DescargaCard } from "@/app/components/asistente/DescargaCard";
import { CalendarCard } from "@/app/components/asistente/blocks/CalendarCard";
import { DocumentsCard } from "@/app/components/asistente/blocks/DocumentsCard";
import { DownloadsCard } from "@/app/components/asistente/blocks/DownloadsCard";
import { NavigationCard } from "@/app/components/asistente/blocks/NavigationCard";
import { ReportCard } from "@/app/components/asistente/blocks/ReportCard";
import { TextBlock } from "@/app/components/asistente/blocks/TextBlock";
import { VariableSelectorCard } from "@/app/components/asistente/blocks/VariableSelectorCard";
import type { BlockOfKind, MessageBlockKind } from "@/app/lib/asistente/blocks/types";

/** Lo que un bloque puede hacer con la conversación. */
export type BlockContext = {
  /** Manda un mensaje por el mismo camino que lo que escribe la persona. */
  readonly onAsk: (question: string) => void;
  /** Mientras otra respuesta está llegando no se puede preguntar. */
  readonly askDisabled: boolean;
};

type BlockRenderer<Kind extends MessageBlockKind> = (block: BlockOfKind<Kind>, context: BlockContext) => ReactNode;

export type BlockRendererRegistry = { readonly [Kind in MessageBlockKind]: BlockRenderer<Kind> };

export const BLOCK_RENDERERS: BlockRendererRegistry = {
  text: (block) => <TextBlock markdown={block.markdown} />,
  chart: (block, context) => <ChartCard spec={block.spec} request={block.request} {...context} />,
  download: (block) => <DescargaCard spec={block.spec} />,
  report: (block) => <ReportCard spec={block.spec} />,
  downloads: (block) => <DownloadsCard spec={block.spec} />,
  variableSelector: (block, context) => <VariableSelectorCard spec={block.spec} {...context} />,
  navigation: (block) => <NavigationCard spec={block.spec} />,
  documents: (block) => <DocumentsCard spec={block.spec} />,
  calendar: (block) => <CalendarCard spec={block.spec} />,
};

export function renderBlock<Kind extends MessageBlockKind>(block: BlockOfKind<Kind>, context: BlockContext): ReactNode {
  const render: BlockRenderer<Kind> = BLOCK_RENDERERS[block.kind];
  return render(block, context);
}
