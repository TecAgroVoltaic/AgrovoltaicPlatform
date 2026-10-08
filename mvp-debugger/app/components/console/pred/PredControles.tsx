import { ANTICIPACIONES, VARIABLES } from "./catalogo";

const AYUDA_ANTICIPACION = "Cuánto ANTES se hizo la predicción. Con 1 hora, el valor del momento elegido se reconstruye con el índice de claridad de la franja anterior, proyectado sobre el techo de cielo despejado del momento. No se adelantan datos: el algoritmo solo ve lo que ya había ocurrido.";

/** Variable, fecha, momento y anticipación: lo que decide toda la vista. */
export function PredControles({ vari, fecha, momento, bucket, momentos, rango,
                                onVari, onFecha, onMomento, onBucket }: {
  vari: string; fecha: string; momento: string; bucket: string; momentos: string[];
  rango: { desde: string; hasta: string } | null;
  onVari: (v: string) => void; onFecha: (f: string) => void;
  onMomento: (m: string) => void; onBucket: (b: string) => void;
}) {
  return (
  <div className="controls">
    <div className="ctl">
      <span className="lbl">Variable</span>
      <div className="chips">
        {VARIABLES.map(([v, l]) => (
          <button key={v} className={"chip" + (vari === v ? " on" : "")}
                  onClick={() => onVari(v)}>{l}</button>
        ))}
      </div>
    </div>
    <div className="ctl">
      <span className="lbl">Fecha</span>
      <input className="input input-sm" type="date" value={fecha}
             min={rango?.desde} max={rango?.hasta}
             onChange={(e) => onFecha(e.target.value)} />
    </div>
    <div className="ctl">
      <span className="lbl">Momento</span>
      <select className="input input-sm" value={momento} disabled={!momentos.length}
              onChange={(e) => onMomento(e.target.value)}>
        {momentos.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
    </div>
    <div className="ctl">
      <span className="lbl" title={AYUDA_ANTICIPACION}>
        Anticipación
      </span>
      <div className="chips">
        {ANTICIPACIONES.map(([b, l]) => (
          <button key={b} className={"chip" + (bucket === b ? " on" : "")}
                  onClick={() => onBucket(b)}>{l}</button>
        ))}
      </div>
    </div>
  </div>
  );
}
