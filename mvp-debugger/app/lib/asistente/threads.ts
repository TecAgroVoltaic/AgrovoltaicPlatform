// Los hilos del asistente: su forma y las operaciones puras sobre ellos. La
// persistencia vive en `threadStorage.ts`.
import { z } from "zod";

import { storedMessageSchema, type StoredMessage } from "@/app/lib/asistente/messages";

export const MAX_STORED_THREADS = 20;
const STORE_VERSION = 1;
const TITLE_MAX_LENGTH = 60;

const threadSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  /** El contexto con que se abrió el hilo (el rango de la vista en ese momento).
   * Se conserva: la conversación sigue hablando de ese período aunque después
   * se mueva el rango. */
  context: z.string(),
  updatedAt: z.number(),
  messages: z.array(storedMessageSchema),
});

export const storeSchema = z.object({
  version: z.literal(STORE_VERSION),
  activeId: z.string().nullable(),
  threads: z.array(threadSchema),
});

export type Thread = z.infer<typeof threadSchema>;
export type ThreadStore = z.infer<typeof storeSchema>;

export const EMPTY_STORE: ThreadStore = { version: STORE_VERSION, activeId: null, threads: [] };

export function activeThread(store: ThreadStore): Thread | null {
  return store.threads.find((thread) => thread.id === store.activeId) ?? null;
}

/** Hilo nuevo con su primera pregunta; los más viejos salen por el tope. */
export function startThread(
  store: ThreadStore,
  thread: { readonly id: string; readonly question: string; readonly context: string; readonly now: number },
): ThreadStore {
  const created: Thread = {
    id: thread.id,
    title: titleFrom(thread.question),
    context: thread.context,
    updatedAt: thread.now,
    messages: [{ rol: "user", texto: thread.question }],
  };
  return {
    ...store,
    activeId: created.id,
    threads: byRecency([created, ...store.threads]).slice(0, MAX_STORED_THREADS),
  };
}

export function appendMessage(
  store: ThreadStore,
  threadId: string,
  message: StoredMessage,
  now: number,
): ThreadStore {
  const updated = mapThread(store, threadId, (thread) => ({
    ...thread,
    updatedAt: now,
    messages: [...thread.messages, message],
  }));
  return { ...updated, threads: byRecency(updated.threads) };
}

/** Quita la respuesta fallida con que termina un hilo, para reintentar su
 * pregunta. `null` si el hilo no termina en un fallo: no hay nada que reintentar. */
export function dropFailedAnswer(store: ThreadStore, threadId: string): ThreadStore | null {
  const thread = store.threads.find((candidate) => candidate.id === threadId);
  const answer = thread?.messages.at(-1);
  if (answer?.rol !== "assistant" || !answer.fallo) return null;
  return mapThread(store, threadId, (current) => ({ ...current, messages: current.messages.slice(0, -1) }));
}

export function removeThread(store: ThreadStore, threadId: string): ThreadStore {
  return {
    ...store,
    activeId: store.activeId === threadId ? null : store.activeId,
    threads: store.threads.filter((thread) => thread.id !== threadId),
  };
}

export function selectThread(store: ThreadStore, threadId: string | null): ThreadStore {
  return { ...store, activeId: threadId };
}

function mapThread(store: ThreadStore, threadId: string, update: (thread: Thread) => Thread): ThreadStore {
  return {
    ...store,
    threads: store.threads.map((thread) => (thread.id === threadId ? update(thread) : thread)),
  };
}

/** El más reciente primero: es el orden del selector y el que decide cuál sale
 * cuando se llega al tope. */
function byRecency(threads: readonly Thread[]): Thread[] {
  return [...threads].sort((first, second) => second.updatedAt - first.updatedAt);
}

function titleFrom(question: string): string {
  const singleLine = question.replace(/\s+/g, " ").trim();
  return singleLine.length > TITLE_MAX_LENGTH ? `${singleLine.slice(0, TITLE_MAX_LENGTH - 1)}…` : singleLine;
}
