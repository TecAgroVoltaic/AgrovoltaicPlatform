import { fmt } from "./formato";

export type Paso = any;

const PORCENTAJE = 100;
const HORA_EN_ISO = [11, 16] as const;

export type Ficha = { l: string; v: string; u?: string; acento?: boolean; nota?: string };
export type Resultado = {
  tool: string; metodo: string | null; fichas: Ficha[]; contexto: string | null;
  real: number | null; pred: number | null;
};

/**
 * Lo que devolvió cada herramienta, sacado de la traza. Se contemplan las dos
 * formas que existen hoy: `backtest` (reconstrucción contra lo medido) y
 * `forecast` (valor esperado con banda). Una herramienta desconocida no rompe
 * nada: se omite su bloque de cifras y queda su paso en la traza.
 */
export function resultados(pasos: Paso[]): Resultado[] {
  const salida: Resultado[] = [];
  for (const paso of pasos) {
    if (paso.tipo !== "tool" || paso.error) continue;
    const s = paso.salida;
    if (!s || typeof s !== "object") continue;
    const unidad = s.unidad === "W/m2" ? "W/m²" : (s.unidad || "");

    if (s.punto_consultado) {
      const p = s.punto_consultado;
      const m = s.metricas || {};
      const fichas: Ficha[] = [
        { l: "Predicho", v: fmt(p.reconstruido, 1), u: unidad, acento: true,
          nota: "lo que el algoritmo habría dicho" },
        { l: "Medido", v: fmt(p.real, 1), u: unidad, nota: "lo que registró el sensor" },
        { l: "Error", v: (p.error > 0 ? "+" : "") + fmt(p.error, 1), u: unidad,
          nota: "predicho − medido" },
      ];
      if (p.techo_cielo_despejado != null) {
        fichas.push({ l: "Techo", v: fmt(p.techo_cielo_despejado, 0), u: unidad,
                      nota: "máximo con cielo despejado" });
      }
      if (p.kt_estrella != null) {
        // «índice de cielo despejado», no «de claridad»: en la literatura solar
        // el clearness index es GHI/GHI_extraterrestre, que es otra cosa.
        fichas.push({ l: "Índice kt*", v: fmt(p.kt_estrella * PORCENTAJE, 0), u: "%",
                      nota: "del techo dejaron pasar las nubes (índice de cielo despejado)" });
      }
      if (m.mae != null) {
        fichas.push({ l: "Error medio", v: fmt(m.mae, 1), u: unidad,
                      nota: "promedio de todo el día" });
      }
      salida.push({
        tool: paso.nombre, metodo: s.metodo || null, fichas,
        contexto: s.resumen?.maximo_real
          ? `máximo del día ${fmt(s.resumen.maximo_real.valor, 1)} ${unidad} a las ${s.resumen.maximo_real.t}`
          : null,
        real: p.real, pred: p.reconstruido,
      });
      continue;
    }

    if (s.valor_esperado !== undefined) {
      salida.push({
        tool: paso.nombre, metodo: null,
        fichas: [
          { l: "Esperado", v: fmt(s.valor_esperado, 1), u: unidad, acento: true },
          { l: "Banda baja", v: fmt(s.banda?.bajo, 1), u: unidad },
          { l: "Banda alta", v: fmt(s.banda?.alto, 1), u: unidad },
          ...(s.medido ? [{ l: "Medido", v: fmt(s.medido.valor, 1), u: unidad }] : []),
        ],
        contexto: s.momento_pronosticado
          ? `para las ${String(s.momento_pronosticado).slice(...HORA_EN_ISO)}` : null,
        real: s.medido?.valor ?? null, pred: s.valor_esperado ?? null,
      });
    }
  }
  return salida;
}
