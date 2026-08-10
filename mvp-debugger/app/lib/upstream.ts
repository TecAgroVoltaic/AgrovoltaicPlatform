// Proxy generico hacia un servicio Python. Responsabilidad unica: reenviar el
// request (metodo + query + body) al upstream, inyectar la x-api-key del lado
// servidor y devolver la respuesta tal cual. Un unico punto -> DRY para las dos
// rutas catch-all (/api/analizador/* y /api/pronostico/*).
import type { Servicio } from "@/app/lib/config";

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
    const body = await r.text();
    return new Response(body, {
      status: r.status,
      headers: { "content-type": r.headers.get("content-type") || "application/json" },
    });
  } catch (e: any) {
    // El servicio Python esta caido / inalcanzable: 502 legible (no un stack).
    return new Response(
      JSON.stringify({ error: `servicio inaccesible: ${e?.message || e}`, target }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }
}
