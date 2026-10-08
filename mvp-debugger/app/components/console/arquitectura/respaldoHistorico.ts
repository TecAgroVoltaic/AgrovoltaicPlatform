// Copia guardada del mapa del Agente Histórico. NO se edita a mano.
//
// Para qué: el servidor de datos se apaga fuera del horario laboral, y la
// arquitectura del agente no es un dato medido (no cambia con la hora, cambia con
// el código). Dejar la pantalla vacía a las 20:00 sería perder información que ya
// se tenía. La vista dibuja esta copia y lo dice con un cartel.
//
// Se genera del CÓDIGO del agente, no de lo que responde el servidor. Los dos
// pueden diferir (el contenedor desplegado suele ir detrás), y de las dos verdades
// esta es la útil: la copia solo se usa cuando el servicio no contesta, y entonces
// no hay nada con qué compararla. Además así el arnés puede exigir que TODA
// herramienta del código tenga su ficha en la consola, cosa que una captura del
// servidor viejo no permitía.
//
// Cómo se regenera, desde la raíz de agente-historico:
//
//   python -c "import sys,json; sys.path.insert(0,'src'); \
//     from historico.arquitectura import mapa; \
//     print(json.dumps(mapa(), ensure_ascii=False, indent=2))"
//
// Si queda vieja, la vista lo delata sola: compara el catálogo de prosa contra las
// herramientas del mapa y avisa de las diferencias en pantalla.
//
// El JSON generado se reparte en `respaldoHistorico/` (herramientas por familia
// y criterios) para respetar el tope de 150 líneas por archivo. Al regenerar,
// cada bloque va a su archivo: identidad, familias y límites quedan acá.
import type { MapaHistorico } from "./mapaHistorico";
import { CRITERIOS_HISTORICO } from "./respaldoHistorico/criterios";
import { HERRAMIENTAS_ANALISIS_ENERGIA } from "./respaldoHistorico/herramientasAnalisisEnergia";
import { HERRAMIENTAS_ANALISIS_SERIES } from "./respaldoHistorico/herramientasAnalisisSeries";
import { HERRAMIENTAS_CALIDAD_DIA } from "./respaldoHistorico/herramientasCalidadDia";
import { HERRAMIENTAS_CALIDAD_PERIODO } from "./respaldoHistorico/herramientasCalidadPeriodo";

export const RESPALDO_HISTORICO: MapaHistorico = {
  "agente": "historico",
  "nombre": "Histórico",
  "objetivo": "Responde qué pasó en el sistema PV de San Carlos, y si el dato en que se apoya la respuesta sirve.",
  "modelo": "claude-haiku-4-5",
  "familias": {
    "analisis": {
      "herramientas": [
        "energia_por_arreglo",
        "performance_ratio",
        "irradiancia_resumen",
        "temperatura_por_arreglo",
        "tendencia",
        "cobertura_datos",
        "catalogo_variables",
        "graficar"
      ],
      "objetivo": "Qué pasó: energía generada, performance ratio, irradiancia, temperatura y tendencias sobre el histórico ya corregido."
    },
    "calidad": {
      "herramientas": [
        "calidad_periodo",
        "hallazgos_calidad",
        "cielo_periodo",
        "diagnostico_dia",
        "arquitectura_agente"
      ],
      "objetivo": "Si el dato sirve: completitud, validez, duplicados y cómo estuvo el cielo. Se responde LEYENDO el store de hallazgos, que escribe un barrido por lotes."
    }
  },
  "herramientas": [
    ...HERRAMIENTAS_ANALISIS_ENERGIA,
    ...HERRAMIENTAS_ANALISIS_SERIES,
    ...HERRAMIENTAS_CALIDAD_PERIODO,
    ...HERRAMIENTAS_CALIDAD_DIA,
  ],
  ...CRITERIOS_HISTORICO,
  "limites": {
    "historial_mensajes": 16,
    "max_tokens": 2048
  }
};
