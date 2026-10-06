"use client";
// El asistente como estado de React: los hilos guardados, la respuesta que está
// llegando y las acciones (enviar, cancelar, reintentar, cambiar de hilo).
//
// Las dependencias con efectos (almacenamiento, red, reloj, ids) se inyectan:
// así la vista se prueba con un stream simulado y un almacenamiento en memoria.
// Algo más de 150 líneas: es un solo estado (hilos + turno) con sus acciones, y
// partirlo obligaría a sincronizar dos hooks sobre el mismo almacén.
import { useCallback, useEffect, useRef, useState } from "react";

import type { HttpFetch } from "@/app/lib/analitica/client";
import { messageFromTurn, toWireHistory, userMessage } from "@/app/lib/asistente/messages";
import { streamChat } from "@/app/lib/asistente/stream";
import {
  loadThreadStore,
  saveThreadStore,
  type StorageAccess,
} from "@/app/lib/asistente/threadStorage";
import {
  EMPTY_STORE,
  activeThread,
  appendMessage,
  dropFailedAnswer,
  removeThread,
  selectThread,
  startThread,
  type Thread,
  type ThreadStore,
} from "@/app/lib/asistente/threads";
import { IDLE_TURN, beginTurn, turnReducer, type TurnState } from "@/app/lib/asistente/turnReducer";

export type AssistantChatDeps = {
  readonly storage?: StorageAccess;
  readonly httpFetch?: HttpFetch;
  readonly now?: () => number;
  readonly newId?: () => string;
};

export type AssistantChat = {
  readonly threads: readonly Thread[];
  readonly thread: Thread | null;
  readonly turn: TurnState;
  readonly busy: boolean;
  /** Aviso sobre el historial guardado (ilegible, sin espacio, bloqueado). */
  readonly storageNotice: string | null;
  /** `context` solo se usa si la pregunta abre un hilo nuevo. */
  readonly send: (text: string, context: string) => void;
  readonly cancel: () => void;
  readonly retry: () => void;
  readonly newThread: () => void;
  readonly openThread: (threadId: string) => void;
  readonly deleteThread: (threadId: string) => void;
};

const browserStorage: StorageAccess = () => window.localStorage;
const wallClock = () => Date.now();
const randomId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function useAssistantChat({
  storage = browserStorage,
  httpFetch,
  now = wallClock,
  newId = randomId,
}: AssistantChatDeps = {}): AssistantChat {
  const [store, setStore] = useState<ThreadStore>(EMPTY_STORE);
  const [hydrated, setHydrated] = useState(false);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const [turn, setTurn] = useState<TurnState>(IDLE_TURN);
  // Espejo síncrono del almacén: un turno largo lee y escribe el hilo después
  // de varios `await`, y el valor del render en que empezó ya es viejo.
  const storeRef = useRef(store);
  const abortRef = useRef<AbortController | null>(null);

  const commit = useCallback((update: (current: ThreadStore) => ThreadStore) => {
    const next = update(storeRef.current);
    storeRef.current = next;
    setStore(next);
  }, []);

  useEffect(() => {
    const loaded = loadThreadStore(storage);
    storeRef.current = loaded.store;
    setStore(loaded.store);
    setStorageNotice(loaded.notice);
    setHydrated(true);
  }, [storage]);

  // Guardar recién después de cargar: antes, `store` es el vacío inicial y
  // escribirlo borraría el historial que todavía no se leyó.
  useEffect(() => {
    if (!hydrated) return;
    const saved = saveThreadStore(storage, store);
    if (!saved.ok) setStorageNotice(saved.notice);
  }, [hydrated, storage, store]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const runTurn = useCallback(
    async (threadId: string) => {
      const thread = storeRef.current.threads.find((candidate) => candidate.id === threadId);
      if (!thread || abortRef.current) return;
      const controller = new AbortController();
      abortRef.current = controller;
      let state = beginTurn();
      setTurn(state);
      const request = { messages: toWireHistory(thread.messages), context: thread.context };
      for await (const event of streamChat(request, controller.signal, { httpFetch })) {
        state = turnReducer(state, event);
        setTurn(state);
      }
      abortRef.current = null;
      const answer = messageFromTurn(state);
      if (answer) commit((current) => appendMessage(current, threadId, answer, now()));
      setTurn(IDLE_TURN);
    },
    [commit, httpFetch, now],
  );

  const send = useCallback(
    (text: string, context: string) => {
      const question = text.trim();
      if (!question || abortRef.current) return;
      const current = activeThread(storeRef.current);
      const threadId = current?.id ?? newId();
      commit((latest) =>
        current
          ? appendMessage(latest, threadId, userMessage(question), now())
          : startThread(latest, { id: threadId, question, context, now: now() }),
      );
      void runTurn(threadId);
    },
    [commit, newId, now, runTurn],
  );

  const retry = useCallback(() => {
    const current = activeThread(storeRef.current);
    if (!current || abortRef.current) return;
    const withoutFailure = dropFailedAnswer(storeRef.current, current.id);
    if (!withoutFailure) return;
    commit(() => withoutFailure);
    void runTurn(current.id);
  }, [commit, runTurn]);

  const cancel = useCallback(() => abortRef.current?.abort(), []);
  const newThread = useCallback(() => commit((current) => selectThread(current, null)), [commit]);
  const openThread = useCallback(
    (threadId: string) => commit((current) => selectThread(current, threadId)),
    [commit],
  );
  const deleteThread = useCallback(
    (threadId: string) => commit((current) => removeThread(current, threadId)),
    [commit],
  );

  return {
    threads: store.threads,
    thread: activeThread(store),
    turn,
    busy: turn.status === "streaming",
    storageNotice,
    send,
    cancel,
    retry,
    newThread,
    openThread,
    deleteThread,
  };
}
