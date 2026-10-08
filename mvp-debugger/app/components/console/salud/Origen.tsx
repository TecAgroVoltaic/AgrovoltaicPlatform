import { nfmt } from "@/app/lib/client";
import { Dato } from "./Dato";
import { fecha } from "./formato";
import type { Panel } from "./tipos";

/** De dónde sale cada cosa. Fuente y store se confunden todo el tiempo. */
export function Origen({ panel }: { panel: Panel }) {
  const { fuente, store } = panel;
  return (
    <div className="sal-cols">
      <div className="card">
        <h3>De dónde se leen los datos</h3>
        <p className="hint">La fuente del ETL. Es lo que alimenta al agente.</p>
        {!fuente || fuente.error ? (
          <p className="small muted">No se pudo determinar ({fuente?.error || "sin dato"}).</p>
        ) : (
          <>
            <div className="sal-rejilla">
              <Dato k="tipo" v={<b>{fuente.etiqueta}</b>} mono={false} />
              <Dato k="dirección" v={`${fuente.host ?? "?"}:${fuente.puerto ?? "?"}`} />
              <Dato k="base" v={fuente.base ?? "—"} />
              <Dato k="configurada en" v={fuente.definida_en} />
              <Dato
                k="¿avanza?"
                v={fuente.es_snapshot === null
                  ? "no se sabe"
                  : fuente.es_snapshot ? "no, es una foto fija" : "sí, es la base viva"}
                mono={false}
              />
            </div>
            <p className="note">
              <b>Cómo se dedujo.</b> {fuente.criterio} Es una inferencia, no algo que
              la base declare: si alguien cambia la topología, esto puede quedar viejo.
            </p>
            {fuente.targets && fuente.targets.length > 0 && (
              <p className="small muted">
                Se le piden {fuente.targets.length} cajas:{" "}
                <span className="mono">{fuente.targets.map((t) => t.caja).join(" · ")}</span>
              </p>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h3>Dónde se guardan</h3>
        <p className="hint">El store propio del agente. Es de acá que lee el pronóstico.</p>
        {!store ? <p className="small muted">Sin dato.</p> : (
          <div className="sal-rejilla">
            <Dato k="qué es" v={<b>{store.etiqueta || "Store del agente"}</b>} mono={false} />
            <Dato k="dirección" v={`${store.host ?? "?"}:${store.puerto ?? "?"}`} />
            <Dato k="base" v={store.base ?? "—"} />
          </div>
        )}
        {panel.ultima_prediccion && (
          <p className="small muted" style={{ marginTop: 12 }}>
            Última predicción guardada: {nfmt(panel.ultima_prediccion.valor_esperado, 1)}{" "}
            {panel.ultima_prediccion.unidad} de {panel.ultima_prediccion.variable},{" "}
            {fecha(panel.ultima_prediccion.creado_en)}
          </p>
        )}
      </div>
    </div>
  );
}
