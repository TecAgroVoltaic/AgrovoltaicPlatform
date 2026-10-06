// Lo que protege: que el historial guardado nunca rompa la sección (ilegible,
// bloqueado, sin espacio) y que cada uno de esos casos se AVISE.
import { describe, expect, it } from "vitest";

import {
  STORAGE_NOTICE,
  THREADS_STORAGE_KEY,
  loadThreadStore,
  saveThreadStore,
} from "@/app/lib/asistente/threadStorage";
import { EMPTY_STORE, MAX_STORED_THREADS, startThread, type ThreadStore } from "@/app/lib/asistente/threads";

function memoryStorage(initial: Record<string, string> = {}, quotaBytes = Infinity): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => data.get(key) ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => {
      if (value.length > quotaBytes) throw new DOMException("quota", "QuotaExceededError");
      data.set(key, value);
    },
  };
}

function storeWith(count: number): ThreadStore {
  let store = EMPTY_STORE;
  for (let index = 0; index < count; index += 1) {
    store = startThread(store, { id: `h${index}`, question: `pregunta ${index} ${"x".repeat(200)}`, context: "c", now: index });
  }
  return store;
}

describe("loadThreadStore", () => {
  it("sin nada guardado arranca vacío y sin aviso", () => {
    expect(loadThreadStore(() => memoryStorage())).toEqual({ store: EMPTY_STORE, notice: null });
  });

  it.each([
    ["JSON roto", "{roto"],
    ["otra forma", JSON.stringify({ version: 9, hilos: [] })],
  ])("con %s arranca vacío y lo avisa", (_case, raw) => {
    const loaded = loadThreadStore(() => memoryStorage({ [THREADS_STORAGE_KEY]: raw }));
    expect(loaded).toEqual({ store: EMPTY_STORE, notice: STORAGE_NOTICE.unreadable });
  });

  it("si el navegador bloquea el almacenamiento lo avisa en vez de romper", () => {
    const loaded = loadThreadStore(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(loaded.notice).toBe(STORAGE_NOTICE.unavailable);
  });

  it("lo guardado vuelve igual", () => {
    const storage = memoryStorage();
    const store = storeWith(2);
    expect(saveThreadStore(() => storage, store)).toEqual({ ok: true });
    expect(loadThreadStore(() => storage).store).toEqual(store);
  });
});

describe("saveThreadStore", () => {
  it("sin espacio para todo, conserva el hilo activo y lo avisa", () => {
    // Given una cuota que alcanza para un hilo pero no para tres
    const storage = memoryStorage({}, 600);
    const store = storeWith(3);
    // When se guarda
    const saved = saveThreadStore(() => storage, store);
    // Then queda solo el activo, con aviso
    expect(saved).toEqual({ ok: false, notice: STORAGE_NOTICE.trimmed });
    expect(loadThreadStore(() => storage).store.threads.map((thread) => thread.id)).toEqual([store.activeId]);
  });
});

describe("startThread", () => {
  it(`no guarda más de ${MAX_STORED_THREADS} hilos: sale el menos reciente`, () => {
    const store = storeWith(MAX_STORED_THREADS + 1);
    expect(store.threads).toHaveLength(MAX_STORED_THREADS);
    expect(store.threads.some((thread) => thread.id === "h0")).toBe(false);
  });
});
