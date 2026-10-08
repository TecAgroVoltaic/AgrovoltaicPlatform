import { useMemo } from "react";

import { COLOR, mes } from "./textos";
import type { Dia } from "./tipos";

const PREFIJO_DEL_SIGLO = 2;

/** Una tira de calendario: un cuadrito por día, agrupados por mes. */
export function Tira({ dias, campo, onPick, sel }: {
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
          <div className="cal-rot">{k.slice(PREFIJO_DEL_SIGLO)}</div>
        </div>
      ))}
    </div>
  );
}
