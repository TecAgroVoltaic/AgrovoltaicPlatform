"use client";
// La sección Asistente: un chat a pantalla completa con el Agente Histórico,
// que responde en vivo por `POST /chat/stream` y pinta los gráficos y las
// descargas que arman sus tools.
//
// La vista no calcula nada: compone lo que llega del stream con las primitivas
// de gráfico y el hook de descargas que ya usan las demás vistas.
import { useEffect, useRef } from "react";

import { AssistantMessageView } from "@/app/components/asistente/AssistantMessageView";
import { Composer } from "@/app/components/asistente/Composer";
import { EmptyState } from "@/app/components/asistente/EmptyState";
import { LiveTurnView } from "@/app/components/asistente/LiveTurnView";
import { ThreadBar } from "@/app/components/asistente/ThreadBar";
import styles from "@/app/components/asistente/asistente.module.css";
import { useDateRange } from "@/app/lib/analitica/useDateRange";
import { buildRangeContext } from "@/app/lib/asistente/context";
import { useAssistantChat, type AssistantChatDeps } from "@/app/lib/asistente/useAssistantChat";

export function AssistantView({ deps }: { deps?: AssistantChatDeps }) {
  const { range } = useDateRange();
  const chat = useAssistantChat(deps);
  const endRef = useRef<HTMLDivElement>(null);
  const messages = chat.thread?.messages ?? [];
  const lastIndex = messages.length - 1;

  const ask = (question: string) => chat.send(question, buildRangeContext(range));

  // Bajar al final cuando entra un mensaje o arranca/termina una respuesta, no
  // con cada fragmento de texto: eso le arrancaría la pantalla a quien está
  // leyendo más arriba mientras la respuesta llega.
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length, chat.turn.status]);

  return (
    <section className={styles.view} aria-label="Asistente analítico">
      <ThreadBar
        threads={chat.threads}
        active={chat.thread}
        busy={chat.busy}
        onOpen={chat.openThread}
        onNew={chat.newThread}
        onDelete={chat.deleteThread}
      />
      {chat.storageNotice ? (
        <p className={styles.notice} role="status">
          {chat.storageNotice}
        </p>
      ) : null}

      <div className={styles.log} role="log" aria-live="polite" aria-relevant="additions">
        {messages.length === 0 && !chat.busy ? <EmptyState onAsk={ask} /> : null}
        {messages.map((message, index) =>
          message.rol === "user" ? (
            <p key={index} className={styles.user}>
              {message.texto}
            </p>
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
        {chat.turn.status === "streaming" ? <LiveTurnView progress={chat.turn.progress} onAsk={ask} /> : null}
        <div ref={endRef} />
      </div>

      <Composer busy={chat.busy} onSend={ask} onCancel={chat.cancel} />
    </section>
  );
}
