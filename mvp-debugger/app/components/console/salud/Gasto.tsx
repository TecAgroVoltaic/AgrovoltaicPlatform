import { nfmt } from "@/app/lib/client";
import type { Panel } from "./tipos";

const PORCENTAJE = 100;

/** El gasto del día contra el tope diario. */
export function Gasto({ p }: { p: Panel["presupuesto"] }) {
  const pct = p.tope_usd > 0 ? Math.min(PORCENTAJE, (p.gastado_hoy_usd / p.tope_usd) * PORCENTAJE) : 0;
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <h3>Gasto del día</h3>
      <p className="hint">
        {p.medido
          ? <>US${nfmt(p.gastado_hoy_usd, 4)} de US${nfmt(p.tope_usd, 2)}
             {p.agotado && <strong> · tope alcanzado, las consultas al modelo están cortadas</strong>}</>
          : <>No se pudo medir el gasto (la base no respondió); el tope no se está aplicando.</>}
      </p>
      {p.medido && p.tope_usd > 0 && (
        <div className="barra"><div className="barra-fill" style={{ width: `${pct}%` }} /></div>
      )}
    </div>
  );
}
