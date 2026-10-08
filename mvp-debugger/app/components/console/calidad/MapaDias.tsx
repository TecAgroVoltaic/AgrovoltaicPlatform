import { COLOR, LEYENDA } from "./textos";
import { Tira } from "./Tira";
import type { Dia } from "./tipos";

/** Las dos tiras de calendario (una por fuente) con su leyenda. */
export function MapaDias({ dias, sel, onPick }: {
  dias: Dia[]; sel: string | null; onPick: (f: string) => void;
}) {
  return (
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
        <Tira dias={dias} campo="veredicto_radiacion" onPick={onPick} sel={sel} />
      </div>
      <div className="cal-fila">
        <span className="cal-nombre">eléctrico</span>
        <Tira dias={dias} campo="veredicto_electrico" onPick={onPick} sel={sel} />
      </div>
      <div className="chips" style={{ marginTop: 14 }}>
        {LEYENDA.map(([v, txt]) => (
          <span className="cal-leyenda" key={v}>
            <i style={{ background: COLOR[v] }} />{txt}
          </span>
        ))}
      </div>
    </div>
  );
}
