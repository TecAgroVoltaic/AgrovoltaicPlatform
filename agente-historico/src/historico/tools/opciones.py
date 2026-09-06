"""Las opciones que el modelo puede elegir, DERIVADAS del catalogo. Sin logica.

Ninguna tool transcribe la lista de variables a mano. El enum sale de
`analitica.catalogo`, que es la allowlist del proyecto: si alguien registra una
variable nueva, el esquema que ve el LLM la ofrece sola, y si la retira deja de
ofrecerla. Una lista transcrita se desincroniza en silencio, y el sintoma es el
peor posible: el modelo pide una columna que ya no existe, o nunca se entera de
que hay una nueva.

Aca viven ademas las propiedades de ventana (desde, hasta, granularidad), que son
identicas en las diez tools de analitica. Repetirlas es la via mas facil de que
dos tools le digan al modelo cosas distintas sobre la misma fecha, y quien lea la
respuesta no tiene como notarlo.

Todo se devuelve por COPIA: un esquema es un dict mutable que despues se anida en
`SCHEMA`, y una plantilla compartida por referencia se puede pisar desde una tool
sin que las otras se enteren.
"""
from __future__ import annotations

from historico.analitica import catalogo
from historico.analitica.ventana import GRANULARIDADES

_DESDE = {
    "type": "string",
    "description": ("Inicio del rango, ISO 'aaaa-mm-dd', fecha LOCAL de Costa Rica. "
                    "Omitir = desde el inicio del historico."),
}
_HASTA = {
    "type": "string",
    "description": ("Fin del rango, ISO y EXCLUSIVO (el dia que se pone NO entra). "
                    "Omitir = hasta el final del historico."),
}
_GRANULARIDAD = {
    "type": "string",
    "description": ("Tamaño del bucket temporal. Omitir = la mas fina que siga siendo "
                    "legible para ese largo de ventana."),
}


def ventana(con_granularidad: bool = False) -> dict:
    """Las propiedades de rango que acepta toda tool de analitica."""
    propiedades = {"desde": dict(_DESDE), "hasta": dict(_HASTA)}
    if con_granularidad:
        propiedades["granularidad"] = {**_GRANULARIDAD, "enum": list(GRANULARIDADES)}
    return propiedades


def claves(unidad: str | None = None, con_fuente: bool = True) -> list[str]:
    """Las claves de variable que el modelo puede pedir.

    `con_fuente=False` incluye ademas las que el documento pide y la base no tiene.
    Solo las pruebas de calidad las quieren: para el resto, ofrecer una variable
    que no se puede consultar es invitar al modelo a un error evitable.
    """
    registro = (catalogo.disponibles() if con_fuente
                else list(catalogo.CATALOGO.values()))
    return [v.clave for v in registro if unidad is None or v.unidad == unidad]


def variable(descripcion: str, unidad: str | None = None,
             con_fuente: bool = True) -> dict:
    """Propiedad de UNA variable del catalogo."""
    return {"type": "string", "enum": claves(unidad, con_fuente),
            "description": descripcion}


def variables(descripcion: str, unidad: str | None = None) -> dict:
    """Propiedad de VARIAS variables del catalogo (para superponerlas)."""
    return {"type": "array", "items": {"type": "string", "enum": claves(unidad)},
            "description": descripcion}
