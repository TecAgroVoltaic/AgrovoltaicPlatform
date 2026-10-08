"use client";
// Los hilos guardados del asistente como estado de React: se cargan del
// almacenamiento al montar, se guardan en cada cambio, y `commit` los actualiza
// a través de un espejo síncrono que un turno largo puede leer tras sus `await`.
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";

import { loadThreadStore, saveThreadStore, type StorageAccess } from "@/app/lib/asistente/threadStorage";
import { EMPTY_STORE, type ThreadStore } from "@/app/lib/asistente/threads";

export type ThreadStoreState = {
  readonly store: ThreadStore;
  /** Espejo síncrono de `store`: el valor del render en que empezó un turno ya
   *  es viejo después de varios `await`. */
  readonly storeRef: MutableRefObject<ThreadStore>;
  readonly commit: (update: (current: ThreadStore) => ThreadStore) => void;
  /** Aviso sobre el historial guardado (ilegible, sin espacio, bloqueado). */
  readonly storageNotice: string | null;
};

export function useThreadStore(storage: StorageAccess): ThreadStoreState {
  const [store, setStore] = useState<ThreadStore>(EMPTY_STORE);
  const [hydrated, setHydrated] = useState(false);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const storeRef = useRef(store);

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

  return { store, storeRef, commit, storageNotice };
}
