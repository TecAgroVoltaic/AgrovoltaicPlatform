// Catch-all proxy del analizador PV. Cubre /preguntar, /tool/x, /tools,
// /datos/*, /health -> todo pasa por el mismo reenvio con la key inyectada.
import { proxy } from "@/app/lib/upstream";
import { ANALIZADOR } from "@/app/lib/config";

export const dynamic = "force-dynamic";

type Ctx = { params: { path: string[] } };

export async function GET(req: Request, { params }: Ctx) {
  return proxy(ANALIZADOR, params.path, req);
}

export async function POST(req: Request, { params }: Ctx) {
  return proxy(ANALIZADOR, params.path, req);
}
