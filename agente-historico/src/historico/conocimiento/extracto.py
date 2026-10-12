"""Extracto de una seccion centrado donde mas terminos de la consulta coinciden."""
from __future__ import annotations

import re

from historico.conocimiento.texto import plegar

MAX_CARACTERES = 600
_CONTEXTO_PREVIO = 120
_ELIPSIS = "…"


def _posiciones(plegado: str, terminos: list[str]) -> list[int]:
    posiciones: list[int] = []
    for termino in terminos:
        posiciones.extend(m.start() for m in re.finditer(r"\b" + re.escape(termino), plegado))
    return sorted(posiciones)


def _mejor_inicio(posiciones: list[int], ancho: int) -> int:
    """Inicio de la ventana de `ancho` caracteres que abarca mas coincidencias."""
    mejor, cuenta_mejor, j = 0, 0, 0
    for i, inicio in enumerate(posiciones):
        while j < len(posiciones) and posiciones[j] < inicio + ancho:
            j += 1
        if j - i > cuenta_mejor:
            mejor, cuenta_mejor = inicio, j - i
    return mejor


def extracto(texto: str, terminos: list[str], maximo: int = MAX_CARACTERES) -> str:
    """Hasta `maximo` caracteres (elipsis incluidas) del pasaje mas pertinente."""
    texto = re.sub(r"\n{3,}", "\n\n", texto.strip())
    if len(texto) <= maximo:
        return texto
    ancho = maximo - 2 * len(_ELIPSIS)
    posiciones = _posiciones(plegar(texto), terminos)
    inicio = max(0, _mejor_inicio(posiciones, ancho - _CONTEXTO_PREVIO) - _CONTEXTO_PREVIO)
    if inicio:
        corte = texto.rfind("\n", 0, inicio + 1)
        if corte < 0 or inicio - corte > _CONTEXTO_PREVIO:
            corte = texto.rfind(" ", 0, inicio + 1)
        inicio = corte + 1 if corte >= 0 else inicio
    fin = min(len(texto), inicio + ancho)
    if fin < len(texto):
        espacio = texto.rfind(" ", inicio, fin)
        fin = espacio if espacio > inicio + ancho // 2 else fin
    pedazo = texto[inicio:fin].strip()
    return (_ELIPSIS if inicio else "") + pedazo + (_ELIPSIS if fin < len(texto) else "")
