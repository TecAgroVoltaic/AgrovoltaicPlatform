/**
 * La recta y los días señalados. Esto es lo único de la consola que puede estar
 * MAL sin que se note: una recta mal ajustada se ve igual de bien que una bien
 * ajustada, y un día marcado como anómalo manda a alguien a revisar un panel. Se
 * prueba con casos comprobables a mano y con los datos reales.
 */
import { DIAS } from "../fixtures/dias-ghi-potencia.mjs";
import { check } from "./registro.mjs";
import { cargar, fuente } from "./entorno.mjs";
import { fuentePerf } from "./rendimientoGrano.mjs";

const pt = (x, y, etiqueta = String(x)) => ({ x, y, etiqueta });
const TOLERANCIA = 1e-9;
const DIA_INVALIDO_CONOCIDO = "2025-09-22";

export function verificarRegresion() {
  const R = cargar("app/lib/regresion.js");
  verificarCasosAMano(R);
  verificarDatosReales(R);

  // El gráfico ya no miente con la unidad.
  const chartsSrc = fuente("app/lib/charts.ts", "app/lib/charts");
  check("el tooltip de la nube ya no dice kWh sobre vatios",
    !/data-tip="GHI \$\{fmt\(p\[0\], 0\)\} W\/m² · \$\{fmt\(p\[1\], 2\)\} kWh"/.test(chartsSrc),
    "el eje trae potencia en W; el hover decía kWh");
  check("las unidades de la nube se pasan como dato", /xUnit\?: string; yUnit\?: string/.test(chartsSrc));

  const perfSrc = fuentePerf();
  check("la nube usa el grano DIARIO aunque el período esté en meses",
    /setScat\(recortar\(ghiDiaria/.test(perfSrc),
    "promediando un mes, el día que generó de menos se diluye entre los otros 29");
  check("y se publica el R² para no prometer lo que no se mide", /ajuste\.r2/.test(perfSrc));
}

function verificarCasosAMano(R) {
  // Recta exacta: y = 2x + 1. El ajuste tiene que devolverla clavada.
  const exacta = R.ajusteLineal([pt(0, 1), pt(1, 3), pt(2, 5), pt(3, 7)]);
  check("sobre una recta perfecta el ajuste la recupera",
    Math.abs(exacta.m - 2) < TOLERANCIA && Math.abs(exacta.b - 1) < TOLERANCIA);
  check("y su R² es 1", Math.abs(exacta.r2 - 1) < TOLERANCIA);

  check("con menos de 3 puntos no inventa recta", R.ajusteLineal([pt(1, 1), pt(2, 2)]) === null);
  check("con x constante tampoco", R.ajusteLineal([pt(5, 1), pt(5, 2), pt(5, 3)]) === null);
  const plana = R.ajusteLineal([pt(1, 7), pt(2, 7), pt(3, 7)]);
  check("con y constante el R² es 0, no 1", plana && plana.r2 === 0,
    "devolver 1 diría «el sol lo explica todo» cuando no hay nada que explicar");

  // Un día claramente por debajo, entre muchos sobre la recta.
  const base = Array.from({ length: 20 }, (_, i) => pt(i + 1, 2 * (i + 1) + (i % 3) - 1));
  const conMalo = [...base, pt(10, 2, "el-malo")];
  const marcados = R.atipicosBajos(conMalo, R.ajusteLineal(conMalo));
  check("señala el día que rindió de menos",
    marcados.length === 1 && marcados[0].punto.etiqueta === "el-malo",
    `marcó ${marcados.length}: ${marcados.map((m) => m.punto.etiqueta).join(", ")}`);
  check("y dice cuánto le faltó, en positivo", marcados[0]?.faltante > 0);
  check("un día POR ENCIMA de la recta no se señala",
    R.atipicosBajos([...base, pt(10, 90, "alto")], R.ajusteLineal([...base, pt(10, 90, "alto")]))
      .every((m) => m.punto.etiqueta !== "alto"),
    "un punto alto puede ser el piranómetro leyendo de menos: mandaría a revisar el sitio equivocado");
  check("sin dispersión no marca nada (no divide por MAD cero)",
    R.atipicosBajos([pt(1, 2), pt(2, 4), pt(3, 6)], R.ajusteLineal([pt(1, 2), pt(2, 4), pt(3, 6)])).length === 0);

  // El filtro físico. La constante solar no es un umbral elegido: en superficie
  // no se puede medir más que eso.
  check("la constante solar es la de física", R.CONSTANTE_SOLAR === 1361);
  const dep = R.depurar([pt(300, 400), pt(2030, 172, "imposible"), pt(500, 600)]);
  check("se aparta la irradiancia imposible",
    dep.descartados.length === 1 && dep.descartados[0].etiqueta === "imposible");
  check("y se conserva el resto", dep.usables.length === 2);
}

// Contra los 195 días REALES. El defecto solo aparece con datos de verdad: un
// punto con muchísima palanca en x no se nota en un caso sintético prolijo.
function verificarDatosReales(R) {
  const reales = DIAS.map(([f, x, y]) => pt(x, y, f));
  const sucio = R.ajusteLineal(reales);
  const { usables, descartados } = R.depurar(reales);
  const limpio = R.ajusteLineal(usables);

  check("el histórico real trae irradiancia imposible", descartados.length >= 1,
    "si dejara de traerla, este filtro sobra y hay que revisarlo");
  check("sin filtrar, el ajuste es basura", sucio.r2 < 0.2, `R² ${sucio.r2.toFixed(3)}`);
  check("filtrando, el sol explica mucho más", limpio.r2 > 2 * sucio.r2,
    `R² ${sucio.r2.toFixed(3)} -> ${limpio.r2.toFixed(3)}`);
  check("y la pendiente pasa a ser físicamente creíble", limpio.m > 0.9 && limpio.m < 2,
    `${limpio.m.toFixed(2)} W por W/m² (sin filtrar: ${sucio.m.toFixed(2)})`);

  const sucios = R.atipicosBajos(reales, sucio);
  const limpios = R.atipicosBajos(usables, limpio);
  check("sin filtrar, el dato inválido ES el único día señalado",
    sucios.length === 1 && sucios[0].punto.etiqueta === DIA_INVALIDO_CONOCIDO,
    "esconde los días que de verdad rindieron de menos");
  check("filtrando, aparecen los días reales de bajo rendimiento", limpios.length >= 5,
    `señalados: ${limpios.length}`);
  check("y ninguno de ellos es el dato inválido",
    limpios.every((m) => m.punto.etiqueta !== DIA_INVALIDO_CONOCIDO));
  check("los señalados generaron casi nada con mucho sol",
    limpios.slice(0, 3).every((m) => m.punto.x > 300 && m.punto.y < 100),
    limpios.slice(0, 3).map((m) => `${m.punto.etiqueta}: ${m.punto.x.toFixed(0)}→${m.punto.y.toFixed(0)}`).join(" · "));
}
