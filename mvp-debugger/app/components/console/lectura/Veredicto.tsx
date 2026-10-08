import { IconoCheck } from "@/app/components/Iconos";
import { fmt } from "./formato";

const PORCENTAJE = 100;
// Los cortes son de lectura, no de física: separan "sirve", "sirve con
// reparos" y "no sirve para decidir nada" a ojo de quien mira la pantalla.
const ERROR_QUE_SIRVE_PCT = 15;
const ERROR_CON_REPAROS_PCT = 40;

/**
 * El puntaje del pronóstico con la medición oculta. Lo calcula la CONSOLA, no el agente.
 *
 * El error absoluto solo no alcanza para juzgar: 45 W/m² es excelente a mediodía
 * y catastrófico al amanecer. Por eso va siempre acompañado del relativo, que es
 * lo que hace comparable un momento con otro.
 */
export function Veredicto({ pred, real, unidad, dec }: {
  pred: number | null; real: number; unidad: string; dec: number;
}) {
  if (pred == null) {
    return (
      <p className="hint">
        El agente no llegó a comprometerse con un número (suele pasar si no hay lecturas
        suficientes en la ventana previa). El sensor registró <b>{fmt(real, dec)} {unidad}</b>.
      </p>
    );
  }
  const error = pred - real;
  const rel = real !== 0 ? Math.abs(error) / Math.abs(real) * PORCENTAJE : null;
  const clase = rel == null ? "" : rel <= ERROR_QUE_SIRVE_PCT ? " ok" : rel <= ERROR_CON_REPAROS_PCT ? " medio" : " mal";
  return (
    <div className="veredicto">
      <span className="v-ic"><IconoCheck size={14} /></span>
      <span className="v-par"><i>predijo</i><b>{fmt(pred, dec)}</b></span>
      <span className="v-vs">vs</span>
      <span className="v-par"><i>midió el sensor</i><b>{fmt(real, dec)}</b></span>
      <span className={"v-err" + clase}>
        {(error > 0 ? "+" : "") + fmt(error, dec)} {unidad}
        {rel != null && <em>{fmt(rel, 0)} %</em>}
      </span>
    </div>
  );
}
