// Catch-all proxy del Agente Histórico. Cubre /preguntar, /chat, /tool/*, /datos/*,
// /calidad/*, /arquitectura, /uso y /health: es UN solo servicio.
//
// El bloqueo del Q&A se aplica ACÁ, no solo escondiendo botones. La UI se puede
// saltar con un fetch a mano, y cada request de conversación gasta tokens del LLM.
// Esconder el botón no es bloquear; cortar la puerta sí.
//
// Lo que el flag NO bloquea son las lecturas de calidad y la arquitectura: son
// deterministas, no gastan un centavo, y son justamente lo que se está construyendo.
import { NextResponse } from "next/server";

import { proxy } from "@/app/lib/upstream";
import { HISTORICO } from "@/app/lib/config";
import { MSG_BLOQUEADO, historicoActivo } from "@/app/lib/agentes";

export const dynamic = "force-dynamic";

type Ctx = { params: { path: string[] } };

// Lo que cuesta tokens. El resto pasa siempre.
const CONVERSACIONAL = new Set(["preguntar", "chat"]);

// 503 (no 404): el servicio existe y está corriendo, lo que pasa es que esta
// puerta está deshabilitada a propósito. El cliente muestra `error` tal cual.
function bloqueado(): NextResponse {
  return NextResponse.json({ error: MSG_BLOQUEADO }, { status: 503 });
}

export async function GET(req: Request, { params }: Ctx) {
  return proxy(HISTORICO, params.path, req);
}

export async function POST(req: Request, { params }: Ctx) {
  if (CONVERSACIONAL.has(params.path[0]) && !historicoActivo()) return bloqueado();
  return proxy(HISTORICO, params.path, req);
}
