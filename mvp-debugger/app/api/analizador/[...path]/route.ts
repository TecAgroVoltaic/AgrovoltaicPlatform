// Catch-all proxy del analizador PV. Cubre /preguntar, /chat, /datos/*, /uso,
// /health -> mismo reenvio con la key inyectada.
//
// Bloqueo del agente historico: se aplica ACA, no solo escondiendo botones. La
// UI se puede saltar con un fetch a mano, y cada request al analizador consulta
// la Supabase PV y —en /preguntar y /chat— gasta tokens del LLM. Esconder el
// boton no es bloquear; cortar la puerta si.
import { NextResponse } from "next/server";

import { proxy } from "@/app/lib/upstream";
import { ANALIZADOR } from "@/app/lib/config";
import { MSG_BLOQUEADO, analizadorActivo } from "@/app/lib/agentes";

export const dynamic = "force-dynamic";

type Ctx = { params: { path: string[] } };

// 503 (no 404): el servicio existe y esta corriendo, lo que pasa es que esta
// deshabilitado a proposito. El cliente muestra `error` tal cual.
function bloqueado(): NextResponse {
  return NextResponse.json({ error: MSG_BLOQUEADO }, { status: 503 });
}

export async function GET(req: Request, { params }: Ctx) {
  if (!analizadorActivo()) return bloqueado();
  return proxy(ANALIZADOR, params.path, req);
}

export async function POST(req: Request, { params }: Ctx) {
  if (!analizadorActivo()) return bloqueado();
  return proxy(ANALIZADOR, params.path, req);
}
