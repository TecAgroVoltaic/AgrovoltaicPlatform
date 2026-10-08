// Forma de los mensajes del chat flotante, por agente.
import type { Traza } from "@/app/components/TraceViewer";

export type Msg = { rol: "user" | "assistant"; texto: string; traza?: Traza };
export type Threads = Record<string, Msg[]>;
