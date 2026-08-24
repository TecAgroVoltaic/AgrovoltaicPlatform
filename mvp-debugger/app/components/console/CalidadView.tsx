"use client";
// Vista «Calidad de datos» — lo que encontró el Comparador sobre el histórico PV.
//
// Responsabilidad única: MOSTRAR. El veredicto de cada día lo decide el servicio
// (`/calidad/dias`), no esta vista: si lo calculara el cliente, la consola y el
// reporte del CLI podrían discrepar sobre si un día sirve, y eso es exactamente
// la clase de desacuerdo que nadie detecta hasta que ya tomó una decisión con él.
//
// La pieza central es el MAPA DE DÍAS, y es deliberado que sea un calendario y no
// una tabla: el hallazgo más grande del histórico es que faltan 295 de los 569
// días de calendario, y eso en una tabla de 274 filas no se ve, porque una tabla
// solo muestra lo que existe. El calendario muestra los huecos.
//
// Y hay DOS tiras, una por fuente, porque el veredicto combinado escondía el
// hallazgo más accionable: la radiación tiene 126 días sanos y el eléctrico 4.
// Fundidas en una sola barra, ambas se ven igual de rojas.
import { useEffect, useMemo, useState } from "react";

import { jget, mensajeError, nfmt } from "@/app/lib/client";

const RUTA = "/api/comparador";

type Veredicto = "ok" | "aviso" | "grave" | "sin_datos";

type Dia = {
  fecha: string;
  filas_radiacion: number; filas_electrico: number;
  graves_rad: number; avisos_rad: number;
  graves_ele: number; avisos_ele: number;
  clase: string | null; kt_medio: number | null; indice_variabilidad: number | null;
  veredicto: Veredicto; veredicto_radiacion: Veredicto; veredicto_electrico: Veredicto;
};
type Tipo = {
  fuente: string; tipo: string; severidad: "grave" | "aviso" | "info";
  dias: number; variables: number; lecturas: number | null;
  primer_dia: string; ultimo_dia: string;
};
type Resumen = {
  periodo: { desde: string; hasta: string };
  cobertura: { dias_con_datos: number; dias_calendario: number };
  cielo: {
    dias: number; kt_medio: number | null; vi_medio: number | null;
    despejados: number; parciales: number; cubiertos: number; variables: number;
    pct_del_techo: number | null;
  };
  tipos: Tipo[];
};
type Hallazgo = {
  fecha: string; fuente: string; variable: string; tipo: string;
  severidad: "grave" | "aviso" | "info"; n_afectadas: number | null;
  detalle: Record<string, any>;
};

const COLOR: Record<Veredicto, string> = {
  ok: "var(--good)", aviso: "var(--warn)", grave: "var(--crit)", sin_datos: "var(--line2)",
};
const LEYENDA: [Veredicto, string][] = [
  ["ok", "sin hallazgos"],
  ["aviso", "defectos puntuales"],
  ["grave", "problema material"],
  ["sin_datos", "no hay datos"],
];
// Qué significa cada tipo, en una línea. Sin esto la tabla es una lista de
// nombres internos, y quien la lee tiene que ir al código para entenderla.
const QUE_ES: Record<string, string> = {
  dia_incompleto: "el logger no grabó todas las horas de sol",
  hueco: "faltan muestras dentro de la ventana que sí grabó",
  duplicado_timestamp: "el mismo instante aparece más de una vez",
  cambio_de_cadencia: "el intervalo de muestreo cambió respecto al día anterior",
  columna_ausente: "la columna no vino en el CSV de ese día (los 13 esquemas)",
  nulos: "faltan valores sueltos en la columna",
  fuera_de_rango: "valores fuera del rango físico plausible",
  saturado_85: "85 °C constante: el DS18B20 está desconectado",
  constante_en_cero: "sin variación en todo el día; en lo eléctrico, no hubo generación",
  sensor_plano: "clavado en un valor que no es 0 ni 85: sensor trabado",
  offset_nocturno: "el offset del piranómetro sin calibrar (−38,845)",
  kt_imposible: "más energía que la de cielo despejado: dato inválido, no una nube",
};
const CLASE_CIELO: Record<string, string> = {
  despejado: "despejado", parcial: "parcial", cubierto: "cubierto", variable: "variable",
};

