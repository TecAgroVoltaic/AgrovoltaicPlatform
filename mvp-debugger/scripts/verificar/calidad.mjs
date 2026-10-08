/** La vista de calidad de datos de la consola: render, vocabulario y CSS. */
import { check } from "./registro.mjs";
import { cargar, estilosGlobales, fuente, renderizar } from "./entorno.mjs";

const TIPOS_DE_HALLAZGO = ["dia_incompleto", "hueco", "duplicado_timestamp", "cambio_de_cadencia",
  "columna_ausente", "nulos", "fuera_de_rango", "saturado_85", "constante_en_cero", "sensor_plano",
  "offset_nocturno", "kt_imposible"];
const CLASES_CALENDARIO = ["cal-fila", "cal-nombre", "cal-tira", "cal-mes", "cal-celdas", "cal-dia",
  "cal-rot", "cal-leyenda", "sev-grave", "sev-aviso", "sev-info"];
const LARGO_MAXIMO_EXPLICACION = 90;

export function verificarCalidad() {
  const mod = cargar("app/components/console/CalidadView.js");

  // Sin datos aún (el fetch no corre en render estático): tiene que decir algo, no
  // reventar ni quedar en blanco.
  const vacia = renderizar(mod.CalidadView);
  check("CalidadView renderiza sin datos", vacia.length > 0);
  check("y avisa que está cargando en vez de quedar en blanco", /Cargando/i.test(vacia), vacia.slice(0, 120));
  check("CalidadView se exporta", typeof mod.CalidadView === "function");

  // Invariantes de vocabulario: los nombres que el equipo acordó, y los que no.
  const src = fuente("app/components/console/CalidadView.tsx");
  // El invariante que importa no es "no aparece el 85", sino que la separacion en
  // TRES casos siga en pie: de 307 "sensores planos" ninguno lo era, eran 129
  // clavados en 85 (DS18B20) y 178 en cero (el inversor no genero). Si alguien
  // vuelve a fundirlos, la vista miente sobre que esta roto.
  check("`saturado_85` sigue explicandose por su causa",
    /saturado_85: "[^"]*DS18B20/.test(src));
  check("`constante_en_cero` sigue existiendo como caso aparte",
    /constante_en_cero: "[^"]*generaci/.test(src));
  check("`sensor_plano` se define por exclusion de los otros dos",
    /sensor_plano: "[^"]*no es 0 ni 85/.test(src),
    "si deja de excluirlos, vuelve a tragarse los otros dos casos");
  check("los 12 tipos de hallazgo están explicados en la vista",
    TIPOS_DE_HALLAZGO.every((t) => src.includes(`${t}:`)), "falta alguno en QUE_ES");
  check("el veredicto NO se calcula en el cliente",
    !/veredicto\s*=\s*["']grave["']/.test(src),
    "lo decide el servicio, si no la consola y el reporte pueden discrepar");
  check("las celdas del calendario son <button>, no <div> con onClick",
    /<button[\s\S]{0,400}className={`cal-dia/.test(src));
  check("cada celda tiene aria-label", /aria-label=/.test(src));
  check("no quedan coordenadas absolutas", !/style={{\s*(left|top):/.test(src));

  // Presupuesto de contenido: cuando el pedido es "que sea breve", la brevedad
  // tiene que ser una prueba, no una intención.
  const explicaciones = [...src.matchAll(/^\s{2}\w+: "([^"]+)"/gm)].map((m) => m[1]);
  check(`las ${explicaciones.length} explicaciones de tipo caben en una línea`,
    explicaciones.every((e) => e.length <= LARGO_MAXIMO_EXPLICACION),
    explicaciones.filter((e) => e.length > LARGO_MAXIMO_EXPLICACION).join(" | "));

  // El CSS que la vista necesita tiene que existir de verdad.
  const css = estilosGlobales();
  for (const clase of CLASES_CALENDARIO) check(`existe la clase .${clase}`, css.includes(`.${clase}`));
  check("las celdas tienen foco visible por teclado", css.includes(".cal-dia:focus-visible"));
  check("la severidad no se distingue SOLO por color",
    /\.sev-grave\s*{[^}]*font-weight/.test(css),
    "en escala de grises o con daltonismo el color solo no distingue nada");
}
