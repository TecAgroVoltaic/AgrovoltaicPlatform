"use client";
// Predicción vs Real: una sola fecha manda sobre TODA la vista.
//
// Diseño: se elige día, momento y anticipación, y de ahí sale todo lo demás (la
// curva medido-vs-predicho, los tres números de ese momento y la lectura del
// agente). Antes había dos relojes independientes (una ventana de N días para el
// backtest y un instante suelto para el pronóstico anclado) que además hablaban
// en granularidades distintas: el gráfico en promedios horarios y los KPI en
// lecturas instantáneas. Los dos números eran ciertos y aun así se contradecían
// en pantalla, que es lo peor que puede pasar en una vista de validación.
//
// Ahora hay UNA sola fuente: el backtest del día a la resolución elegida. El
// gráfico, los KPI y el agente leen exactamente los mismos valores.
//
// Todo esto es RECONSTRUCCIÓN sobre datos ya medidos, no predicción en vivo. Se
// dice una vez, en una etiqueta, no en tres párrafos.
//
// Las piezas viven en `pred/`: el día en un hook, las preguntas al agente, el
// gráfico del día y los controles.
import { useMemo, useState } from "react";
import { moverReloj } from "@/app/lib/tiempo";
import { LecturaAgente } from "@/app/components/console/LecturaAgente";
import { MEDICION_OCULTA, MEDICION_VISIBLE, MODO } from "@/app/components/console/modos";
import { SEGUNDOS } from "@/app/components/console/pred/catalogo";
import { GraficoDia } from "@/app/components/console/pred/GraficoDia";
import { PredControles } from "@/app/components/console/pred/PredControles";
import { preguntaOculta, preguntaVisible } from "@/app/components/console/pred/preguntas";
import { useDiaPred } from "@/app/components/console/pred/useDiaPred";

export function PredView({ theme }: { theme: string }) {
  const [vari, setVari] = useState("irradiancia");
  const [bucket, setBucket] = useState("h");
  // Los dos modos se distinguen por UNA sola cosa, y de ahí salen sus nombres:
  // si el agente puede ver lo que midió el sensor.
  //   medición visible : la ve. ¿Qué tan bueno es el MÉTODO? Lo juzga después del hecho.
  //   medición oculta  : no la ve. ¿Predice bien sin saberla? Se compromete primero.
  // No es un matiz de presentación: en `medicion_oculta` el servicio le quita `backtest`
  // del juego de herramientas, que es la única que revela lo medido. Mismos dos
  // nombres en el backend (`agent.MODOS`), en el mapa de arquitectura y acá.
  const [oculta, setOculta] = useState(false);
  const { fecha, setFecha, momento, setMomento, rango, dia, errDia, momentos } =
    useDiaPred(vari, bucket);

  const unidad = vari === "irradiancia" ? "W/m²" : "crudo";
  const dec = vari === "irradiancia" ? 1 : 0;
  const idx = momentos.indexOf(momento);
  const punto = idx >= 0 ? dia.puntos[idx] : null;
  const pregunta = { vari, fecha, momento, bucket };

  // Instante en que el agente "se para" para predecir: el momento elegido menos
  // la anticipación. Es hora de pared del sitio, sin zona, que es como la
  // interpreta el servicio; `moverReloj` no pasa por el reloj del navegador.
  const corteISO = useMemo(() => {
    if (!fecha || !momento) return "";
    return moverReloj(`${fecha}T${momento}:00`, -SEGUNDOS[bucket]);
  }, [fecha, momento, bucket]);

  return (
    <section className="vista">
      <div className="phead phead-row">
        <div>
          <h1>Predicción vs Real</h1>
          <p>Elegí un momento: lo que midió el sensor contra lo que el modelo habría predicho.</p>
        </div>
        <div className="chips chips-modo">
          {([MODO.medicion_visible, MODO.medicion_oculta] as const).map((m) => (
            <button key={m.id} title={m.ayuda}
                    className={"chip" + ((m.id === MEDICION_OCULTA) === oculta ? " on" : "")}
                    onClick={() => setOculta(m.id === MEDICION_OCULTA)}>
              {m.etiqueta}
            </button>
          ))}
        </div>
      </div>


      <PredControles
        vari={vari} fecha={fecha} momento={momento} bucket={bucket}
        momentos={momentos} rango={rango}
        onVari={setVari} onFecha={setFecha} onMomento={setMomento} onBucket={setBucket}
      />

      <GraficoDia
        dia={dia} errDia={errDia} momentos={momentos} momento={momento} fecha={fecha}
        theme={theme} unidad={unidad} dec={dec} onReintentar={() => setFecha((f) => f)}
      />

      {punto && (
        <LecturaAgente
          key={oculta ? MEDICION_OCULTA : MEDICION_VISIBLE}
          pregunta={oculta ? preguntaOculta(pregunta) : preguntaVisible(pregunta)}
          modo={oculta ? MEDICION_OCULTA : MEDICION_VISIBLE}
          // OJO: el contexto viaja dentro del mensaje del usuario. Con la medición oculta
          // NO puede llevar el valor medido, ni el error, ni nada derivado.
          contexto={`Predicción vs Real · ${vari} · ${fecha} ${momento}`}
          esperado={oculta ? null : { real: punto.real, pred: punto.pred }}
          // El corte: se predice `momento` con `bucket` de anticipación, así que
          // los datos visibles terminan justo esa anticipación antes.
          revelar={oculta ? { variable: vari, ahora: corteISO,
                             horizonte_seg: SEGUNDOS[bucket], unidad, dec } : null} />
      )}
    </section>
  );
}
