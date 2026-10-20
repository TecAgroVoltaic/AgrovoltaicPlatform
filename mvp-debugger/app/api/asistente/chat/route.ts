// El chat del asistente con su motor elegido del lado servidor (`engine.ts`).
// Los dos motores responden con los MISMOS eventos SSE (`inicio`, `texto`,
// `tool_inicio`, `paso`, `fin`, `error`): la interfaz no sabe cuál contestó.
//
//   plataforma -> se reenvía tal cual a `/chat/stream` del Agente Histórico
//   flow       -> agente de Visione Flow, traducido por `lib/asistente/flow`
//
// El gate de sesión lo pone `middleware.ts` (cubre /api/*). El interruptor
// `AGENTE_HISTORICO` corta las dos puertas: las dos gastan tokens.
import { NextResponse, type NextRequest } from "next/server";

import { MSG_BLOQUEADO, historicoActivo } from "@/app/lib/agentes";
import { HISTORICO } from "@/app/lib/config";
import { ENGINE_COOKIE, resolveEngine } from "@/app/lib/asistente/engine";
import { flowChat } from "@/app/lib/asistente/flow/flowChat";
import { proxy } from "@/app/lib/upstream";

export const dynamic = "force-dynamic";

const PLATFORM_CHAT_PATH = ["chat", "stream"];
const STATUS_BLOCKED = 503;
/** Qué motor contestó, para comparar los dos en las pruebas. No es un secreto. */
const ENGINE_HEADER = "x-asistente-motor";

export async function POST(req: NextRequest) {
  if (!historicoActivo()) return NextResponse.json({ error: MSG_BLOQUEADO }, { status: STATUS_BLOCKED });
  const engine = resolveEngine(req.cookies.get(ENGINE_COOKIE)?.value);
  const response = engine === "flow" ? await flowChat(req) : await proxy(HISTORICO, PLATFORM_CHAT_PATH, req);
  response.headers.set(ENGINE_HEADER, engine);
  return response;
}
