"use client";
// Frontera de error de la sección de análisis: si una vista revienta, se cae la
// vista y no la aplicación entera. El rango y la navegación siguen en pie, así
// que se puede cambiar de sección sin recargar.
import { useEffect } from "react";

export default function ErrorSeccion({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Registrar y no tragar: sin esto, el fallo desaparece sin dejar rastro.
    console.error("fallo en la sección de análisis", error);
  }, [error]);

  return (
    <div className="alert" role="alert">
      <div>
        <strong>Esta sección no se pudo mostrar.</strong> {error.message}
      </div>
      {error.digest ? <div className="muted small">Referencia: {error.digest}</div> : null}
      <button className="btn-sm" style={{ marginTop: 8 }} type="button" onClick={reset}>
        Reintentar
      </button>
    </div>
  );
}
