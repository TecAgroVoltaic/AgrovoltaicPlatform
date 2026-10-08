"use client";
// El selector de rango: la pieza central del sistema (Fig. 3 del PDF).
//
// Es la barra del cascarón alrededor de `RangeForm`. El formulario vive aparte
// porque tiene una segunda casa: el chip de contexto del Asistente, que no
// muestra esta barra y abre el mismo formulario en un desplegable.
import { RangeForm } from "@/app/components/analitica/RangeForm";

const FIELD_ID_PREFIX = "rango";

export function RangeSelector() {
  return (
    <section className="rng" aria-labelledby="rango-titulo">
      {/* Rótulo y no <h2>: la barra se pinta ANTES del título de la página, y un
          encabezado acá dejaría el orden de lectura con un h2 delante del h1. */}
      <p id="rango-titulo" className="lbl">
        Rango de análisis
      </p>
      <RangeForm idPrefix={FIELD_ID_PREFIX} />
    </section>
  );
}
