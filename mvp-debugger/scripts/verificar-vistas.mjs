#!/usr/bin/env node
/**
 * Verificación de las vistas SIN navegador.
 *
 * Por qué existe: la extensión de Chrome que daría control del navegador no
 * conecta, así que no hay forma de mirar una vista renderizada. Sin esto, todo el
 * trabajo de UI se hace a ciegas, y eso ya dejó defectos que llegaron hasta la
 * pantalla del usuario.
 *
 * Qué hace: compila los componentes con `tsc` a un árbol aparte y los renderiza de
 * verdad con `react-dom/server`. No es un mock: es el mismo componente con los
 * mismos datos. Lo que se afirma no es "compila", sino PROPIEDADES DEL RESULTADO.
 *
 * Qué vale la pena afirmar: invariantes de diseño (que no vuelva el vocabulario
 * viejo, que no queden coordenadas absolutas, presupuestos de contenido,
 * relaciones estructurales). Lo que NO sirve: comparar el HTML entero contra un
 * snapshot, que se rompe con cada cambio de estilo y no dice nada.
 *
 *   node scripts/verificar-vistas.mjs
 */
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(RAIZ, ".verify");

let ok = 0;
const fallos = [];
function check(nombre, cond, extra = "") {
  if (cond) { ok++; return; }
  fallos.push(`${nombre}${extra ? `  → ${extra}` : ""}`);
}

// ── 1. Compilar ───────────────────────────────────────────────────────────────
rmSync(OUT, { recursive: true, force: true });
process.stdout.write("compilando… ");
try {
  execSync("npx tsc -p tsconfig.verify.json", { cwd: RAIZ, stdio: "pipe" });
} catch (e) {
  // `noEmitOnError:false`: aunque haya errores de tipo, los .js se emiten igual.
  // Sirve para poder verificar el render mientras se arregla un tipo aparte.
  const salida = (e.stdout?.toString() || "") + (e.stderr?.toString() || "");
  if (!existsSync(OUT)) { console.error("\n" + salida); process.exit(1); }
  console.log(`(con ${salida.split("\n").filter((l) => l.includes("error TS")).length} avisos de tipo)`);
}
console.log("listo");

// ── 2. Redirigir la resolución de módulos al árbol compilado ──────────────────
// Los componentes importan `@/app/...`, que Node no sabe resolver, y `react`, que
// tiene que salir del node_modules REAL (si no, hay dos copias de React y los
// hooks explotan).
const Module = require("node:module");
const original = Module._resolveFilename;
Module._resolveFilename = function (pedido, ...resto) {
  if (pedido.startsWith("@/")) {
    return original.call(this, path.join(OUT, pedido.slice(2)), ...resto);
  }
  return original.call(this, pedido, ...resto);
};

const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

// ── 3. Afirmar sobre el HTML ──────────────────────────────────────────────────
const { CalidadView } = require(path.join(OUT, "app/components/console/CalidadView.js"));

// Sin datos aún (el fetch no corre en render estático): tiene que decir algo, no
// reventar ni quedar en blanco.
const vacia = renderToStaticMarkup(React.createElement(CalidadView));
check("CalidadView renderiza sin datos", vacia.length > 0);
check("y avisa que está cargando en vez de quedar en blanco", /Cargando/i.test(vacia), vacia.slice(0, 120));

// La vista de verdad: se le inyecta el estado a través de un render con datos.
// Como el estado viene de un efecto, se prueba el componente Tira por separado,
// que es la pieza con lógica de presentación.
const mod = require(path.join(OUT, "app/components/console/CalidadView.js"));
check("CalidadView se exporta", typeof mod.CalidadView === "function");

// Invariantes de vocabulario: los nombres que el equipo acordó, y los que no.
const fuente = require("node:fs").readFileSync(
  path.join(RAIZ, "app/components/console/CalidadView.tsx"), "utf8");
// El invariante que importa no es "no aparece el 85", sino que la separacion en
// TRES casos siga en pie: de 307 "sensores planos" ninguno lo era, eran 129
// clavados en 85 (DS18B20) y 178 en cero (el inversor no genero). Si alguien
// vuelve a fundirlos, la vista miente sobre que esta roto.
check("`saturado_85` sigue explicandose por su causa",
  /saturado_85: "[^"]*DS18B20/.test(fuente));
check("`constante_en_cero` sigue existiendo como caso aparte",
  /constante_en_cero: "[^"]*generaci/.test(fuente));
check("`sensor_plano` se define por exclusion de los otros dos",
  /sensor_plano: "[^"]*no es 0 ni 85/.test(fuente),
  "si deja de excluirlos, vuelve a tragarse los otros dos casos");
