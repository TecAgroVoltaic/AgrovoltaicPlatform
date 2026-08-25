"""Mapa de la arquitectura del agente Historico: lo que el agente ES, como dato.

Existe para que la consola pueda DIBUJAR el agente sin transcribirlo a mano, y
sigue la misma regla que su gemelo del Predictivo, que es la que hace valido todo
esto: **aca no se declara nada, se DERIVA**. Los nombres de las herramientas, sus
parametros y sus rangos salen de `tools.SCHEMAS`, exactamente los mismos objetos
que se le mandan al modelo; las familias salen de `tools.FAMILIA`; los tipos de
hallazgo salen del propio modulo que los emite. Si alguien agrega una herramienta
o cambia un umbral, el mapa cambia solo: no hay una segunda lista que mantener
sincronizada.

Que NO va aca:
  * el texto de los prompts (largo, y la vista no lo necesita);
  * la prosa del "por que" de cada herramienta, que es redaccion para un lector
    humano y vive en el front.

Una cosa que este mapa expone y el del Predictivo no: los UMBRALES. Son politica
discutible con el equipo y no fisica, y verlos es lo que convierte "el agente dice
que el dia es malo" en "lo marca porque cubrio menos del 80 % de las horas de sol".

Responsabilidad unica: armar el dict. Servirlo por HTTP es de api.py.
"""
from __future__ import annotations

from historico import config, tools
from historico.calidad import contexto
from historico.tools.hallazgos import QUE_ES

# Para que sirve cada familia, en una frase. Es lo unico declarativo del modulo:
# no se puede derivar de una estructura, y el nombre de la familia solo dice la
# division, no la razon.
OBJETIVO_FAMILIA = {
    "analisis": (
        "Que paso: energia generada, performance ratio, irradiancia, temperatura y "
        "tendencias sobre el historico ya corregido."
    ),
    "calidad": (
        "Si el dato sirve: completitud, validez, duplicados y como estuvo el cielo. "
        "Se responde LEYENDO el store de hallazgos, que escribe un barrido por lotes."
    ),
}

# Cuantos mensajes del historial sobreviven al recorte en `Historico.chat`.
HISTORIAL_MENSAJES = 16


def _catalogo_herramientas() -> list[dict]:
    """Las once herramientas con su esquema COMPLETO, el mismo que ve el modelo.

    `incrusta_confianza` no se escribe a mano: se detecta mirando si el modulo de
    la tool importa `contexto`. Asi, si alguien agrega una tool de agregacion y se
    olvida del bloque, el mapa lo muestra en cero y se nota.
    """
    import importlib

    salida = []
    for t in tools._TOOLS:
        esquema = t.SCHEMA
        modulo = importlib.import_module(t.__name__)
        salida.append({
            "nombre": esquema["name"],
            "familia": tools.FAMILIA[esquema["name"]],
            "descripcion": esquema.get("description", ""),
            "input_schema": esquema.get("input_schema", {}),
            "incrusta_confianza": hasattr(modulo, "contexto"),
            "ejecutor": "historico",
        })
    return salida


def _familias() -> dict:
    """Las dos familias, con sus herramientas, derivadas de `tools.FAMILIA`."""
    fam: dict[str, dict] = {}
    for nombre, familia in tools.FAMILIA.items():
        f = fam.setdefault(familia, {"herramientas": [],
                                     "objetivo": OBJETIVO_FAMILIA.get(familia)})
        f["herramientas"].append(nombre)
    return fam


def _umbrales() -> list[dict]:
    """Los numeros que deciden si un dato sirve, leidos de donde se aplican.

    No son fisica: son politica. Van con su significado para que se puedan
    discutir sin abrir el codigo.
    """
    return [
        {"clave": "COBERTURA_MINIMA", "valor": config.COBERTURA_MINIMA,
         "que_decide": "debajo de esta fraccion de las horas de sol, el dia se marca incompleto"},
        {"clave": "DENSIDAD_MINIMA", "valor": config.DENSIDAD_MINIMA,
         "que_decide": "faltan muestras dentro de la ventana que el logger si grabo"},
        {"clave": "FACTOR_HUECO", "valor": config.FACTOR_HUECO,
         "que_decide": "un salto de mas de N veces la cadencia del dia cuenta como hueco"},
        {"clave": "KT_DESPEJADO", "valor": config.KT_DESPEJADO,
         "que_decide": "indice de cielo despejado a partir del cual el momento es despejado"},
        {"clave": "KT_CUBIERTO", "valor": config.KT_CUBIERTO,
         "que_decide": "por debajo, cubierto"},
        {"clave": "KT_IMPOSIBLE", "valor": config.KT_IMPOSIBLE,
         "que_decide": "por encima es fisicamente imposible: dato invalido, no una nube"},
        {"clave": "VI_VARIABLE", "valor": config.VI_VARIABLE,
         "que_decide": ("indice de variabilidad para llamar variable al dia. CALIBRADO sobre "
                        "esta serie, no tomado de la literatura")},
        {"clave": "FRACCION_MATERIAL", "valor": contexto.FRACCION_MATERIAL,
         "que_decide": ("que fraccion de las lecturas tiene que tocar un hallazgo grave para "
                        "que el dia deje de ser utilizable")},
    ]


def mapa() -> dict:
    """El agente Historico como estructura. Todo derivado, nada transcrito."""
    return {
        "agente": "historico",
        "nombre": "Histórico",
        "objetivo": ("Responde que paso en el sistema PV de San Carlos, y si el dato en "
                     "que se apoya la respuesta sirve."),
        "modelo": config.MODEL,
        "familias": _familias(),
        "herramientas": _catalogo_herramientas(),
        "umbrales": _umbrales(),
        "hallazgos": {
            "tipos": [{"tipo": t, "que_es": q} for t, q in QUE_ES.items()],
            "severidades": ["grave", "aviso", "info"],
            "veredictos": ["ok", "aviso", "grave", "sin_datos"],
        },
        "deteccion": {
            "modo": "barrido por lotes",
            "escribe": ["hallazgos_calidad", "cielo_diario", "ventana_solar"],
            "por_que": ("recorrer los dias es caro y el resultado no depende de quien "
                        "pregunte: si la deteccion corriera dentro de una herramienta, cada "
                        "pregunta la repetiria y dos personas podrian obtener veredictos "
                        "distintos del mismo dia"),
        },
        "garantias": [
            {"que": "las herramientas no pueden escribir en la base",
             "como": "su pool de conexiones es de SOLO LECTURA (historico.db), no un permiso "
                     "que el prompt pueda pedir"},
            {"que": "no se reporta un agregado sin decir sobre cuantos dias utiles se calculo",
             "como": "el bloque `confianza` viaja DENTRO del payload de la herramienta, no en "
                     "una instruccion del prompt"},
        ],
        "limites": {
            "historial_mensajes": HISTORIAL_MENSAJES,
            "max_tokens": config.MAX_TOKENS,
        },
    }
