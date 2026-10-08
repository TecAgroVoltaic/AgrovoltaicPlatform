"use client";
import { IC, Note, Table } from "@/app/docs/ui";
import { useMapaHistorico } from "@/app/components/console/arquitectura/useMapaHistorico";
import { valorUmbral, type MapaHistorico } from "@/app/components/console/arquitectura/mapaHistorico";

/** Los umbrales y los tipos de hallazgo, LEÍDOS DEL AGENTE.
 *
 * No están transcritos acá a propósito. Una tabla escrita a mano envejece sin que
 * nadie se entere, y entonces el documento y el agente discrepan sobre el número
 * que decide si un dato sirve: quien lea la doc creerá que el criterio es uno y
 * el agente aplicará otro. Salen del mismo `GET /arquitectura` que dibuja el mapa
 * de la consola, que a su vez se deriva del código.
 */
export function CriteriosDelHistorico() {
  const { mapa, esRespaldo, cargando } = useMapaHistorico();
  if (cargando) return <p className="dx-muted">Leyendo los criterios del agente…</p>;
  if (!mapa) return null;
  return <TablasCriterios mapa={mapa} esRespaldo={esRespaldo} />;
}

/** Las tablas, sin carga de red.
 *
 * Separadas del componente de arriba para que se puedan RENDERIZAR con un mapa
 * real en `scripts/verificar-vistas.mjs`: el efecto que trae los datos no corre
 * en un render estático, así que dentro del wrapper lo único verificable sería
 * la línea de «cargando». No hay navegador con el que mirar esto.
 */
export function TablasCriterios({ mapa, esRespaldo = false }: {
  mapa: MapaHistorico; esRespaldo?: boolean;
}) {
  return (
    <>
      <h2>Umbrales: los números que deciden si un dato sirve</h2>
      <p>
        No son física, son <strong>política</strong>: alguien los eligió y se pueden
        discutir sin abrir el código. Salen leídos de donde se aplican, así que esta
        tabla no puede quedar desactualizada respecto del agente. Verlos es lo que
        convierte «el agente dice que el día es malo» en «lo marca porque cubrió menos
        del {Math.round((mapa.umbrales.find((u) => u.clave === "COBERTURA_MINIMA")?.valor ?? 0) * 100)}
        {" "}% de las horas de sol».
      </p>
      <Table
        head={["Umbral", "Valor", "Qué decide"]}
        rows={mapa.umbrales.map((u) => [
          <IC>{u.clave}</IC>, valorUmbral(u.valor), u.que_decide,
        ])}
      />

      <h2>Qué sabe detectar ({mapa.hallazgos.tipos.length} tipos)</h2>
      <p>
        Lo que el barrido tipifica. Cada hallazgo se guarda con su severidad
        ({mapa.hallazgos.severidades.join(" · ")}) y con cuántas lecturas afecta, que es
        lo que después decide el veredicto del día ({mapa.hallazgos.veredictos.join(" · ")}).
      </p>
      <Table
        head={["Tipo", "Qué es"]}
        rows={mapa.hallazgos.tipos.map((t) => [<IC>{t.tipo}</IC>, t.que_es])}
      />

      <h2>Garantías</h2>
      <p>
        Ninguna depende de que el modelo obedezca una instrucción. Todas son
        consecuencia de cómo está armado el sistema, que es la única clase de garantía
        que sigue valiendo cuando el modelo se equivoca.
      </p>
      <Table
        head={["Qué se garantiza", "Cómo"]}
        rows={mapa.garantias.map((g) => [g.que, g.como])}
      />
      {esRespaldo && (
        <Note kind="warn">
          <div>
            <b>Copia guardada.</b> El servicio no respondió, así que estas tablas salen
            de la última captura del código y no del agente en vivo.
          </div>
        </Note>
      )}
    </>
  );
}
