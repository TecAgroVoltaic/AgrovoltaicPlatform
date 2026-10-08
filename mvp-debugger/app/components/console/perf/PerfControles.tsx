import { PERIODS, VARS } from "@/app/components/console/perfCatalogo";

const COMPARACIONES = [["ambos", "PV1 y PV2"], ["pv1", "Solo PV1"], ["pv2", "Solo PV2"]];

/** Período, variable y, si la variable lo admite, qué arreglos comparar. */
export function PerfControles({ period, vari, cmp, conComparar, onPeriod, onVari, onCmp }: {
  period: string; vari: string; cmp: string; conComparar: boolean;
  onPeriod: (k: string) => void; onVari: (k: string) => void; onCmp: (k: string) => void;
}) {
  return (
    <div className="controls">
      <div className="ctl"><span className="lbl">Período</span>
        <div className="chips">{Object.entries(PERIODS).map(([k, p]) => <button key={k} className={"chip" + (period === k ? " on" : "")} onClick={() => onPeriod(k)}>{p.label} <span className="chip-sub">{p.grano}</span></button>)}</div>
      </div>
      <div className="ctl"><span className="lbl">Variable</span>
        <div className="chips">{Object.entries(VARS).map(([k, v]) => <button key={k} className={"chip" + (vari === k ? " on" : "")} onClick={() => onVari(k)}>{v.label}</button>)}</div>
      </div>
      {conComparar && <div className="ctl"><span className="lbl">Comparar</span>
        <div className="chips">{COMPARACIONES.map(([k, l]) => <button key={k} className={"chip" + (cmp === k ? " on" : "")} onClick={() => onCmp(k)}>{l}</button>)}</div>
      </div>}
    </div>
  );
}