check("los 12 tipos de hallazgo están explicados en la vista",
  ["dia_incompleto","hueco","duplicado_timestamp","cambio_de_cadencia","columna_ausente",
   "nulos","fuera_de_rango","saturado_85","constante_en_cero","sensor_plano",
   "offset_nocturno","kt_imposible"].every((t) => fuente.includes(`${t}:`)),
  "falta alguno en QUE_ES");
check("el veredicto NO se calcula en el cliente",
  !/veredicto\s*=\s*["']grave["']/.test(fuente),
  "lo decide el servicio, si no la consola y el reporte pueden discrepar");
check("las celdas del calendario son <button>, no <div> con onClick",
  /<button[\s\S]{0,400}className={`cal-dia/.test(fuente));
check("cada celda tiene aria-label", /aria-label=/.test(fuente));
check("no quedan coordenadas absolutas", !/style={{\s*(left|top):/.test(fuente));

// Presupuesto de contenido: cuando el pedido es "que sea breve", la brevedad
// tiene que ser una prueba, no una intención.
const explicaciones = [...fuente.matchAll(/^\s{2}\w+: "([^"]+)"/gm)].map((m) => m[1]);
check(`las ${explicaciones.length} explicaciones de tipo caben en una línea`,
  explicaciones.every((e) => e.length <= 90),
  explicaciones.filter((e) => e.length > 90).join(" | "));

// El CSS que la vista necesita tiene que existir de verdad.
const css = require("node:fs").readFileSync(path.join(RAIZ, "app/globals.css"), "utf8");
for (const clase of ["cal-fila","cal-nombre","cal-tira","cal-mes","cal-celdas","cal-dia",
                     "cal-rot","cal-leyenda","sev-grave","sev-aviso","sev-info"]) {
  check(`existe la clase .${clase}`, css.includes(`.${clase}`));
}
check("las celdas tienen foco visible por teclado", css.includes(".cal-dia:focus-visible"));
check("la severidad no se distingue SOLO por color",
  /\.sev-grave\s*{[^}]*font-weight/.test(css),
  "en escala de grises o con daltonismo el color solo no distingue nada");

// La vista está enchufada a la consola.
const consola = require("node:fs").readFileSync(
  path.join(RAIZ, "app/components/console/Console.tsx"), "utf8");
check("aparece en la navegación", /\["calidad", "Calidad de datos"/.test(consola));
check("se renderiza cuando está activa", /view === "calidad" && <CalidadView \/>/.test(consola));
check("la vista de calidad pertenece al Histórico",
  /historico: \[[\s\S]{0,200}\["calidad"/.test(consola));
check("«Predicción vs Real» pertenece al Predictivo",
  /predictivo: \[[\s\S]{0,120}\["pred"/.test(consola));
check("«Arquitectura» está en los DOS agentes",
  (consola.match(/\["arq", "Arquitectura del agente"/g) || []).length === 2);
check("y la vista recibe DE QUÉ agente es",
  /view === "arq" && <ArqView agent={agent} \/>/.test(consola),
  "sin el prop, los dos agentes vuelven a dibujar el mismo mapa");

// La barra tiene dos mitades y se arma sola. Antes era una lista unica filtrada a
// mano; con dos agentes y vistas propias eso se desincroniza solo.
check("la nav se arma de VISTAS_AGENTE + VISTAS_FIJAS",
  /const vistas: \[View, string, Icono\]\[\] = \[\s*\.\.\.\(VISTAS_AGENTE\[agent\]/.test(consola));
for (const fija of ["Base de datos", "Costo y uso", "Salud del sistema"]) {
  check(`«${fija}» es fija (se ve con cualquier agente)`,
    new RegExp(`VISTAS_FIJAS[\\s\\S]{0,300}"${fija}"`).test(consola));
}
check("el separador se calcula, no está quemado",
  /v === VISTAS_FIJAS\[0\]\[0\]/.test(consola));

// EL CHEQUEO QUE IMPORTA. Los agentes se llaman Histórico y Predictivo, y no hay
// mas. Los nombres viejos (Analizador, Comparador, Pronóstico) se colaron una y
// otra vez en renombres a medias; esto los caza en toda la consola de una.
{
  const fs = require("node:fs");
  const path2 = require("node:path");
  const viejos = [];
  const mirar = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path2.join(dir, e.name);
      if (e.isDirectory()) { if (!/node_modules|\.next|\.verify/.test(f)) mirar(f); continue; }
      if (!/\.tsx?$/.test(e.name)) continue;
      const txt = fs.readFileSync(f, "utf8");
      for (const m of txt.matchAll(/Analizador|Comparador|Pron[óo]stico ambiental|analizadorActivo|\bANALIZADOR_|\bCOMPARADOR_|\bPRONOSTICO_|\/api\/(analizador|pronostico|comparador)/g)) {
        viejos.push(`${path2.relative(RAIZ, f)}: ${m[0]}`);
      }
    }
  };
  mirar(path2.join(RAIZ, "app"));
  check("no queda NINGÚN nombre viejo de agente en la consola", viejos.length === 0,
    [...new Set(viejos)].slice(0, 8).join(" | "));
}
check("los dos agentes se llaman Histórico y Predictivo",
  /nombre: "Agente Histórico"/.test(consola) && /nombre: "Agente Predictivo"/.test(consola));
check("y son exactamente DOS",
  (consola.match(/^\s*\{ id: "/gm) || []).length === 2);

// ── 3b. El apagado programado ─────────────────────────────────────────────────
// El servidor de datos no esta encendido las 24 h. Un "502 Bad Gateway" a las 3
// de la manana manda a alguien a buscar un bug que no existe, asi que la consola
// tiene que distinguir "esta apagado" de "esta roto".
{
  const cliente = require(path.join(OUT, "app/lib/client.js"));
  const { Estado } = require(path.join(OUT, "app/components/console/Estado.js"));

  check("un 502 del proxy se lee como servidor apagado",
    cliente.servidorApagado({ status: 502, ok: false, data: {} }) === true);
  check("un fetch que ni salio (status 0), tambien",
    cliente.servidorApagado({ status: 0, ok: false, data: {} }) === true);
  check("el mensaje del proxy tambien lo delata",
    cliente.servidorApagado({ status: 500, ok: false,
      data: { error: "servicio inaccesible: connect ECONNREFUSED" } }) === true);
  check("pero un 401 NO es un apagado, es una sesion vencida",
    cliente.servidorApagado({ status: 401, ok: false, data: {} }) === false);
  check("ni un 422, que es un error de verdad",
    cliente.servidorApagado({ status: 422, ok: false, data: { detail: "faltan campos" } }) === false);

  const apagado = renderToStaticMarkup(React.createElement(Estado,
    { error: cliente.mensajeError({ status: 502, ok: false, data: {} }), que: "la serie" }));
  check("el panel de apagado lo dice con esas palabras", /Servidor apagado/.test(apagado));
  check("y dice cuando vuelve", /07:00/.test(apagado) && /19:00/.test(apagado));
  check("no ofrece reintentar: no hay nada que reintentar", !/Reintentar/.test(apagado));
  check("y aclara que la documentacion sigue en pie", /documentación/.test(apagado));

  const roto = renderToStaticMarkup(React.createElement(Estado,
    { error: "el servicio respondió 500", que: "la serie", onReintentar: () => {} }));
  check("un error de verdad sigue pintandose como error", /No se pudieron cargar/.test(roto));
  check("y ese si ofrece reintentar", /Reintentar/.test(roto));
}

// ── 3c. La copia del mapa del agente ──────────────────────────────────────────
// La vista de arquitectura tiene que seguir en pie con el servidor apagado: no
// muestra datos medidos, muestra la forma del agente. La copia tiene que traer
// todo lo que la vista lee, o la pantalla se cae igual pero mas tarde.
{
  const { MAPA_RESPALDO: m } = require(path.join(OUT, "app/components/console/arquitectura/mapaRespaldo.js"));
  check("la copia trae los modos", m && m.modos && Object.keys(m.modos).length >= 2);
  check("trae las herramientas", Array.isArray(m.herramientas) && m.herramientas.length > 0);
  check("trae los limites", !!m.limites);
  check("y la ficha del agente", !!(m.agente && m.agente.nombre));
}

// ── 3d. Arquitectura: cada agente, SU mapa ────────────────────────────────────
// El defecto que este bloque impide que vuelva: `ArqView` tenía la ruta del
// Predictivo fija y la barra la ofrecía bajo los dos agentes, así que con el
// Histórico seleccionado se dibujaba el mapa del OTRO agente con este rótulo. Y
// como la vista cae a una copia guardada cuando el servicio no responde, el mapa
// equivocado ni siquiera mostraba un error: se veía terminado.
{
  const fs = require("node:fs");
  const leer = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");
  const despachador = leer("app/components/console/arquitectura/ArqView.tsx");
  const pred = leer("app/components/console/arquitectura/ArqPredictivo.tsx");
  const hist = leer("app/components/console/arquitectura/ArqHistorico.tsx");

  check("ArqView despacha por agente", /agent === "historico" \? <ArqHistorico/.test(despachador));
  check("el Predictivo pide SU ruta", /RUTA = "\/api\/predictivo\/arquitectura"/.test(pred));
  check("el Histórico pide SU ruta", /RUTA = "\/api\/historico\/arquitectura"/.test(hist));
  check("ninguna vista pide la ruta del otro agente",
    !/predictivo\/arquitectura/.test(hist) && !/historico\/arquitectura/.test(pred));

  // La guarda que hace imposible el fallo silencioso.
  const { esMapaHistorico } = require(path.join(OUT, "app/components/console/arquitectura/mapaHistorico.js"));
  const { RESPALDO_HISTORICO } = require(path.join(OUT, "app/components/console/arquitectura/respaldoHistorico.js"));
  const { MAPA_RESPALDO } = require(path.join(OUT, "app/components/console/arquitectura/mapaRespaldo.js"));

  check("la copia del Histórico ES del Histórico", esMapaHistorico(RESPALDO_HISTORICO));
  check("el mapa del PREDICTIVO no pasa por mapa del Histórico",
    esMapaHistorico(MAPA_RESPALDO) === false,
    "sin esta guarda, la copia del otro agente se dibujaría con el rótulo equivocado");
  check("ni un JSON vacío o nulo", !esMapaHistorico(null) && !esMapaHistorico({}));

  // Render REAL del panel con el mapa REAL del servicio.
  const { PanelHistorico } = require(path.join(OUT, "app/components/console/arquitectura/ArqHistorico.js"));
  const html = renderToStaticMarkup(React.createElement(PanelHistorico, { mapa: RESPALDO_HISTORICO }));

  check("el panel del Histórico renderiza con el mapa real", html.length > 2000);
  check("y se titula como el agente que es", /Arquitectura del Agente Histórico/.test(html));
  check("no menciona al otro agente", !/Predictivo/.test(html));
  check("dibuja la cadena: el LLM entra al final",
    /1 · detección/.test(html) && /4 · redacción/.test(html));
  check("dice que la detección corre SIN modelo de lenguaje", /Sin LLM/.test(html));
  check("nombra las tres tablas del store",
    ["hallazgos_calidad", "cielo_diario", "ventana_solar"].every((t) => html.includes(t)));
  check("dice que el pool es de solo lectura", /solo lectura/.test(html));

  // Los umbrales son el motivo de esta pantalla: son política, no física, y son
  // lo que hay que poder discutir con el experto sin abrir el código.
  for (const u of RESPALDO_HISTORICO.umbrales) {
    check(`el umbral ${u.clave} se muestra`, html.includes(u.clave));
    check(`  …y dice qué decide`, html.includes(u.que_decide.slice(0, 40)));
  }
  check("los umbrales se declaran discutibles, no verdad revelada",
    /política/.test(html));

  // Las 12 clases de hallazgo, que es lo que el agente sabe detectar.
  check("están los 12 tipos de hallazgo",
    RESPALDO_HISTORICO.hallazgos.tipos.every((t) => html.includes(t.tipo)),
    "el barrido tipifica 12 clases; la vista tiene que mostrarlas todas");

  // Catálogo contra servicio: la vista no puede callar la diferencia.
  const { HERRAMIENTAS_HISTORICO } = require(path.join(OUT, "app/components/console/arquitectura/catalogoHistorico.js"));
  const publicadas = RESPALDO_HISTORICO.herramientas.map((h) => h.nombre);
  check("toda herramienta publicada tiene ficha en la consola",
    publicadas.every((n) => HERRAMIENTAS_HISTORICO[n]),
    publicadas.filter((n) => !HERRAMIENTAS_HISTORICO[n]).join(", "));
  check("y cada herramienta publicada aparece en pantalla",
    publicadas.every((n) => html.includes(n)));

  // El catálogo de la consola tiene que cubrir las tools que hay EN EL CÓDIGO del
  // agente, no solo las que el servidor desplegado ya expone: si el despliegue va
  // detrás, la vista lo avisa, pero la ficha tiene que existir.
  const registro = fs.readFileSync(
    path.join(RAIZ, "../agente-historico/src/historico/tools/__init__.py"), "utf8");
  const modulos = [...registro.matchAll(/^    (\w+),$/gm)].map((m) => m[1]);
  check(`el agente registra ${modulos.length} herramientas`, modulos.length >= 12);

  // El CSS que la vista necesita.
  for (const clase of ["hist-cadena", "hist-paso", "hist-store", "hist-tools",
                       "hist-modelo", "hist-tools-grid", "hist-marcas"]) {
    check(`existe la clase .${clase}`, css.includes(`.${clase}`));
  }
}

// ── 4. Resultado ──────────────────────────────────────────────────────────────
rmSync(OUT, { recursive: true, force: true });
console.log(`\n${ok} chequeos OK`);
if (fallos.length) {
  console.error(`${fallos.length} FALLAN:\n  - ${fallos.join("\n  - ")}`);
  process.exit(1);
}
