"use client";
// Lectura del agente sobre el momento que se está viendo.
//
// Esta tarjeta es el único lugar de la vista donde aparece una PREDICCIÓN, y es
// deliberado: el gráfico muestra el terreno (lo medido y el techo físico), y la
// predicción se calcula cuando la pedís.
//
// Dos cosas que conviene no confundir:
//  - PROCEDENCIA: el número lo produce una herramienta determinista y auditable,
//    no la intuición del modelo. Por eso se muestran las cifras crudas, los
//    parámetros con que se la llamó y la traza.
//  - RESPONSABILIDAD: aun así, la predicción es DEL AGENTE. El prompt le pide
//    hablar en primera persona y hacerse cargo. Si se despegara ("el algoritmo
//    dijo X, yo solo lo cuento") no tendría que explicar por qué se equivocó, y
//    justamente esa explicación es lo único que aporta sobre las cifras.
//
// Orden: (1) lo que calculó la herramienta, en cifras; (2) el análisis del
// agente; (3) cómo llegó ahí. Y un sello que compara las cifras que recibió el
// agente con las que dibuja el gráfico: si no coinciden, está hablando de otros
// datos y hay que verlo.
//
// Al agente se le manda la PREGUNTA, nunca los números: pasárselos en el prompt
// lo convertiría en un redactor de datos que no verificó.
//
// Las piezas viven en `lectura/`: el turno del agente en un hook, las cifras de
// la traza en `resultados.ts` y cada bloque de la tarjeta en su componente.
import { renderMd } from "@/app/lib/markdown";
import { IconoTexto } from "@/app/components/Iconos";
import { MEDICION_VISIBLE, MODO } from "@/app/components/console/modos";
import { BloqueAlgoritmo } from "@/app/components/console/lectura/BloqueAlgoritmo";
import { TOLERANCIA } from "@/app/components/console/lectura/formato";
import { PieLectura } from "@/app/components/console/lectura/PieLectura";
import type { LecturaAgenteProps } from "@/app/components/console/lectura/props";
import { resultados } from "@/app/components/console/lectura/resultados";
import { useLecturaAgente } from "@/app/components/console/lectura/useLecturaAgente";
import { Veredicto } from "@/app/components/console/lectura/Veredicto";

export function LecturaAgente({ pregunta, contexto, esperado,
                                modo = MEDICION_VISIBLE, revelar }: LecturaAgenteProps) {
  const {
    respuesta, pasos, usage, ms, costo, cargando, error, verTraza, setVerTraza,
    revelado, errRevelar, oculta, analizar,
  } = useLecturaAgente({ pregunta, contexto, modo, revelar });
  const vocab = MODO[modo];
  const res = resultados(pasos);

  // ¿El agente vio los mismos números que dibuja el gráfico? Con la medición oculta no
  // aplica: el agente NO vio lo medido, y ese es justamente el punto.
  const primero = res[0];
  const coincide = !oculta && primero && esperado && primero.real != null && primero.pred != null
    ? Math.abs(primero.real - esperado.real) <= TOLERANCIA
      && Math.abs(primero.pred - esperado.pred) <= TOLERANCIA
    : null;

  return (
    <div className="card lectura">
      <div className="lectura-head">
        <div>
          <h3>{oculta ? "El agente predice sin ver la medición" : "El agente evalúa el método"}</h3>
          <p className="hint">
            {oculta ? (<>
              El agente <b>no puede ver</b> lo que midió el sensor: el servicio le quita del juego
              la única herramienta que lo revela. Se compromete primero; la consola consulta el
              sensor después, ya con su respuesta en la mano.
            </>) : (<>
              El agente <b>sí puede ver</b> lo que midió el sensor. Acá no se demuestra que predice:
              se juzga el método. El número lo produce una herramienta determinista (abajo se ve
              cuál y con qué parámetros) y el agente lo asume como propio, lo justifica y lo critica.
            </>)}
          </p>
        </div>
        <button className="btn" onClick={analizar} disabled={cargando}>
          {cargando ? vocab.gerundio : respuesta ? "Volver a intentar" : vocab.verbo}
        </button>
      </div>

      {error && <p className="hint" style={{ color: "var(--crit)" }}>{error}</p>}
      {cargando && !respuesta && (
        <div className="lectura-espera">
          <span className="chat-dots"><i /><i /><i /></span>
          {oculta ? "Diagnosticando el cielo, midiendo el riesgo y comprometiéndose…"
                   : "Reconstruyendo el método, comparándolo contra lo medido y redactando…"}
        </div>
      )}

      {!oculta && res.map((r, i) => (
        <BloqueAlgoritmo key={i} r={r} coincide={i === 0 ? coincide : null} />
      ))}

      {respuesta && (
        <section className="bloq bloq-agente">
          <header className="bloq-h">
            <span className="bloq-ic bloq-ic-agente"><IconoTexto size={15} /></span>
            <span className="bloq-t">Lo que dijo el agente</span>
          </header>
          <div className="md" dangerouslySetInnerHTML={{ __html: renderMd(respuesta) }} />
        </section>
      )}

      {/* La REVELACIÓN. La hace la consola, no el agente: él ya se comprometió y
          no puede volver atrás. Por eso el veredicto se calcula acá, con el
          número que él dio y el que registró el sensor, y no se le pregunta. */}
      {oculta && respuesta && revelar && (revelado || errRevelar) && (
        <section className="bloq bloq-revelar">
          {typeof revelado === "object" && revelado ? (
            <Veredicto pred={primero?.pred ?? null} real={revelado.real}
                       unidad={revelar.unidad} dec={revelar.dec ?? 1} />
          ) : (
            <p className="hint">
              {errRevelar ? <>No se pudo consultar lo que midió el sensor: {errRevelar}</>
                          : "Consultando lo que midió el sensor…"}
            </p>
          )}
        </section>
      )}

      {respuesta && (
        <PieLectura
          pasos={pasos} usage={usage} ms={ms} costo={costo}
          verTraza={verTraza} onVerTraza={() => setVerTraza((v) => !v)}
        />
      )}
    </div>
  );
}
