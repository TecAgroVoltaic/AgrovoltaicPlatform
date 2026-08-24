// Catch-all proxy del Comparador. Cubre /calidad/*, /cielo, /reporte y /health.
//
// Solo GET: el Comparador no recibe nada de la consola. La detección corre por
// lotes (`python -m comparador todo`) y deja los hallazgos en la base; este
// servicio únicamente los sirve. Si la consola pudiera disparar el barrido, cada
// visita a la pantalla recorrería los 274 días y el resultado dependería de quién
// mire y cuándo. No hay POST que exponer, así que no se expone.
import { proxy } from "@/app/lib/upstream";
import { COMPARADOR } from "@/app/lib/config";

export const dynamic = "force-dynamic";

type Ctx = { params: { path: string[] } };

export async function GET(req: Request, { params }: Ctx) {
  return proxy(COMPARADOR, params.path, req);
}
