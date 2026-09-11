// Proxy generico hacia un servicio Python. Responsabilidad unica: reenviar el
// request (metodo + query + body) al upstream, inyectar la x-api-key del lado
// servidor y devolver la respuesta tal cual. Un unico punto -> DRY para las dos
// rutas catch-all (/api/analizador/* y /api/pronostico/*).
//
// El cuerpo se reenvia como STREAM de bytes, no como texto: las descargas
// (/datos/exportar) pueden ser binarias (.mat) y grandes (cientos de MB de CSV);
// leerlas a texto las corromperia y las cargaria enteras en memoria.
import type { Servicio } from "@/app/lib/config";

// Headers de la respuesta que tienen sentido de cara al browser. El resto
// (server, date, connection…) es del upstream y no se propaga.
const HEADERS_RESPUESTA = ["content-type", "content-disposition", "content-length"];

export async function proxy(
  svc: Servicio,
  path: string[],
  req: Request,
): Promise<Response> {
  const search = new URL(req.url).search; // conserva ?tabla=...&limit=...
  const target = `${svc.url}/${path.join("/")}${search}`;

  const headers: Record<string, string> = {};
  if (svc.key) headers["x-api-key"] = svc.key;

  const init: RequestInit = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    headers["content-type"] = "application/json";
    init.body = await req.text();
  }

  try {
    const r = await fetch(target, init);
    const out = new Headers();
    for (const h of HEADERS_RESPUESTA) {
      const v = r.headers.get(h);
      if (v) out.set(h, v);
    }
    if (!out.has("content-type")) out.set("content-type", "application/json");
    return new Response(r.body, { status: r.status, headers: out });
  } catch (e: any) {
    // El servicio Python esta caido / inalcanzable: 502 legible (no un stack).
    return new Response(
      JSON.stringify({ error: `servicio inaccesible: ${e?.message || e}`, target }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }
}
