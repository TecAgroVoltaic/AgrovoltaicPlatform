// Catch-all proxy del pronostico ambiental. Cubre /preguntar, /forecast,
// /anomalias, /serie, /health -> mismo reenvio con la key inyectada.
import { proxy } from "@/app/lib/upstream";
import { PRONOSTICO } from "@/app/lib/config";

export const dynamic = "force-dynamic";

type Ctx = { params: { path: string[] } };

export async function GET(req: Request, { params }: Ctx) {
  return proxy(PRONOSTICO, params.path, req);
}

export async function POST(req: Request, { params }: Ctx) {
  return proxy(PRONOSTICO, params.path, req);
}
