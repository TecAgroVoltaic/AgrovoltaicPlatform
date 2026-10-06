// Persistencia de los hilos en localStorage.
//
// Clave propia (`agrov-asistente`) y no la `agrov-chat` del widget: cada
// respuesta guarda sus pasos con los datos de los gráficos (hasta 2.000 puntos
// por serie), y compartir la cuota de 5 MB haría que llenar una sección borre
// la otra. Los mensajes sí siguen el esquema del widget (`{rol, texto, traza}`).
//
// Todo lo que viene del almacenamiento se valida: lo escribió otra versión de
// la consola, u otra pestaña, o alguien a mano.
import { EMPTY_STORE, storeSchema, type ThreadStore } from "@/app/lib/asistente/threads";

export const THREADS_STORAGE_KEY = "agrov-asistente";

export type StorageAccess = () => Storage;

export type LoadResult = { readonly store: ThreadStore; readonly notice: string | null };

export const STORAGE_NOTICE = {
  unreadable: "El historial guardado en este navegador no se pudo leer y se empezó uno nuevo.",
  unavailable: "Este navegador no permite guardar el historial: la conversación se pierde al recargar.",
  trimmed: "El historial no entraba en el almacenamiento del navegador: se conservó solo la conversación actual.",
} as const;

export function loadThreadStore(storage: StorageAccess): LoadResult {
  let raw: string | null;
  try {
    raw = storage().getItem(THREADS_STORAGE_KEY);
  } catch {
    // El acceso mismo puede lanzar (navegación privada, cookies bloqueadas):
    // no es un error del programa, es una condición del navegador y se avisa.
    return { store: EMPTY_STORE, notice: STORAGE_NOTICE.unavailable };
  }
  if (raw === null) return { store: EMPTY_STORE, notice: null };
  const parsed = storeSchema.safeParse(safeJson(raw));
  return parsed.success
    ? { store: parsed.data, notice: null }
    : { store: EMPTY_STORE, notice: STORAGE_NOTICE.unreadable };
}

export type SaveResult = { readonly ok: true } | { readonly ok: false; readonly notice: string };

/** Guarda; si no entra, reintenta con solo el hilo activo antes de rendirse. */
export function saveThreadStore(storage: StorageAccess, store: ThreadStore): SaveResult {
  if (tryWrite(storage, store)) return { ok: true };
  const activeOnly: ThreadStore = {
    ...store,
    threads: store.threads.filter((thread) => thread.id === store.activeId),
  };
  if (activeOnly.threads.length < store.threads.length && tryWrite(storage, activeOnly)) {
    return { ok: false, notice: STORAGE_NOTICE.trimmed };
  }
  return { ok: false, notice: STORAGE_NOTICE.unavailable };
}

function tryWrite(storage: StorageAccess, store: ThreadStore): boolean {
  try {
    storage().setItem(THREADS_STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    // Cuota llena o almacenamiento bloqueado: quien llama decide qué hacer y
    // lo avisa en pantalla.
    return false;
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    // JSON roto cae en la validación del esquema como "ilegible", con aviso.
    return null;
  }
}
