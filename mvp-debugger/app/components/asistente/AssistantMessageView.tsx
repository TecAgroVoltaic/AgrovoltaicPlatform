"use client";
// Una respuesta ya terminada: sus bloques, la traza plegable y, si no llegó
// entera, por qué.
import { useMemo, useState } from "react";

import { MessageBlocks } from "@/app/components/asistente/MessageBlocks";
import styles from "@/app/components/asistente/asistente.module.css";
import { TrazaLegible } from "@/app/components/TrazaLegible";
import { buildBlocks } from "@/app/lib/asistente/messageBlocks";
import type { AssistantMessage } from "@/app/lib/asistente/messages";

const COST_DECIMALS = 5;

export type AssistantMessageViewProps = {
  readonly message: AssistantMessage;
  readonly onAsk: (question: string) => void;
  readonly askDisabled: boolean;
  /** Solo la última respuesta fallida se puede reintentar. */
  readonly onRetry?: () => void;
};

export function AssistantMessageView({ message, onAsk, askDisabled, onRetry }: AssistantMessageViewProps) {
  const [traceOpen, setTraceOpen] = useState(false);
  const trace = message.traza;
  const blocks = useMemo(() => buildBlocks(trace?.pasos ?? [], message.texto), [trace, message.texto]);
  const tools = (trace?.pasos ?? []).flatMap((step) => (step.tipo === "tool" ? [step.nombre] : []));
  const cost = trace?.costo?.usd_total;

  return (
    <article className={styles.assistant} aria-label="Respuesta del asistente">
      <MessageBlocks blocks={blocks} onAsk={onAsk} askDisabled={askDisabled} />

      {message.fallo ? (
        <div className={styles.failure}>
          <div className="alert" role="alert">
            {message.fallo.message}
          </div>
          {onRetry ? (
            <button type="button" className="btn ghost sm" disabled={askDisabled} onClick={onRetry}>
              Reintentar
            </button>
          ) : null}
        </div>
      ) : null}

      {trace && trace.pasos.length > 0 ? (
        <>
          <div className="chat-meta">
            <button
              type="button"
              className="chat-trazabtn"
              aria-expanded={traceOpen}
              onClick={() => setTraceOpen((open) => !open)}
            >
              {traceOpen ? "▾" : "▸"} traza
            </button>
            {tools.map((tool, index) => (
              <span key={`${tool}-${index}`} className="chat-chip">
                {tool}
              </span>
            ))}
            {cost !== undefined ? <span className="chat-chip cost">${cost.toFixed(COST_DECIMALS)}</span> : null}
          </div>
          {traceOpen ? (
            <div className="chat-traza">
              <TrazaLegible pasos={[...trace.pasos]} usage={trace.usage} ms={trace.ms_total ?? null} costo={cost ?? null} />
            </div>
          ) : null}
        </>
      ) : null}
    </article>
  );
}
