"use client";
// Última red: si el cascarón raíz revienta, React desmonta TODO y sin esto queda
// una pantalla blanca sin una palabra. Reemplaza al layout entero, así que tiene
// que traer su propio <html> y <body>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 32 }}>
        <h1 style={{ fontSize: 18 }}>La aplicación no pudo cargarse</h1>
        <p>{error.message}</p>
        {error.digest ? <p>Referencia: {error.digest}</p> : null}
        <button type="button" onClick={reset}>
          Reintentar
        </button>
      </body>
    </html>
  );
}
