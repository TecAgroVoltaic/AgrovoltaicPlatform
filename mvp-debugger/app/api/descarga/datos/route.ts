// Descarga de archivos del Agente Histórico (`GET /exportar/datos`).
//
// POR QUÉ ESTA RUTA EXISTE APARTE DE `/api/historico/[...path]`:
// aquel proxy hace `await r.text()` y reenvía SOLO `content-type`. Las dos cosas
// son correctas para JSON y letales para un archivo:
//   1. `text()` decodifica los bytes como UTF-8 y reemplaza por U+FFFD toda
//      secuencia inválida. Un `.mat` (binario) sale corrupto y ni abre.
//   2. Sin `content-disposition` el navegador no sabe que es un adjunto ni cómo
//      se llama, así que hasta un `.csv` se abriría en pantalla.
// Arreglar aquel proxy en vez de duplicarlo era la otra opción, y se descartó:
// sirve a las cinco vistas de análisis y no hay razón para tocarlo por un caso
// que no comparte ni el cuerpo ni las cabeceras.
//
// Es una ruta ESTRECHA (un solo endpoint) y no un catch-all a propósito: un
// `[...path]` abriría un segundo camino hacia cualquier ruta del servicio,
// saltándose el gate conversacional que sí aplica el proxy de /api/historico.
import { HISTORICO } from "@/app/lib/config";

export const dynamic = "force-dynamic";

/** Única ruta del servicio que devuelve un archivo y no JSON. */
const UPSTREAM_PATH = "/exportar/datos";
const BAD_GATEWAY = 502;

/** Lo que decide cómo se guarda el archivo. `content-disposition` es la que el
 *  proxy de JSON pierde, y sin ella la descarga se abre en pantalla. */
const FORWARDED_HEADERS = ["content-type", "content-disposition", "content-length"] as const;

export async function GET(req: Request): Promise<Response> {
  const target = `${HISTORICO.url}${UPSTREAM_PATH}${new URL(req.url).search}`;
  const headers: Record<string, string> = {};
  if (HISTORICO.key) headers["x-api-key"] = HISTORICO.key;

  try {
    const upstream = await fetch(target, { method: "GET", headers, cache: "no-store" });
    // `upstream.body` se reenvía SIN decodificar: los bytes pasan tal cual, que
    // es toda la razón de ser de esta ruta. Además va en streaming, así que una
    // exportación de 95.000 filas no se copia entera en memoria del servidor.
    return new Response(upstream.body, {
      status: upstream.status,
      headers: forwarded(upstream.headers),
    });
  } catch (error) {
    // El servicio Python está caído: 502 legible en vez de un stack. El cuerpo
    // es JSON aunque la ruta sirva archivos, porque un fallo NO es un archivo.
    const detail = error instanceof Error ? error.message : String(error);
    return Response.json({ error: `servicio inaccesible: ${detail}`, target }, { status: BAD_GATEWAY });
  }
}

function forwarded(source: Headers): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = source.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}
