import { MODO } from "@/app/components/console/modos";

/** Qué color es cada tipo de nodo del lienzo, y cómo se lo explora. */
export function LeyendaLienzo() {
  return (
    <div className="arq-leyenda">
      <span><i style={{ background: "var(--ceil)" }} /> entrada / servidor</span>
      <span><i style={{ background: "var(--warn)" }} /> puerta de acceso</span>
      <span><i style={{ background: "var(--accent)" }} /> el modelo</span>
      <span><i style={{ background: "var(--pred)" }} /> herramienta {MODO.medicion_visible.etiqueta}</span>
      <span><i style={{ background: "var(--real)" }} /> herramienta {MODO.medicion_oculta.etiqueta}</span>
      <span><i style={{ background: "var(--muted)" }} /> cálculo y datos</span>
      <span className="arq-ayuda">Pasá el mouse para el resumen · hacé clic para el detalle</span>
    </div>
  );
}
