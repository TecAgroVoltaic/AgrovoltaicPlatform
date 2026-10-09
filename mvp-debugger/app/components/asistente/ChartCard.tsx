"use client";
// La tarjeta de un gráfico del agente: título y subtítulo del ChartSpec con
// «Ampliar», el gráfico, y un pie con «Descargar estos datos», «Abrir en Series»
// y cuánto dibuja.
//
// Las dos acciones del pie dependen de con QUÉ se pidió el gráfico (variables y
// rango del paso). Sin ese pedido no se inventan: se muestra solo el gráfico.
import { useMemo, useState } from "react";

import { IconClose, IconDownload, IconExpand, IconTrend } from "@/app/components/asistente/AssistantIcons";
import { SourceBadge } from "@/app/components/fuentes/SourceBadge";
import { ChartSpecChart, InvalidChartSpec } from "@/app/components/asistente/ChartSpecRenderer";
import styles from "@/app/components/asistente/cards.module.css";
import controls from "@/app/components/asistente/controls.module.css";
import { parseChartSpec, type ChartSpec } from "@/app/lib/asistente/contracts/chartSpec";
import { exportRequestMessage, type ChartRequest } from "@/app/lib/asistente/messageBlocks";
import { chartSizeLabel } from "@/app/lib/asistente/presentation";
import { seriesHref } from "@/app/lib/asistente/seriesLink";
import { useModalDialog } from "@/app/lib/asistente/useModalDialog";
import { PHOTOVOLTAIC_SOURCE } from "@/app/lib/fuentes/registry";

const ICON_SIZE = 13;
const HEADER_ICON_SIZE = 14;
const ICON_STROKE = 2;
/** El alto del gráfico ampliado: el doble largo del de la tarjeta, y entra en
 *  una pantalla de portátil con la cabecera del diálogo. */
const ZOOMED_CHART_HEIGHT = 520;

export type ChartCardProps = {
  readonly spec: unknown;
  readonly request: ChartRequest | null;
  readonly onAsk: (question: string) => void;
  readonly askDisabled: boolean;
};

export function ChartCard({ spec, request, onAsk, askDisabled }: ChartCardProps) {
  const parsed = useMemo(() => parseChartSpec(spec), [spec]);
  if (!parsed.ok) return <InvalidChartSpec reason={parsed.reason} />;
  return <ValidChartCard spec={parsed.spec} request={request} onAsk={onAsk} askDisabled={askDisabled} />;
}

type ValidChartCardProps = Omit<ChartCardProps, "spec"> & { readonly spec: ChartSpec };

function ValidChartCard({ spec, request, onAsk, askDisabled }: ValidChartCardProps) {
  const [zoomed, setZoomed] = useState(false);
  const subtitle = spec.subtitulo ?? spec.unidad;
  const facts = request ? `${chartSizeLabel(spec)} · ${request.variables.join(", ")}` : chartSizeLabel(spec);

  return (
    <figure className={styles.card}>
      <div className={styles.cardHead}>
        <div>
          <p className={styles.cardTitle}>{spec.titulo}</p>
          <p className={styles.cardSub}>{subtitle}</p>
        </div>
        <div className={styles.headTools}>
          <SourceBadge source={PHOTOVOLTAIC_SOURCE} />
          <button type="button" className={styles.zoom} aria-label="Ampliar gráfico" onClick={() => setZoomed(true)}>
            <IconExpand size={HEADER_ICON_SIZE} strokeWidth={ICON_STROKE} />
          </button>
        </div>
      </div>
      <div className={styles.cardChart}>
        <ChartSpecChart spec={spec} />
      </div>
      <figcaption className={styles.cardFoot}>
        {request ? (
          <>
            <button
              type="button"
              className={`${controls.action} ${controls.iconOnMobile}`}
              aria-label="Descargar estos datos"
              disabled={askDisabled}
              title={askDisabled ? "Esperá a que termine la respuesta en curso" : undefined}
              onClick={() => onAsk(exportRequestMessage(spec.titulo, request))}
            >
              <IconDownload size={ICON_SIZE} strokeWidth={ICON_STROKE} />
              <span className={controls.collapsible}>Descargar estos datos</span>
            </button>
            <a className={`${controls.action} ${controls.iconOnMobile}`} aria-label="Abrir en Series" href={seriesHref(request)}>
              <IconTrend size={ICON_SIZE} strokeWidth={ICON_STROKE} />
              <span className={controls.collapsible}>Abrir en Series</span>
            </a>
          </>
        ) : null}
        <span className={styles.cardFacts} title={facts}>
          {facts}
        </span>
      </figcaption>
      <ZoomDialog spec={spec} open={zoomed} onClose={() => setZoomed(false)} />
    </figure>
  );
}

function ZoomDialog({ spec, open, onClose }: { spec: ChartSpec; open: boolean; onClose: () => void }) {
  const dialogRef = useModalDialog(open, onClose);
  return (
    <dialog ref={dialogRef} className={styles.zoomDialog} aria-label={`${spec.titulo}, ampliado`}>
      {/* El gráfico se monta solo con el diálogo abierto: un segundo lienzo de
          ECharts escondido en cada tarjeta es memoria para nada. */}
      {open ? (
        <div className={styles.zoomBody}>
          <div className={styles.cardHead}>
            <div>
              <p className={styles.cardTitle}>{spec.titulo}</p>
              <p className={styles.cardSub}>{spec.subtitulo ?? spec.unidad}</p>
            </div>
            <button type="button" className={styles.zoom} aria-label="Cerrar" onClick={onClose}>
              <IconClose size={HEADER_ICON_SIZE} strokeWidth={ICON_STROKE} />
            </button>
          </div>
          <div className={styles.cardChart}>
            <ChartSpecChart spec={spec} height={ZOOMED_CHART_HEIGHT} />
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
