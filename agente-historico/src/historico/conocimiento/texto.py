"""Normalizacion y tokenizado del texto para la busqueda lexica.

Una sola regla para documentos y consultas: minusculas, sin acentos, sin
palabras vacias del castellano y con un recorte de plural muy simple
(`alertas` -> `alerta`). `plegar` conserva el largo del texto para que los
indices de una coincidencia sirvan tambien sobre el original (extractos).
"""
from __future__ import annotations

import re
import unicodedata

_PALABRA = re.compile(r"[a-z0-9]+")

VACIAS = frozenset("""
a al algo ante como con cual cuales cuando de del desde donde e el ella ellos en entre
es esa ese eso esta este esto estos estas fue ha han hay la las le les lo los mas me mi
muy no o otra otro para pero por porque que se sea ser si sin sobre son su sus tambien
te tiene un una uno unos unas y ya yo ver veo vemos quiero puedo hace hacer cosa
""".split())

# Siglas y sinonimos frecuentes en las preguntas: la consulta se expande con ellos.
SINONIMOS = {
    "pr": "performance ratio",
    "kt": "indice claridad",
    "poa": "plano arreglo",
    "ghi": "irradiancia horizontal",
    "sp722": "sp722 piranometro",
    "ds18b20": "ds18b20 temperatura",
}


def _base(c: str) -> str:
    return unicodedata.normalize("NFD", c)[0]


def plegar(texto: str) -> str:
    """Minusculas y sin acentos, caracter a caracter (mismo largo que la entrada)."""
    return "".join(_base(c) for c in texto.lower())


def _singular(palabra: str) -> str:
    if len(palabra) > 4 and palabra.endswith("es") and palabra[-3] in "lrnds":
        return palabra[:-2]
    if len(palabra) > 3 and palabra.endswith("s"):
        return palabra[:-1]
    return palabra


def _raiz(palabra: str) -> str:
    """Plural fuera y, en palabras largas, la vocal o el infinitivo final
    (`calcula`, `calculo`, `calcular` -> `calcul`)."""
    palabra = _singular(palabra)
    if palabra.isdigit():
        return palabra
    if len(palabra) > 6 and palabra[-2:] in ("ar", "er", "ir"):
        return palabra[:-2]
    if len(palabra) > 5 and palabra[-1] in "aeo":
        return palabra[:-1]
    return palabra


def tokens(texto: str) -> list[str]:
    """Terminos indexables del texto, en orden (con repeticiones)."""
    return [_raiz(p) for p in _PALABRA.findall(plegar(texto)) if p not in VACIAS]


def tokens_consulta(consulta: str) -> list[str]:
    """Terminos de una consulta, expandida con siglas y sin repetidos."""
    crudos = _PALABRA.findall(plegar(consulta))
    expandidos = " ".join(SINONIMOS.get(p, p) for p in crudos)
    return list(dict.fromkeys(tokens(expandidos)))
