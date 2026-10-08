// El núcleo del lienzo: el cerebro del agente, la capa determinista y la barrera.
import type { Ficha } from "./ficha";
import { ANCHO, COL } from "./geometria";

/** El cerebro: nodo grande con su propio interior, por eso va aparte. */
export const CEREBRO = {
  id: "agente",
  x: COL.cerebro, y: 60, w: ANCHO.cerebro, h: 250,
  ficha: {
    hover: "El lazo tool-use manual. El modelo decide qué herramienta llamar; el lazo la ejecuta y le devuelve el resultado; el modelo redacta.",
    hace: "Orquesta y nada más. **No sabe de física**: manda la pregunta al modelo con un juego de herramientas, ejecuta la que pida, le devuelve la salida cruda y repite hasta que el modelo cierra el turno. Es el patrón manual (no el *tool-runner* beta) para tener control del ciclo y no filtrar el razonamiento interno.",
    puntos: [
      "Cada turno devuelve la **traza**: los pasos del modelo, cada ejecución de herramienta con su entrada y su salida cruda, tokens, milisegundos y costo en USD.",
      "El prompt de sistema y el último esquema van con `cache_control: ephemeral`: no se pagan enteros en cada turno.",
      "El modelo elegido es liviano a propósito. El LLM solo orquesta; subir de gama es una variable de entorno.",
    ],
    archivo: "src/predictivo/agent/agent.py",
  } as Ficha,
};

/** La capa determinista: un panel con filas propias. */
export const CAPA = {
  x: COL.dato, y: 60, w: ANCHO.dato, h: 392,
  /** Puerto de entrada de las aristas que vienen de las herramientas. */
  puerto: { x: COL.dato, y: 256 },
  filas: [
    {
      id: "fisica", titulo: "physics.clear_sky_ghi",
      sub: "pvlib · Ineichen + Linke. Astronomía pura: no mira datos medidos",
      ficha: {
        hover: "El techo de cielo despejado, con pvlib. Es astronomía: no mira ningún dato medido.",
        hace: "Calcula cuánta irradiancia habría a esa hora exacta, en esa coordenada, con el cielo perfectamente limpio. De ahí sale el techo del gráfico y el denominador del índice kt*.",
        puntos: [
          "**No viola la barrera anti-fuga.** Evaluar el cielo despejado en un instante futuro es geometría solar, no un dato medido, y por eso el método puede usar «el sol del futuro» sin hacer trampa.",
          "Es justamente lo que la persistencia ingenua no sabe: si el objetivo cae más cerca del mediodía, el pronóstico sube aunque las nubes no cambien.",
        ],
        pruebas: ["`tests/test_physics.py`: 4 pruebas"],
        archivo: "src/predictivo/physics.py",
      } as Ficha,
    },
    {
      id: "forecasters", titulo: "forecasters/",
      sub: "persiste kt*, lo reexpande con el sol del futuro, banda ±1σ",
      ficha: {
        hover: "Persistencia inteligente de kt*, persistencia ingenua (el rival tonto) y humedad de suelo. Acá se produce el número.",
        hace: "**Persistencia inteligente**, en tres pasos: (1) calcular el índice de cielo despejado kt* de los últimos minutos (qué fracción del máximo posible dejaron pasar las nubes); (2) resumirlo con la mediana, asumiendo que las nubes persisten; (3) multiplicarlo por el techo del instante objetivo.",
        puntos: [
          "El supuesto es que **la nubosidad cambia más lento que el sol**. Cuando se rompe, el pronóstico falla, y eso es lo que el agente tiene que anticipar y declarar.",
          "`naive_persistence` repite la última lectura e ignora que el sol se mueve. Existe como rival: el `skill_pct` mide cuánto mejor es el método que ese piso.",
          "`humidity_persistence`: el suelo cambia lento, se persiste la mediana reciente. No hay análogo de cielo despejado.",
          "La banda es ±1σ de kt* sobre la ventana, reexpandida al techo del objetivo.",
        ],
        archivo: "src/predictivo/forecasters/",
      } as Ficha,
    },
    {
      id: "store", titulo: "store · Supabase",
      sub: "lecturas_ambientales_sc · solo lectura, cacheada en memoria",
      ficha: {
        hover: "La tabla lecturas_ambientales_sc, cacheada en memoria. Todo acceso pasa por get_recent_data, que corta en timestamp < ahora.",
        hace: "La serie de la que sale todo. Se carga una vez y se cachea; las herramientas no golpean la base en cada llamada.",
        puntos: [
          "`get_recent_data(now, lookback)` devuelve el intervalo `[now − lookback, now)`. El paréntesis final es la barrera: el forecaster jamás ve un dato con timestamp ≥ now.",
          "`valor_medido(t)` existe aparte y se consulta **después** de pronosticar. Nunca alimenta el cálculo: es lo que hace honesto al backtest.",
          "Conexión de solo lectura. El agente no escribe en ninguna base.",
        ],
        // La cobertura real NO se escribe acá: la inyecta el Lienzo desde
        // `mapa.datos`. Unas fechas a mano en un catálogo envejecen sin que
        // nadie se entere, que es justo la deriva que esta vista evita.
        limites: [
          "La ingesta está congelada: la última fecha de arriba es la última lectura que entró. `/salud/ingesta` responde 503 por dato viejo, que es el comportamiento correcto y no una falla del agente.",
          "La serie no es continua. Las herramientas reportan los huecos en vez de rellenarlos.",
        ],
        archivo: "src/predictivo/data.py",
      } as Ficha,
    },
  ],
};

export const BARRERA = {
  titulo: "Barrera anti-fuga",
  texto: "Toda lectura pasa por `get_recent_data`, que devuelve estrictamente `timestamp < ahora`.",
};
