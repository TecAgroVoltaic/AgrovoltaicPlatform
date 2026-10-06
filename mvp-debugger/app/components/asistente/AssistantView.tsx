"use client";
// La sección Asistente: un chat a pantalla completa con el Agente Histórico,
// que responde en vivo por `POST /chat/stream` y pinta los gráficos y las
// descargas que arman sus tools.
//
// La vista no calcula nada: compone lo que llega del stream con las primitivas
// de gráfico y el hook de descargas que ya usan las demás vistas. Este archivo
// solo reparte: cabecera, cajón de hilos, conversación y compositor.
import { useEffect, useId, useRef, useState } from "react";

import { AssistantMessageView } from "@/app/components/asistente/AssistantMessageView";
import { Composer } from "@/app/components/asistente/Composer";
import { EmptyState } from "@/app/components/asistente/EmptyState";
import { LiveTurnView } from "@/app/components/asistente/LiveTurnView";
import { ThreadDrawer } from "@/app/components/asistente/ThreadDrawer";
import { ThreadHeader } from "@/app/components/asistente/ThreadHeader";
import styles from "@/app/components/asistente/asistente.module.css";
import { useDateRange } from "@/app/lib/analitica/useDateRange";
import { buildRangeContext } from "@/app/lib/asistente/context";
import { useAssistantChat, type AssistantChatDeps } from "@/app/lib/asistente/useAssistantChat";

export function AssistantView({ deps }: { deps?: AssistantChatDeps }) {
  const { range } = useDateRange();
  const chat = useAssistantChat(deps);
  const [threadsOpen, setThreadsOpen] = useState(false);
  const drawerId = useId();
  const endRef = useRef<HTMLDivElement>(null);
  const messages = chat.thread?.messages ?? [];
  const lastIndex = messages.length - 1;
  const empty = messages.length === 0 && !chat.busy;

  const ask = (question: string) => chat.send(question, buildRangeContext(range));

  // Bajar al final cuando entra un mensaje o arranca/termina una respuesta, no
  // con cada fragmento de texto: eso le arrancaría la pantalla a quien está
  // leyendo más arriba mientras la respuesta llega. Sin conversación no se baja:
  // el estado vacío se lee desde arriba.
  useEffect(() => {
    if (empty) return;
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [empty, messages.length, chat.turn.status]);

  return (
    <section className={styles.view} aria-label="Asistente analítico">
      <ThreadHeader
        thread={chat.thread}
        busy={chat.busy}
        threadsOpen={threadsOpen}
        threadsPanelId={drawerId}
        onOpenThreads={() => setThreadsOpen(true)}
        onNew={chat.newThread}
      />
      <ThreadDrawer
        id={drawerId}
        open={threadsOpen}
        threads={chat.threads}
        activeId={chat.thread?.id ?? null}
        busy={chat.busy}
        onClose={() => setThreadsOpen(false)}
        onOpenThread={chat.openThread}
        onNew={chat.newThread}
        onDelete={chat.deleteThread}
      />

      <div className={styles.column}>
        {chat.storageNotice ? (
          <p className={styles.notice} role="status">
            {chat.storageNotice}
          </p>
        ) : null}
        {empty ? (
          <EmptyState onAsk={ask} recentThreads={chat.threads} onOpenThread={chat.openThread} disabled={chat.busy} />
        ) : (
          <div className={styles.log} role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversación">
            {messages.map((message, index) =>
              message.rol === "user" ? (
                <div key={index} className={styles.userRow}>
                  <p className={styles.userBubble}>{message.texto}</p>
                </div>
              ) : (
                <AssistantMessageView
                  key={index}
                  message={message}
                  onAsk={ask}
                  askDisabled={chat.busy}
                  onRetry={index === lastIndex && message.fallo ? chat.retry : undefined}
                />
              ),
            )}
            {chat.turn.status === "streaming" ? (
              <LiveTurnView progress={chat.turn.progress} onAsk={ask} onCancel={chat.cancel} />
            ) : null}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <Composer busy={chat.busy} onSend={ask} onCancel={chat.cancel} showIntents={!empty} />
    </section>
  );
}
