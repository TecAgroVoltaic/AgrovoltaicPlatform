import { AGREGACIONES, BUCKETS, TIPO_GRAFICABLE, type Columna } from "./types";

export function SeriesControls({ cols, serieCol, bucket, agg, onSerieCol, onBucket, onAgg, onGraficar }: {
  cols: Columna[];
  serieCol: string;
  bucket: string;
  agg: string;
  onSerieCol: (v: string) => void;
  onBucket: (v: string) => void;
  onAgg: (v: string) => void;
  onGraficar: () => void;
}) {
  return (
    <div className="runner-controls">
      <select value={serieCol} onChange={(e) => onSerieCol(e.target.value)} className="select">
        {cols
          .filter((c) => TIPO_GRAFICABLE.test(c.tipo))
          .map((c) => (
            <option key={c.nombre} value={c.nombre}>
              {c.nombre}
            </option>
          ))}
      </select>
      <select value={bucket} onChange={(e) => onBucket(e.target.value)} className="select">
        {BUCKETS.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>
      <select value={agg} onChange={(e) => onAgg(e.target.value)} className="select">
        {AGREGACIONES.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <button className="btn" onClick={onGraficar} disabled={!serieCol}>
        graficar
      </button>
    </div>
  );
}
