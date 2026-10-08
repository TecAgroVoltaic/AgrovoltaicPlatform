/**
 * Rendimiento: qué representa un punto. La curva de «2026» se lee como si fuera
 * diaria y son promedios SEMANALES; el eje además rotula solo ~7 marcas, así que
 * las fechas saltan de 21 en 21 días y parece que faltan datos. No falta ninguno:
 * lo que faltaba era decirlo.
 */
import { check } from "./registro.mjs";
import { cargar, estilosGlobales, fuente } from "./entorno.mjs";

const LARGO_MAXIMO_PIE_NUBE = 110;

/** Fuente de la vista de rendimiento: el archivo y lo que se haya separado de él. */
export const fuentePerf = () => fuente("app/components/console/PerfView.tsx", "app/components/console/perf");

export function verificarRendimientoGrano() {
  const cat = cargar("app/components/console/perfCatalogo.js");
  const perf = fuentePerf();

  for (const [k, p] of Object.entries(cat.PERIODS)) {
    check(`el período «${p.label}» declara su grano`, !!p.grano, `falta grano en ${k}`);
  }
  check("los granos son los tres esperados",
    ["mes", "semana", "día"].every((g) => Object.values(cat.PERIODS).some((p) => p.grano === g)));
  check("se dice qué es un punto", /Cada punto es un mes/.test(cat.quéEsUnPunto({ grano: "mes" })));
  check("la serie dice qué es un punto", /quéEsUnPunto\(P\)/.test(perf));
  check("y la nube dice que el suyo es un día", /Un punto por <strong>día<\/strong>/.test(perf));
  // El pie del gráfico se mantiene BREVE: creció a fuerza de explicar y terminó
  // siendo un párrafo. Si vuelve a pasar, esto lo caza.
  const pieNube = perf.match(/Un punto por <strong>día<\/strong>\.([\s\S]*?)\{ajuste \?/);
  check("el pie de la nube no vuelve a ser un párrafo",
    pieNube && pieNube[1].replace(/\s+/g, " ").trim().length <= LARGO_MAXIMO_PIE_NUBE,
    pieNube ? `${pieNube[1].replace(/\s+/g, " ").trim().length} caracteres` : "no encontrado");
  check("y ya no dice el vago «por período»", !/media por período|un período:/.test(perf));
  check("el grano también se ve en el botón que lo elige", /\{p\.grano\}/.test(perf));
  check("existe la clase .chip-sub", estilosGlobales().includes(".chip-sub"));

  // date_trunc alinea a la semana/mes natural: con filtro de fechas, el primer y
  // el último punto cubren menos días. Verificado en la base: la semana del
  // 2025-12-29 del período «2026» tiene 4 días, no 7.
  check("se avisa del tramo parcial cuando el grano es semana o mes",
    !!cat.avisoParcial(cat.PERIODS.y2026) && !!cat.avisoParcial(cat.PERIODS.todo === undefined ? cat.PERIODS.y2026 : { grano: "mes", desde: "x" }));
  check("y NO se avisa cuando el grano es diario", cat.avisoParcial(cat.PERIODS.mayo) === null,
    "un bucket de un día no puede ser parcial");
  check("ni cuando no hay filtro de fechas", cat.avisoParcial({ grano: "mes" }) === null);
}
