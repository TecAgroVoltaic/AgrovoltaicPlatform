/**
 * El chat: visible siempre y atado al agente de la vista.
 *
 * El defecto: el flag del chat del Histórico leía `AGENTE_ANALIZADOR` y el entorno
 * tenía `AGENTE_HISTORICO`. No coincidían, así que el chat NO SALÍA, y como el
 * valor por defecto era apagado, el síntoma era una pantalla a la que le falta
 * algo en silencio. Un renombre a medias no puede volver a costar eso.
 */
import { check } from "./registro.mjs";
import { cargar, estilosGlobales, fuente } from "./entorno.mjs";
import { fuenteConsola } from "./consola.mjs";

const ANCHO_MINIMO_PARA_APARTAR_CONTENIDO = 1900;

export function verificarChat() {
  verificarInterruptor();

  // La carpeta entera: el widget puede partirse en subcomponentes y los
  // invariantes siguen valiendo.
  const widget = fuente("app/components/chat");
  check("el chat se monta atado al agente de la vista",
    /<ChatWidget agent={agent}/.test(fuenteConsola()));

  // Las claves de los hilos son los IDs REALES. Estuvieron mal y, como el acceso
  // es por índice, no falló nada: simplemente no salía ni un ejemplo.
  const claves = [...widget.matchAll(/^\s{2}(\w+): \[$/gm)].map((m) => m[1]);
  check("los ejemplos del chat están bajo los IDs reales de los agentes",
    claves.length === 2 && claves.includes("historico") && claves.includes("predictivo"),
    `claves: ${claves.join(", ") || "ninguna"}`);
  check("el hilo se inicializa con esos mismos IDs",
    /useState<Threads>\(\{ historico: \[\], predictivo: \[\] \}\)/.test(widget));
  check("el agente predictivo se llama por su nombre en la cabecera del chat",
    /"Agente Predictivo"/.test(widget), "decía «Pronóstico», de un renombre a medias");

  // Lo que el usuario pidió: que el agente conteste de todo, incluido sobre sí mismo.
  check("hay un ejemplo que pregunta por el agente mismo",
    /herramientas tenés|Cómo estás construido/.test(widget));
  check("y el chat lo anuncia", /cómo está construido/.test(widget));

  // El panel abierto no puede deformar la página. Reservarle 580 px en una
  // pantalla de 1400 dejaba el lienzo de arquitectura (1140 px fijos) en media
  // columna: había que leerlo por una rendija.
  const css = estilosGlobales();
  const reserva = css.match(/@media \(min-width:(\d+)px\)\{ body\.chat-abierto/);
  check("el chat solo aparta el contenido si lo que queda es usable",
    reserva && Number(reserva[1]) >= ANCHO_MINIMO_PARA_APARTAR_CONTENIDO,
    reserva ? `reserva desde ${reserva[1]}px, y el lienzo solo mide 1140` : "no hay regla");
  check("por debajo de eso el panel flota", /\.chat-panel \{ position:fixed/.test(css));

  check("la cabecera del chat no repite el nombre del agente",
    !/\{nombreAgente\} · \{contexto\}/.test(widget),
    "`contexto` ya empieza con el nombre: salía «Agente Histórico · Agente Histórico · …»");
}

function verificarInterruptor() {
  const agentes = cargar("app/lib/agentes.js");
  const antes = process.env[agentes.ENV_HISTORICO];
  delete process.env[agentes.ENV_HISTORICO];
  check("sin variable de entorno, el chat del Histórico ESTÁ",
    agentes.historicoActivo() === true,
    "apagado por defecto ya escondió el chat una vez sin decir nada");
  process.env[agentes.ENV_HISTORICO] = "off";
  check("y se puede apagar a propósito", agentes.historicoActivo() === false);
  process.env[agentes.ENV_HISTORICO] = "on";
  check("«on» también lo enciende", agentes.historicoActivo() === true);
  if (antes === undefined) delete process.env[agentes.ENV_HISTORICO];
  else process.env[agentes.ENV_HISTORICO] = antes;

  check("la variable se llama como el agente",
    agentes.ENV_HISTORICO === "AGENTE_HISTORICO",
    `es ${agentes.ENV_HISTORICO}: si no coincide con el entorno, el chat desaparece`);
}
