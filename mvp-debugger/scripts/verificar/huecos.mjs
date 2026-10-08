/**
 * Huecos de la serie: el gráfico ya no los tapa. `/datos/serie` devuelve SOLO los
 * tramos con datos. Como el eje X va por índice y no por tiempo, dos puntos
 * separados por cuatro meses de nada quedaban pegados y unidos por una recta: el
 * gráfico dibujaba una línea continua sobre el hueco de enero a abril de 2025.
 */
import { DIAS } from "../fixtures/dias-ghi-potencia.mjs";
import { check } from "./registro.mjs";
import { cargar, fuente } from "./entorno.mjs";
import { fuentePerf } from "./rendimientoGrano.mjs";

const pt = (t, v, n = 100) => ({ t, v, n });
const MESES_DE_CALENDARIO = 20;
const TOLERANCIA = 1e-9;
const fecha = (d) => d.toISOString().slice(0, 10);

// Los meses REALES de la base: 14 con datos para 20 de calendario.
const MESES_REALES = [
  pt("2024-11-01", 176.8, 174), pt("2024-12-01", 182.9, 114),
  pt("2025-05-01", 364.5, 2515), pt("2025-06-01", 320.2, 2609),
  pt("2025-09-01", 266.2, 902), pt("2025-10-01", 293.8, 2627),
  pt("2025-11-01", 256.6, 3510), pt("2025-12-01", 345.3, 4013),
  pt("2026-01-01", 321.8, 4124), pt("2026-02-01", 267.0, 3733),
  pt("2026-03-01", 396.7, 4010), pt("2026-04-01", 342.4, 4297),
  pt("2026-05-01", 323.4, 3686), pt("2026-06-01", 176.4, 155),
];

export function verificarHuecos() {
  const S = cargar("app/lib/serie.js");
  verificarCompletar(S);
  verificarAgrupar(S);
  verificarVista();
}

function verificarCompletar(S) {
  const lleno = S.completar(MESES_REALES, "month");
  check("los meses sin datos pasan a existir como vacíos",
    lleno.length === MESES_DE_CALENDARIO,
    `${MESES_REALES.length} -> ${lleno.length}, esperaba 20 meses de calendario`);
  check("y el hueco de ene-abr 2025 son cuatro nulos seguidos",
    ["2025-01-01", "2025-02-01", "2025-03-01", "2025-04-01"]
      .every((t) => lleno.find((p) => p.t === t)?.v === null));
  check("también el de jul-ago 2025",
    ["2025-07-01", "2025-08-01"].every((t) => lleno.find((p) => p.t === t)?.v === null));
  check("no se inventa ni se pierde ningún dato real",
    MESES_REALES.every((m) => lleno.find((p) => p.t === m.t)?.v === m.v));
  check("el gráfico corta la línea en un null",
    /if \(!p\) \{ st = false; return; \}/.test(fuente("app/lib/charts.ts")),
    "sin esto, llenar de nulos no serviría de nada");

  // Semanas: date_trunc arranca el LUNES.
  check("la semana arranca el lunes, como date_trunc",
    fecha(S.tramoDe(new Date("2026-01-01T00:00:00Z"), "week")) === "2025-12-29",
    "el 1 de enero de 2026 fue jueves");
  const sems = S.completar([pt("2026-01-05", 1), pt("2026-01-26", 2)], "week");
  check("los tramos semanales que faltan se completan", sems.length === 4);
  check("meses de distinto largo no descuadran",
    fecha(S.siguiente(new Date("2026-01-31T00:00:00Z"), "month")) === "2026-02-01");
}

function verificarAgrupar(S) {
  // Reagrupar pesa por lecturas: un día con 4 no vale lo mismo que uno con 288.
  const dias = [pt("2026-01-05", 100, 4), pt("2026-01-06", 200, 396)];
  const sem = S.agrupar(dias, "week");
  check("reagrupar pondera por cuántas lecturas tuvo cada día",
    sem.length === 1 && Math.abs(sem[0].v - 199) < 0.01,
    `dio ${sem[0]?.v?.toFixed(2)}, el promedio simple daría 150`);
  check("y no altera una serie que ya es diaria",
    S.agrupar(dias, "day").length === 2);

  // Despegues: lo medido muy por debajo de su referencia.
  const d = S.divergencias([100, 40, 90], [100, 100, 100], ["a", "b", "c"]);
  check("se señala el tramo que se despegó de su referencia",
    d.length === 1 && d[0].t === "b", `señaló ${d.map((x) => x.t).join(",")}`);
  check("un tramo POR ENCIMA de la referencia no se señala",
    S.divergencias([160], [100], ["x"]).length === 0);
  check("y los nulos no cuentan como caída",
    S.divergencias([null, 100], [100, 100], ["x", "y"]).length === 0);

  // Derivar en el cliente en vez de volver a pedir tiene que dar EXACTAMENTE lo
  // mismo que el servidor, o la consola y el agente discreparían sobre el mismo
  // número. Verificado contra la base: 51 semanas y 14 meses, con una diferencia
  // relativa máxima de 2,5e-13 %, que es ruido de coma flotante.
  const dia = DIAS.map(([t, , v]) => pt(t, v, 100));
  const semanas = S.agrupar(dia, "week");
  const suma = new Map();
  for (const p of dia) {
    const k = fecha(S.tramoDe(new Date(`${p.t}T00:00:00Z`), "week"));
    const a = suma.get(k) || { s: 0, n: 0 };
    a.s += p.v * p.n; a.n += p.n; suma.set(k, a);
  }
  check("reagrupar da el mismo número que promediar el tramo entero",
    semanas.every((p) => Math.abs(p.v - suma.get(p.t).s / suma.get(p.t).n) < TOLERANCIA),
    "si difiere, la consola y el agente dirían cosas distintas del mismo tramo");
  check("y no se pierde ni un tramo", semanas.length === suma.size);
}

function verificarVista() {
  const perfSrc = fuentePerf();
  check("la vista completa los huecos ANTES de sacar las etiquetas",
    /completar\(agrupar\(recortar\(/.test(perfSrc),
    "recortar al período, reagrupar al grano y recién ahí rellenar los vacíos");
  check("la serie de potencia trae su referencia", /const referencia = useMemo\(/.test(perfSrc));
  check("la referencia se dibuja punteada, no como una medición más",
    /dash: true, width: 1\.4/.test(perfSrc));
  check("y solo se señalan los arreglos que están en pantalla",
    /visibles\.flatMap/.test(perfSrc),
    "marcar una caída de PV2 mirando «Solo PV1» manda a revisar algo que no se ve");

  // Rendimiento: la vista tardaba porque volvía a pedir lo que ya tenía.
  check("las series se bajan UNA vez por columna y se cachean",
    /!\(k in diarias\)/.test(perfSrc));
  check("y siempre en grano diario y de todo el histórico",
    /jget\(q\(t, c, \{ bucket: "day" \}\)\)/.test(perfSrc),
    "bajar el grano fino una vez permite derivar los demás sin más viajes");
  check("cambiar de período NO dispara red",
    /const series = useMemo\(/.test(perfSrc) && !/setSeries/.test(perfSrc),
    "recortar y reagrupar es aritmética sobre lo ya descargado");
  check("las columnas pedidas se deduplican",
    /\[\.\.\.new Set\(necesarias\.map/.test(perfSrc),
    "con «Potencia» las dos del arreglo aparecen dos veces y se pedirían duplicadas");
  check("queda un solo sitio que pide series", (perfSrc.match(/jget\(q\(/g) || []).length === 1);
}
