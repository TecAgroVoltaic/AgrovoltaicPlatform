/**
 * Arquitectura: la copia del mapa y que cada agente pida SU mapa.
 *
 * El defecto que este bloque impide que vuelva: `ArqView` tenía la ruta del
 * Predictivo fija y la barra la ofrecía bajo los dos agentes, así que con el
 * Histórico seleccionado se dibujaba el mapa del OTRO agente con este rótulo. Y
 * como la vista cae a una copia guardada cuando el servicio no responde, el mapa
 * equivocado ni siquiera mostraba un error: se veía terminado.
 */
import { check } from "./registro.mjs";
import { cargar, fuente } from "./entorno.mjs";

const ARQ = "app/components/console/arquitectura";

export function verificarArquitecturaRutas() {
  verificarCopiaPredictivo();

  const despachador = fuente(`${ARQ}/ArqView.tsx`);
  const pred = fuente(`${ARQ}/ArqPredictivo.tsx`);
  const hist = fuente(`${ARQ}/ArqHistorico.tsx`);
  const hook = fuente(`${ARQ}/useMapaHistorico.ts`);

  check("ArqView despacha por agente", /agent === "historico" \? <ArqHistorico/.test(despachador));
  check("el Predictivo pide SU ruta", /RUTA = "\/api\/predictivo\/arquitectura"/.test(pred));
  check("el Histórico pide SU ruta", /RUTA = "\/api\/historico\/arquitectura"/.test(hook));
  check("ninguna vista pide la ruta del otro agente",
    !/predictivo\/arquitectura/.test(hist + hook) && !/historico\/arquitectura/.test(pred));

  // La guarda que hace imposible el fallo silencioso.
  const { esMapaHistorico } = cargar(`${ARQ}/mapaHistorico.js`);
  const { RESPALDO_HISTORICO } = cargar(`${ARQ}/respaldoHistorico.js`);
  const { MAPA_RESPALDO } = cargar(`${ARQ}/mapaRespaldo.js`);

  check("la copia del Histórico ES del Histórico", esMapaHistorico(RESPALDO_HISTORICO));
  check("el mapa del PREDICTIVO no pasa por mapa del Histórico",
    esMapaHistorico(MAPA_RESPALDO) === false,
    "sin esta guarda, la copia del otro agente se dibujaría con el rótulo equivocado");
  check("ni un JSON vacío o nulo", !esMapaHistorico(null) && !esMapaHistorico({}));
}

// La vista de arquitectura tiene que seguir en pie con el servidor apagado: no
// muestra datos medidos, muestra la forma del agente. La copia tiene que traer
// todo lo que la vista lee, o la pantalla se cae igual pero mas tarde.
function verificarCopiaPredictivo() {
  const { MAPA_RESPALDO: m } = cargar(`${ARQ}/mapaRespaldo.js`);
  check("la copia trae los modos", m && m.modos && Object.keys(m.modos).length >= 2);
  check("trae las herramientas", Array.isArray(m.herramientas) && m.herramientas.length > 0);
  check("trae los limites", !!m.limites);
  check("y la ficha del agente", !!(m.agente && m.agente.nombre));
}
