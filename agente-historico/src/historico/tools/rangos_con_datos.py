"""Tool `rangos_con_datos` — QUE dias tienen datos, en tramos, y cual es el mas cercano.

Existe para que el asistente vaya un paso adelante: ante "el 12 de agosto" (vacio) o
"dame 15 dias", en vez de disculparse propone el dia o el tramo con datos mas cercano.
Se apoya en `analitica.cobertura_dias` (la misma fuente que el calendario de la
consola, cacheada) y recorta: el modelo recibe tramos, nunca la lista de ~330 dias.

NO confundir con sus vecinas: `cobertura_datos` cuenta filas en un periodo y
`completitud_datos` mide lo real contra lo esperado a la cadencia. Esta solo dice en
que dias el logger grabo algo, que es lo que hace falta para elegir FECHAS.
"""
from __future__ import annotations

from datetime import date

from historico.analitica import cobertura_dias
from historico.tools import _rangos, opciones

CUALQUIERA = "cualquiera"
FUENTES = (CUALQUIERA, cobertura_dias.ELECTRICO, cobertura_dias.RADIACION)
MAX_TRAMOS = 12
MAX_ULTIMOS = 60
_NOTA = ("`hasta` es EXCLUSIVO (listo para otras herramientas); al usuario decile "
         "`ultimo_dia`. Un dia cuenta si grabo al menos una lectura de la fuente.")

SCHEMA = {
    "name": "rangos_con_datos",
    "description": (
        "Dice en que dias HAY datos: tramos contiguos (los mas recientes primero), los "
        "ultimos N dias con datos, el dia con datos mas cercano a una fecha y los huecos "
        "de un rango. Usala ANTES de responder sobre un dia o rango concreto, cuando "
        "pidan 'N dias', 'la ultima semana' o una fecha, y SIEMPRE que otra herramienta "
        "devuelva vacio: con ella propones el dia o tramo con datos mas cercano en vez "
        "de disculparte. `ultimos_n_dias` cuenta dias CON datos, no de calendario."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "fuente": {"type": "string", "enum": list(FUENTES),
                       "description": f"Que fuente debe tener datos. Default '{CUALQUIERA}'."},
            "ultimos_n_dias": {"type": "integer", "minimum": 1, "maximum": MAX_ULTIMOS,
                               "description": "Los ultimos N dias con datos (antes de "
                                              "`hasta` si se pasa)."},
            "cerca_de": {"type": "string",
                         "description": "Fecha 'aaaa-mm-dd': el dia con datos mas cercano."},
            **opciones.ventana(),
        },
        "additionalProperties": False,
    },
}


def _fecha(valor: str | None, campo: str) -> str | None:
    if valor is None:
        return None
    try:
        return date.fromisoformat(valor.strip()[:10]).isoformat()
    except ValueError as exc:
        raise ValueError(f"`{campo}` no es una fecha 'aaaa-mm-dd': {valor!r}") from exc


def dias_de_fuente(cobertura: dict, fuente: str) -> list[str]:
    """Los dias con datos de la fuente pedida, ascendentes."""
    if fuente == CUALQUIERA:
        return cobertura["dias"]
    if fuente not in cobertura["fuentes"]:
        raise ValueError(f"fuente desconocida {fuente!r}; validas: {', '.join(FUENTES)}")
    return cobertura["fuentes"][fuente]


def componer(cobertura: dict, fuente: str = CUALQUIERA, ultimos_n_dias: int | None = None,
             cerca_de: str | None = None, desde: str | None = None,
             hasta: str | None = None) -> dict:
    """El payload para el LLM a partir de `cobertura_dias.calcular()`. Pura."""
    dias = dias_de_fuente(cobertura, fuente)
    desde, hasta, cerca_de = (_fecha(desde, "desde"), _fecha(hasta, "hasta"),
                              _fecha(cerca_de, "cerca_de"))
    todos = _rangos.tramos(dias)
    salida: dict = {
        "fuente": fuente,
        "desde": dias[0] if dias else None,
        "hasta": todos[0]["hasta"] if todos else None,
        "n_dias": len(dias),
        "n_tramos": len(todos),
        "tramos": todos[:MAX_TRAMOS],
    }
    if ultimos_n_dias is not None:
        cantidad = min(int(ultimos_n_dias), MAX_ULTIMOS)
        salida["ultimos"] = _rangos.ultimos(_rangos.dentro(dias, desde, hasta), cantidad)
    if cerca_de is not None:
        siguiente = date.fromisoformat(cerca_de) + _rangos.UN_DIA
        salida["mas_cercano"] = _rangos.mas_cercano(dias, cerca_de, siguiente.isoformat())
    if dias and (desde is not None or hasta is not None):
        _agregar_rango(salida, dias, desde or dias[0], hasta or salida["hasta"])
    salida["nota"] = _NOTA
    return salida


def _agregar_rango(salida: dict, dias: list[str], desde: str, hasta: str) -> None:
    """Lo que hay y lo que falta en el rango pedido; si esta vacio, el vecino con datos."""
    if desde >= hasta:
        raise ValueError(f"rango vacio: `desde` {desde} no es anterior a `hasta` {hasta} "
                         "(hasta es exclusivo)")
    adentro = _rangos.dentro(dias, desde, hasta)
    vacios = _rangos.huecos(dias, desde, hasta)
    salida["rango_pedido"] = {"desde": desde, "hasta": hasta, "dias_con_datos": len(adentro),
                              "n_huecos": len(vacios)}
    salida["sin_datos_en"] = vacios[:MAX_TRAMOS]
    if not adentro and "mas_cercano" not in salida:
        salida["mas_cercano"] = _rangos.mas_cercano(dias, desde, hasta)


def run(fuente: str = CUALQUIERA, ultimos_n_dias: int | None = None,
        cerca_de: str | None = None, desde: str | None = None,
        hasta: str | None = None) -> dict:
    return componer(cobertura_dias.calcular(), fuente, ultimos_n_dias, cerca_de,
                    desde, hasta)