function mes(fecha: string): string {
  return fecha.slice(0, 7);
}
function pct(n: number, de: number): string {
  return de ? `${Math.round((100 * n) / de)} %` : "—";
}

/** Una tira de calendario: un cuadrito por día, agrupados por mes. */
function Tira({ dias, campo, onPick, sel }: {
  dias: Dia[]; campo: "veredicto_radiacion" | "veredicto_electrico";
  onPick: (f: string) => void; sel: string | null;
}) {
  const meses = useMemo(() => {
    const m = new Map<string, Dia[]>();
    for (const d of dias) {
      const k = mes(d.fecha);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(d);
    }
    return [...m.entries()];
  }, [dias]);

  return (
    <div className="cal-tira">
      {meses.map(([k, ds]) => (
        <div className="cal-mes" key={k}>
          <div className="cal-celdas">
            {ds.map((d) => (
              <button
                key={d.fecha}
                type="button"
                className={`cal-dia${sel === d.fecha ? " on" : ""}`}
                style={{ background: COLOR[d[campo]] }}
                onClick={() => onPick(d.fecha)}
                data-tip={`${d.fecha} · ${d[campo].replace("_", " ")}${
                  d.clase ? ` · cielo ${d.clase}` : ""
                }`}
                aria-label={`${d.fecha}: ${d[campo]}`}
              />
            ))}
          </div>
          <div className="cal-rot">{k.slice(2)}</div>
        </div>
      ))}
    </div>
  );
}

