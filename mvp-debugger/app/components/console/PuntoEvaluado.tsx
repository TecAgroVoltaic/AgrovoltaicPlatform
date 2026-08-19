"use client";
// Los tres números del momento que se está mirando: lo que midió el sensor, lo
// que el método habría predicho, y la diferencia. Presentacional puro.
//
// Salen de la MISMA serie que dibuja el gráfico. Antes venían de otra llamada
// (pronóstico anclado, resolución instantánea) y no cuadraban: a las 12:00 el
// gráfico marcaba 358 W/m² —promedio de la hora— y el KPI 166 —lectura suelta de
// las 12:02—. Ambos ciertos, pero juntos parecen un error, y lo que se quiere es
// validar de un vistazo.

const fmt = (n: any, d = 1) =>
  n == null || !isFinite(n) ? "—" : Number(n).toLocaleString("es-CR",
    { minimumFractionDigits: d, maximumFractionDigits: d });

export function PuntoEvaluado({ punto, unidad, dec, anticipacion }: {
  punto: { real: number; pred: number; cs?: number | null } | null;
  unidad: string; dec: number; anticipacion: string;
}) {
  const error = punto ? punto.pred - punto.real : null;
  // Índice de claridad: medido / techo de cielo despejado. Es lo que convierte
  // un número suelto en información — 33 W/m² puede ser "amaneciendo" o "cielo
  // tapado", y solo el techo lo distingue. Es además la señal que persiste el
  // método, así que explica el acierto o el error de la franja de al lado.
  const techo = punto?.cs ?? null;
  const kt = techo && techo > 0 && punto ? punto.real / techo : null;

  return (
    <div className="grid g3">
      <div className="kpi">
        <span className="lbl">Midió el sensor</span>
        <div className="k">{fmt(punto?.real, dec)}<small>{unidad}</small></div>
        <div className="d">
          {kt != null
            ? <span title="Índice de claridad kt* = medido / techo de cielo despejado. Es la señal que el método persiste.">
                {fmt(kt * 100, 0)} % del techo de cielo despejado ({fmt(techo, 0)} {unidad})
              </span>
            : "valor real de esa franja"}
        </div>
      </div>
      <div className="kpi">
        <span className="lbl">Predijo el método</span>
        <div className="k">{fmt(punto?.pred, dec)}<small>{unidad}</small></div>
        <div className="d">con {anticipacion} de anticipación</div>
      </div>
      <div className="kpi">
        <span className="lbl">Error</span>
        <div className="k" style={{ color: error == null ? undefined : (error >= 0 ? "var(--pred)" : "var(--crit)") }}>
          {error == null ? "—" : (error >= 0 ? "+" : "") + fmt(error, dec)}<small>{error == null ? "" : unidad}</small>
        </div>
        <div className="d">predicho − medido</div>
      </div>
    </div>
  );
}
