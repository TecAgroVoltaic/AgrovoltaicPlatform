"use client";
// Los hilos del chat flotante, uno por agente, persistidos en `localStorage`, y
// el envío de una pregunta con su frase de espera rotando.
import { useEffect, useState } from "react";

import type { Traza } from "@/app/components/TraceViewer";
import { jpost } from "@/app/lib/client";

import { CHAT_STORAGE_KEY, FRASES, PHRASE_ROTATION_MS } from "./constants";
import type { Msg, Threads } from "./types";

type ChatThreadsInput = { agent: string; contexto: string; onTraza?: (agent: string, t: Traza) => void };

export function useChatThreads({ agent, contexto, onTraza }: ChatThreadsInput) {
  const [threads, setThreads] = useState<Threads>({ historico: [], predictivo: [] });
  const [cargando, setCargando] = useState(false);
  const [frase, setFrase] = useState(0);
  const cur = threads[agent] || [];

  // Cargar hilos persistidos (una vez).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (raw) setThreads({ historico: [], predictivo: [], ...JSON.parse(raw) });
    } catch { /* ignore */ }
  }, []);
  // Persistir.
  useEffect(() => {
    try { localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(threads)); } catch { /* ignore */ }
  }, [threads]);
  // Rotar frases mientras espera.
  useEffect(() => {
    if (!cargando) return;
    const id = setInterval(() => setFrase((f) => (f + 1) % FRASES.length), PHRASE_ROTATION_MS);
    return () => clearInterval(id);
  }, [cargando]);

  /** Devuelve si la pregunta se aceptó (no vacía y sin otra en curso). */
  function enviar(texto: string): boolean {
    const t = texto.trim();
    if (!t || cargando) return false;
    const nuevo = [...cur, { rol: "user", texto: t } as Msg];
    setThreads((s) => ({ ...s, [agent]: nuevo }));
    setCargando(true);
    setFrase(0);
    void responder(nuevo);
    return true;
  }

  async function responder(nuevo: Msg[]) {
    const historial = nuevo.map((m) => ({ rol: m.rol, texto: m.texto }));
    const r = await jpost<Traza>(`/api/${agent}/chat`, { mensajes: historial, contexto });
    setCargando(false);
    if (!r.ok) {
      setThreads((s) => ({ ...s, [agent]: [...nuevo, { rol: "assistant", texto: `Error del servicio (HTTP ${r.status}). Reintentá en un momento.` } as Msg] }));
      return;
    }
    const traza = r.data;
    setThreads((s) => ({ ...s, [agent]: [...nuevo, { rol: "assistant", texto: traza.respuesta || "(sin respuesta)", traza } as Msg] }));
    onTraza?.(agent, traza);
  }

  const limpiar = () => setThreads((s) => ({ ...s, [agent]: [] }));

  return { mensajes: cur, cargando, frase: FRASES[frase], enviar, limpiar };
}
