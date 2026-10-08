/** Arquitectura del Histórico: render REAL del panel con el mapa REAL del servicio. */
import path from "node:path";
import { readFileSync } from "node:fs";
import { check } from "./registro.mjs";
import { RAIZ, cargar, estilosGlobales, renderizar } from "./entorno.mjs";

const ARQ = "app/components/console/arquitectura";
const LARGO_MINIMO_DEL_PANEL = 2000;
const ARISTAS_MINIMAS = 10;
const AIRE_MINIMO_ENTRE_NODOS = 12;
const ALTO_MINIMO_DEL_NODO = 56;
const HERRAMIENTAS_MINIMAS_DEL_AGENTE = 12;
const CLASES_DEL_LIENZO = ["arq-fam-analisis", "arq-fam-calidad", "arq-grp-analisis",
  "arq-grp-calidad", "arq-destino", "arq-dest-filas", "arq-barrido", "arq-sinllm", "arq-escribe"];

export function verificarArquitecturaLienzo() {
  const { RESPALDO_HISTORICO } = cargar(`${ARQ}/respaldoHistorico.js`);
  const { PanelHistorico } = cargar(`${ARQ}/ArqHistorico.js`);
  const html = renderizar(PanelHistorico, { mapa: RESPALDO_HISTORICO });
  const css = estilosGlobales();

  check("el panel del Histórico renderiza con el mapa real", html.length > LARGO_MINIMO_DEL_PANEL);
  check("y se titula como el agente que es", /Arquitectura del Agente Histórico/.test(html));
  check("no menciona al otro agente", !/Predictivo/.test(html));
  // El lienzo, que es lo que hace legible la arquitectura de un vistazo.
  check("se dibuja como grafo y no como lista", /arq-lienzo/.test(html));
  check("hay aristas de verdad", (html.match(/<path/g) || []).length > ARISTAS_MINIMAS);
  check("las cuatro calles están rotuladas",
    ["Entradas", "El agente", "Herramientas", "Datos"].every((l) => html.includes(l)));
  check("cada herramienta es un nodo del lienzo",
    (html.match(/class="arq-nodo/g) || []).length >= RESPALDO_HISTORICO.herramientas.length);

  // Lo que el dibujo tiene que dejar dicho, y una lista no puede.
  check("las DOS familias llegan a destinos distintos",
    /arq-dest-analisis/.test(html) && /arq-dest-calidad/.test(html),
    "si las dos leyeran del mismo sitio, no serían dos familias");
  check("análisis lee las vistas corregidas", /Vistas corregidas/.test(html));
  check("calidad lee el store", /Store de hallazgos/.test(html));
  check("nombra las tres tablas del store",
    ["hallazgos_calidad", "cielo_diario", "ventana_solar"].every((t) => html.includes(t)));
  check("el barrido está en el dibujo", /arq-barrido/.test(html) && /Barrido por lotes/.test(html));
  check("y se ve que NO pasa por el modelo", /no pasa por el modelo/.test(html),
    "es toda la garantía: el veredicto ya estaba escrito antes de que nadie preguntara");
  check("la flecha del barrido va aparte de las demás", /arq-escribe/.test(html));
  check("el modelo declara que no calcula", /No calcula/.test(html));
  check("el pool es de solo lectura", /solo lectura/.test(html));

  // Los nodos quedaron pegados una vez y el chip de «confianza» se comía el borde
  // del de abajo. El aire entre nodos es un requisito, no una preferencia.
  const { TOOL_H, HERRAMIENTAS_HISTORICO } = cargar(`${ARQ}/catalogoHistorico.js`);
  check("hay aire entre nodos del lienzo", TOOL_H.gap >= AIRE_MINIMO_ENTRE_NODOS,
    `gap=${TOOL_H.gap}px: por debajo de 12 se tocan`);
  check("y el nodo es lo bastante alto para su contenido", TOOL_H.h >= ALTO_MINIMO_DEL_NODO,
    `h=${TOOL_H.h}px`);
  check("las marcas van en la fila del título, no debajo",
    /<span class="arq-cer-h"><span class="arq-n-t">[a-z_]+<\/span><span class="arq-chip"/.test(html),
    "debajo empujaban el alto del nodo y terminaba tocando el de al lado");
  // El título tiene que poder encogerse: en flex, un texto largo no baja de su
  // ancho de contenido, y `temperatura_por_arreglo` empujaba su chip fuera del
  // borde del nodo.
  check("el título del nodo se recorta antes de empujar la marca",
    /\.arq-fam-analisis \.arq-n-t[^{]*\{[^}]*min-width:0/.test(css)
    && /\.arq-fam-analisis \.arq-n-t[^{]*\{[^}]*text-overflow:ellipsis/.test(css),
    "sin min-width:0 el nombre largo saca la marca del nodo");
  check("y la marca no se encoge", /\.arq-fam-analisis \.arq-chip[^{]*\{[^}]*flex:0 0 auto/.test(css));

  // Ninguna herramienta del agente puede quedar sin explicación en el lienzo.
  check("no hay ninguna herramienta «sin documentar»", !/sin documentar/.test(html),
    "toda tool publicada necesita su ficha en catalogoHistorico.ts");

  // Los umbrales y los tipos de hallazgo ya NO van en el lienzo: se leen mejor de
  // corrido y viven en la documentación. Lo que el mapa tiene que hacer es
  // mandar ahí, no repetirlos.
  check("el lienzo no repite las tablas de criterios",
    !/COBERTURA_MINIMA/.test(html) && !/FRACCION_MATERIAL/.test(html));
  check("pero manda a la documentación", /\/docs#historico/.test(html));

  // Catálogo contra servicio: la vista no puede callar la diferencia.
  const publicadas = RESPALDO_HISTORICO.herramientas.map((h) => h.nombre);
  check("toda herramienta publicada tiene ficha en la consola",
    publicadas.every((n) => HERRAMIENTAS_HISTORICO[n]),
    publicadas.filter((n) => !HERRAMIENTAS_HISTORICO[n]).join(", "));
  check("y cada herramienta publicada aparece en pantalla",
    publicadas.every((n) => html.includes(n)));

  // El catálogo de la consola tiene que cubrir las tools que hay EN EL CÓDIGO del
  // agente, no solo las que el servidor desplegado ya expone: si el despliegue va
  // detrás, la vista lo avisa, pero la ficha tiene que existir.
  const registro = readFileSync(
    path.join(RAIZ, "../agente-historico/src/historico/tools/__init__.py"), "utf8");
  const modulos = [...registro.matchAll(/^    (\w+),$/gm)].map((m) => m[1]);
  check(`el agente registra ${modulos.length} herramientas`,
    modulos.length >= HERRAMIENTAS_MINIMAS_DEL_AGENTE);

  // El CSS que la vista necesita.
  for (const clase of CLASES_DEL_LIENZO) check(`existe la clase .${clase}`, css.includes(`.${clase}`));
}
