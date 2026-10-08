import type { SerieDibujada } from "./tipos";

const DESPEGUES_A_LA_VISTA = 4;
const PORCENTAJE = 100;

type Despegue = { t: string; caida: number; arreglo: string };

/** Lo que la serie tiene que dejar dicho: dónde se despegó y dónde no hubo lecturas. */
export function SerieNotas({ despegues, conReferencia, series }: {
  despegues: Despegue[]; conReferencia: boolean; series: SerieDibujada | null;
}) {
  return (
    <>
      {despegues.length ? (
        <p className="hint" style={{ marginTop: 10 }}>
          <b>{despegues.length} {despegues.length === 1 ? "tramo" : "tramos"} por debajo de
          su referencia:</b>{" "}
          {despegues.slice(0, DESPEGUES_A_LA_VISTA).map((d) => `${d.t} ${d.arreglo} (−${Math.round(d.caida * PORCENTAJE)} %)`).join(" · ")}
          {despegues.length > DESPEGUES_A_LA_VISTA ? ` y ${despegues.length - DESPEGUES_A_LA_VISTA} más` : ""}.
        </p>
      ) : conReferencia ? (
        <p className="hint" style={{ marginTop: 10 }}>
          La generación siguió a la irradiancia en todos los tramos con datos.
        </p>
      ) : null}
      {series && series.muestras.some((n: number) => n === 0) ? (
        <p className="hint" style={{ marginTop: 6 }}>
          Los cortes de la línea son tramos <b>sin ninguna lectura</b>
          {" "}({series.muestras.filter((n: number) => n === 0).length} de {series.muestras.length}).
          Antes se unían con una recta y el hueco no se veía.
        </p>
      ) : null}
    </>
  );
}
