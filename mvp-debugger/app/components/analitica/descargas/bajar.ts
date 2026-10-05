// Bajar un archivo del proxy con feedback: lectura por stream (bytes recibidos),
// cancelación y el error del servicio en palabras. Un <a download> no avisa nada
// mientras el servidor arma el archivo y esconde los errores.

export type Bajada = { archivo: string; bytes: number; cabeceras: Headers };

const VIDA_URL_MS = 60_000;

async function motivo(r: Response): Promise<string> {
  const d = await r.json().catch(() => ({}));
  return d?.detail || d?.error || `el servicio respondió ${r.status}`;
}

function guardar(partes: BlobPart[], tipo: string, archivo: string) {
  const href = URL.createObjectURL(new Blob(partes, { type: tipo }));
  const a = document.createElement("a");
  a.href = href;
  a.download = archivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), VIDA_URL_MS);
}

export async function bajarArchivo(
  url: string,
  opciones: { signal?: AbortSignal; porDefecto: string; alRecibir?: (bytes: number) => void },
): Promise<Bajada> {
  const r = await fetch(url, { signal: opciones.signal, cache: "no-store" });
  if (!r.ok) throw new Error(await motivo(r));
  const partes: BlobPart[] = [];
  let bytes = 0;
  if (r.body) {
    const lector = r.body.getReader();
    for (;;) {
      const { value, done } = await lector.read();
      if (done) break;
      if (value) {
        partes.push(value);
        bytes += value.byteLength;
        opciones.alRecibir?.(bytes);
      }
    }
  } else {
    const b = await r.blob();
    partes.push(b);
    bytes = b.size;
  }
  const nombre = /filename="?([^";]+)"?/.exec(r.headers.get("content-disposition") || "");
  const archivo = nombre ? nombre[1] : opciones.porDefecto;
  guardar(partes, r.headers.get("content-type") || "application/octet-stream", archivo);
  return { archivo, bytes, cabeceras: r.headers };
}