export function CalidadView() {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [dias, setDias] = useState<Dia[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<Hallazgo[] | null>(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([jget(`${RUTA}/calidad/resumen`), jget(`${RUTA}/calidad/dias`)])
      .then(([r, d]) => {
        if (!vivo) return;
        if (!r.ok) return setError(mensajeError(r));
        if (!d.ok) return setError(mensajeError(d));
        setResumen(r.data);
        setDias(d.data?.dias ?? []);
        setError(null);
      });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (!sel) return setDetalle(null);
    let vivo = true;
    setDetalle(null);
    jget(`${RUTA}/calidad/hallazgos?fecha=${sel}`).then((r) => {
      if (vivo) setDetalle(r.ok ? r.data?.hallazgos ?? [] : []);
    });
    return () => { vivo = false; };
  }, [sel]);

  if (error) return <div className="card"><p className="hint">{error}</p></div>;
  if (!resumen) return <div className="card"><p className="hint">Cargando…</p></div>;

  const { cobertura, cielo, tipos } = resumen;
  const diaSel = sel ? dias.find((d) => d.fecha === sel) ?? null : null;

  return (
    <div className="grid">
      <div className="card">
        <h3>Calidad del histórico</h3>
        <p className="hint">
          Lo que encontró el Comparador barriendo día por día. La detección es
          determinista y corre por lotes; esta vista solo muestra el resultado.
        </p>
        <div className="kpi-grid">
          <div className="kpi">
            <span className="lbl">cobertura</span>
            <div className="k">{cobertura.dias_con_datos}
              <small>de {cobertura.dias_calendario} días</small></div>
            <div className="d">
              {pct(cobertura.dias_con_datos, cobertura.dias_calendario)} del calendario
            </div>
          </div>
          <div className="kpi">
            <span className="lbl">cielo despejado</span>
            <div className="k">{nfmt(cielo.kt_medio, 2)}<small>kt medio</small></div>
            <div className="d">sobre {cielo.dias} días caracterizados</div>
          </div>
          <div className="kpi">
            <span className="lbl">techo aprovechado</span>
            <div className="k">{nfmt(cielo.pct_del_techo, 0)}<small>%</small></div>
            <div className="d">de la irradiancia que habría con cielo despejado</div>
          </div>
          <div className="kpi">
            <span className="lbl">tipos de día</span>
            <div className="k">{cielo.despejados}·{cielo.parciales}·{cielo.cubiertos}·{cielo.variables}</div>
            <div className="d">despejados · parciales · cubiertos · variables</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Mapa de días</h3>
        <p className="hint">
          Un cuadrito por día de calendario, no por día con datos: los huecos son
          el hallazgo, y en una tabla de 274 filas no se verían. Dos tiras porque
          las dos fuentes no están igual de sanas. Hacé clic en un día para ver
          sus hallazgos.
        </p>
        <div className="cal-fila">
          <span className="cal-nombre">radiación</span>
          <Tira dias={dias} campo="veredicto_radiacion" onPick={setSel} sel={sel} />
        </div>
        <div className="cal-fila">
          <span className="cal-nombre">eléctrico</span>
          <Tira dias={dias} campo="veredicto_electrico" onPick={setSel} sel={sel} />
        </div>
        <div className="chips" style={{ marginTop: 14 }}>
          {LEYENDA.map(([v, txt]) => (
            <span className="cal-leyenda" key={v}>
              <i style={{ background: COLOR[v] }} />{txt}
            </span>
          ))}
        </div>
      </div>

      {diaSel && (
        <div className="card">
          <h3>{diaSel.fecha}</h3>
          <p className="hint">
            {nfmt(diaSel.filas_radiacion, 0)} lecturas de radiación ·{" "}
            {nfmt(diaSel.filas_electrico, 0)} del inversor
            {diaSel.clase ? ` · cielo ${CLASE_CIELO[diaSel.clase] ?? diaSel.clase}` : ""}
            {diaSel.kt_medio != null ? ` · kt ${nfmt(diaSel.kt_medio, 2)}` : ""}
            {diaSel.indice_variabilidad != null
              ? ` · variabilidad ${nfmt(diaSel.indice_variabilidad, 1)}` : ""}
          </p>
          {detalle === null ? <p className="hint">Cargando…</p>
            : detalle.length === 0 ? <p className="hint">Sin hallazgos ese día.</p> : (
            <table className="tbl">
              <thead>
                <tr><th>fuente</th><th>variable</th><th>hallazgo</th>
                    <th style={{ textAlign: "right" }}>lecturas</th></tr>
              </thead>
              <tbody>
                {detalle.map((h, i) => (
                  <tr key={i}>
                    <td className="mono">{h.fuente}</td>
                    <td className="mono">{h.variable}</td>
                    <td>
                      <span className={`sev sev-${h.severidad}`}>{h.tipo}</span>
                      <span className="hint" style={{ margin: 0, display: "block" }}>
                        {QUE_ES[h.tipo] ?? ""}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {h.n_afectadas == null ? "—" : nfmt(h.n_afectadas, 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="card">
        <h3>Hallazgos por tipo</h3>
        <p className="hint">
          Días y variables afectadas en todo el período. Los días no se suman entre
          variables: un mismo día puede tener el problema en varias columnas.
        </p>
        <table className="tbl">
          <thead>
            <tr>
              <th>fuente</th><th>hallazgo</th>
              <th style={{ textAlign: "right" }}>días</th>
              <th style={{ textAlign: "right" }}>vars</th>
              <th style={{ textAlign: "right" }}>lecturas</th>
              <th>período</th>
            </tr>
          </thead>
          <tbody>
            {tipos.map((t, i) => (
              <tr key={i}>
                <td className="mono">{t.fuente}</td>
                <td>
                  <span className={`sev sev-${t.severidad}`}>{t.tipo}</span>
                  <span className="hint" style={{ margin: 0, display: "block" }}>
                    {QUE_ES[t.tipo] ?? ""}
                  </span>
                </td>
                <td style={{ textAlign: "right" }}>{t.dias}</td>
                <td style={{ textAlign: "right" }}>{t.variables}</td>
                <td style={{ textAlign: "right" }}>
                  {t.lecturas == null ? "—" : nfmt(t.lecturas, 0)}
                </td>
                <td className="mono hint" style={{ margin: 0 }}>
                  {t.primer_dia} a {t.ultimo_dia}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
