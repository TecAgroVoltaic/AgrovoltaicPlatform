// Fichas de la familia CALIDAD del Agente Histórico: si el dato sirve. No
// calculan: leen el store que dejó el barrido.
import type { Ficha } from "../catalogo";

export const HERRAMIENTAS_CALIDAD: Record<string, Ficha> = {
  calidad_periodo: {
    resumen: "¿me puedo fiar de este período?",
    hover: "Veredicto agregado: cuántos días son utilizables, cuántos están degradados y cuántos no tienen datos.",
    hace: "Devuelve el veredicto del período y los problemas más frecuentes que lo explican.",
    ayuda: "Es la primera pregunta que hay que hacerse antes de mirar cualquier número del histórico, y hasta que existió esta familia no había forma de hacerla. Comparte el criterio con la vista de calidad y con el bloque `confianza`: **una sola definición de «día utilizable»**, así el agente no puede contradecir al cuadrito que estás mirando.",
    archivo: "tools/calidad_periodo.py",
  },
  hallazgos_calidad: {
    resumen: "qué está roto, dónde y desde cuándo",
    hover: "Detalle de los problemas detectados: tipo, variable, día y cuántas lecturas afecta.",
    hace: "El detalle detrás del veredicto. Filtrable por tipo, severidad y variable.",
    ayuda: "Devuelve `que_es` junto a cada hallazgo en vez de solo el nombre interno. Un payload que dijera `saturado_85` a secas obliga al modelo a adivinar qué significa, y adivinar es justo lo que no queremos que haga.",
    archivo: "tools/hallazgos.py",
  },
  cielo_periodo: {
    resumen: "cómo estuvo el cielo",
    hover: "Índice de cielo despejado (kt), índice de variabilidad y reparto de días entre despejado, parcial, cubierto y variable.",
    hace: "Caracteriza el cielo del período: cuánta luz llegó (kt) y qué tan intermitente fue (índice de variabilidad).",
    ayuda: "Separa dos cosas que la irradiancia cruda mezcla. **kt** dice cuánta luz llegó, quitándole la parábola del sol, y por eso «0,9 a mediodía» y «0,9 a las siete» significan lo mismo. El **índice de variabilidad** dice cómo llegó: un día de kt 0,5 puede ser una capa uniforme toda la mañana o el sol entrando y saliendo cada dos minutos, y para un inversor no son lo mismo.",
    archivo: "tools/cielo_periodo.py",
  },
  diagnostico_dia: {
    resumen: "todo lo que se sabe de un día",
    hover: "Los hallazgos de un día concreto y, si no hay datos, de cuándo a cuándo va el hueco al que pertenece.",
    hace: "Para una fecha: cuántas lecturas grabó cada fuente contra cuántas debía, el veredicto, la lista completa de hallazgos, el cielo, los días vecinos y los bordes del hueco.",
    ayuda: "Es la que hace posible explicar un cuadrito del mapa de días sin inventar. El caso más frecuente de ese mapa es el día **vacío**: 295 de 569 días no tienen ni una fila, y ahí una consulta de hallazgos devuelve una lista vacía, que es justo el material con el que un modelo fabrica un motivo. Esta herramienta devuelve lo que sí es verificable de la ausencia (a qué hueco pertenece, cuál fue el último día grabado) y declara en su propia salida que el store registra la falta de dato, **no su causa**.",
    limites: [
      "No dice POR QUÉ faltó el dato, porque eso no está registrado en ninguna parte. Dice desde cuándo hasta cuándo falta, y ahí se detiene.",
    ],
    archivo: "tools/diagnostico_dia.py",
  },
  arquitectura_agente: {
    resumen: "el agente explicándose a sí mismo",
    hover: "Devuelve cómo está construido el agente: herramientas, umbrales, tipos de hallazgo y garantías, derivados del código.",
    hace: "Devuelve el mismo mapa que dibuja esta pantalla: las familias con sus herramientas, los umbrales con qué decide cada uno, los tipos de hallazgo, cómo corre la detección y qué garantías da.",
    ayuda: "Sin ella, «¿qué herramientas tenés?» o «¿qué umbral usás para decir que un día está incompleto?» se contestaban **de memoria**, que en un modelo de lenguaje es un sinónimo educado de inventar. Y son preguntas legítimas: quien evalúa el agente necesita poder auditarlo hablándole. Como el mapa se deriva del código, el agente no puede describirse distinto de como está construido ni quedarse desactualizado cuando alguien agrega una herramienta.",
    limites: [
      "Poda los `input_schema` de las herramientas. No por tamaño: el modelo **ya los tiene delante**, son la definición de sus propias herramientas. Repetirlos sería pagar dos veces por el mismo dato.",
    ],
    archivo: "tools/arquitectura_agente.py",
  },
};
