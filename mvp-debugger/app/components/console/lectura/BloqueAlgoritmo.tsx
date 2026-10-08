import { IconoAlerta, IconoAlgoritmo, IconoCheck } from "@/app/components/Iconos";
import type { Resultado } from "./resultados";

/** Lo que calculó una herramienta, en cifras, con el sello de la verificación cruzada. */
export function BloqueAlgoritmo({ r, coincide }: { r: Resultado; coincide: boolean | null }) {
  return (
    <section className="bloq bloq-algo">
      <header className="bloq-h">
        <span className="bloq-ic bloq-ic-algo"><IconoAlgoritmo size={15} /></span>
        <span className="bloq-t">Lo que calculó su herramienta</span>
        <code className="tz-tool">{r.tool}</code>
        {coincide !== null && (
          <span className={"bloq-check" + (coincide ? " ok" : " mal")}>
            {coincide ? <IconoCheck size={13} /> : <IconoAlerta size={13} />}
            {coincide ? "coincide con el gráfico" : "no coincide con el gráfico"}
          </span>
        )}
      </header>
      <div className="fichas">
        {r.fichas.map((f, j) => (
          <div className={"ficha" + (f.acento ? " ficha-acento" : "")} key={j} title={f.nota}>
            <span className="ficha-l">{f.l}</span>
            <span className="ficha-v">{f.v}{f.u && <small>{f.u}</small>}</span>
          </div>
        ))}
      </div>
      {(r.metodo || r.contexto) && (
        <p className="bloq-ctx">{[r.metodo, r.contexto].filter(Boolean).join(" · ")}</p>
      )}
    </section>
  );
}
