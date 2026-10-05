"use client";
// Estados de carga / error / vacío de un bloque de la consola.
// Responsabilidad unica: decir QUE esta pasando cuando no hay datos que dibujar.
// No hace fetch ni conoce endpoints.

type Props = {
  cargando?: boolean;
  error?: string | null;
  vacio?: boolean;
  /** Qué se estaba cargando, para redactar el mensaje ("la serie", "los KPIs"). */
  que?: string;
  /** Si se pasa, se ofrece reintentar: casi todos estos fallos son transitorios. */
  onReintentar?: () => void;
  /** Pista extra para el caso vacío (p. ej. "probá otro período"). */
  pista?: string;
};

const TEXTO_CARGANDO = "cargando";

// El apagado programado no se pinta como un fallo: no hay nada que reintentar
// ni nadie a quien avisar. Se reconoce por el mensaje que redacta `mensajeError`.
const SENA_APAGADO = "está apagado";

export function Estado({ cargando, error, vacio, que = "los datos", onReintentar, pista }: Props) {
  if (cargando) {
    return <div className="muted loading">{TEXTO_CARGANDO} {que}…</div>;
  }
  if (error && error.includes(SENA_APAGADO)) {
    return (
      <div className="alert" style={{ borderColor: "var(--line2)" }}>
        <div><strong>Servidor apagado.</strong> {error}.</div>
        <div className="muted" style={{ marginTop: 6 }}>
          La documentación y el mapa del agente siguen disponibles.
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="alert">
        <div>No se pudieron cargar {que}: {error}</div>
        {onReintentar && (
          <button className="btn-sm" style={{ marginTop: 8 }} onClick={onReintentar}>
            Reintentar
          </button>
        )}
      </div>
    );
  }
  if (vacio) {
    return (
      <div className="muted loading">
        Sin datos para {que} en este rango.{pista ? ` ${pista}` : ""}
      </div>
    );
  }
  return null;
}

/** true si hay algo que dibujar. Evita repetir la condición en cada vista. */
export function hayDatos(lista: unknown): boolean {
  return Array.isArray(lista) && lista.length > 0;
}
