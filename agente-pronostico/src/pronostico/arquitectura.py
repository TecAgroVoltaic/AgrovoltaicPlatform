"""
Mapa de la arquitectura del agente — lo que el agente ES, servido como dato.

Existe para que la consola pueda DIBUJAR el agente sin transcribirlo a mano. La
regla que hace valido todo esto: aca no se declara nada, se DERIVA. Los nombres
de las herramientas, sus parametros, sus rangos y en que modo vive cada una
salen de `agent.MODOS` y de los `input_schema` reales — exactamente los mismos
objetos que se le mandan al modelo. Si alguien agrega una herramienta o cambia
un rango, el mapa cambia solo; no hay una segunda lista que mantener sincronizada.

Que NO va aca:
  * el texto de los prompts (largo, y la vista no lo necesita: le alcanza con la
    intencion de cada modo, que si se escribe aca en una frase);
  * la prosa del "por que" de cada herramienta — eso vive en el front, porque es
    redaccion para un lector humano, no estructura verificable.

Responsabilidad unica: armar el dict. Servirlo por HTTP es de api.py.
"""
from __future__ import annotations

from pronostico import config, data, limites
from pronostico.agent import agent as _agente
from pronostico.domain import UNIDAD, Variable

# Cuantos mensajes del historial sobreviven al recorte en `ForecastAgent.chat`.
# Espejo de `ms[-16:]`; se cita aca para poder mostrarlo sin parsear codigo.
HISTORIAL_MENSAJES = 16

# Para que sirve cada modo, en una frase. Es lo unico declarativo del modulo: no
# se puede derivar de una estructura, y exponer el prompt entero seria ruido.
OBJETIVO_MODO = {
    "analisis": (
        "Explicar un resultado que YA se conoce. El agente puede ver lo que "
        "midio el sensor: su trabajo es interpretarlo, no adivinarlo."
    ),
    "prediccion": (
        "Pronosticar un momento SIN conocerlo. El juego de herramientas deja "
        "fuera la unica que revela lo medido, asi que la garantia no depende de "
        "que el modelo obedezca el prompt."
    ),
}


def _herramientas_de(perfil: dict) -> list[str]:
    """Nombres de las herramientas de cliente de un modo, en orden."""
    return [esquema["name"] for esquema in perfil["schemas"]]


def _modos() -> dict:
    """Los modos tal como los define `agent.MODOS`."""
    return {
        nombre: {
            "herramientas": _herramientas_de(perfil),
            "web_search": bool(perfil["web"]),
            "objetivo": OBJETIVO_MODO.get(nombre),
        }
        for nombre, perfil in _agente.MODOS.items()
    }


def _catalogo_herramientas() -> list[dict]:
    """Union de los esquemas de todos los modos, deduplicada por nombre.

    Cada entrada lleva su `input_schema` COMPLETO (el mismo que ve el modelo) y
    la lista de modos donde esta disponible — de ahi sale que `backtest` aparezca
    marcada como exclusiva de `analisis` sin que nadie lo escriba.
    """
    catalogo: dict[str, dict] = {}
    for nombre_modo, perfil in _agente.MODOS.items():
        for esquema in perfil["schemas"]:
            entrada = catalogo.setdefault(esquema["name"], {
                "nombre": esquema["name"],
                "descripcion": esquema.get("description", ""),
                "input_schema": esquema.get("input_schema", {}),
                "modos": [],
                "ejecutor": "pronostico",   # corre en nuestro proceso
            })
            entrada["modos"].append(nombre_modo)
    return list(catalogo.values())


def _horizonte_seg() -> dict | None:
    """Limites del horizonte, leidos del ESQUEMA que ve el modelo.

    Se prefiere el esquema sobre las constantes del modulo: si algun dia
    discreparan, lo que manda es lo que el modelo tiene enfrente.
    """
    for esquema in _catalogo_herramientas():
        prop = (esquema["input_schema"].get("properties") or {})
        for clave in ("horizon_seconds", "horizonte_seg"):
            campo = prop.get(clave)
            if campo and "minimum" in campo and "maximum" in campo:
                return {"min": campo["minimum"], "max": campo["maximum"]}
    return None


def _limites() -> dict:
    """Los topes reales, leidos de donde se aplican (no numeros pegados)."""
    return {
        "horizonte_seg": _horizonte_seg(),
        "llm_por_min": limites.LIMITE_LLM_POR_MIN,
        "datos_por_min": limites.LIMITE_DATOS_POR_MIN,
        "presupuesto_diario_usd": limites.PRESUPUESTO_DIARIO_USD,
        "umbral_cielo_despejado": config.UMBRAL_CS,
        "historial_mensajes": HISTORIAL_MENSAJES,
        "max_tokens": config.MAX_TOKENS,
    }


def _datos() -> dict:
    """Cobertura real por variable.

    Tolera el store caido A PROPOSITO: la arquitectura del agente no depende de
    que hoy haya datos. Un fallo aca degrada este bloque, no la respuesta.
    """
    salida: dict[str, dict] = {}
    for variable in (v.value for v in Variable):
        try:
            rango = dict(data.rango_datos(variable))
        except Exception as exc:
            salida[variable] = {"error": f"{type(exc).__name__}: {exc}"}
            continue
        rango["unidad"] = UNIDAD.get(variable)
        salida[variable] = rango
    return salida


def mapa() -> dict:
    """El agente descrito como dato, listo para dibujar."""
    return {
        "agente": {
            "nombre": "agente-pronostico",
            "modelo": config.MODEL,
            "sitio": {"nombre": config.SITE, "lat": config.LAT, "lon": config.LON,
                      "alt": config.ALT, "tz": config.TZ},
            "lazo": "tool-use manual",
        },
        "modos": _modos(),
        "herramientas": _catalogo_herramientas(),
        "web_search": {
            "nombre": _agente.WEB_SEARCH["name"],
            "tipo": _agente.WEB_SEARCH["type"],
            "max_uses": _agente.WEB_SEARCH.get("max_uses"),
            "ejecutor": "anthropic",       # la corre el proveedor, no nuestro lazo
            "modos": [m for m, p in _agente.MODOS.items() if p["web"]],
        },
        "limites": _limites(),
        "datos": _datos(),
    }
