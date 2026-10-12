"""Conocimiento del proyecto para el asistente: busqueda en la documentacion y
catalogo de secciones de la consola.

Los datos son una copia gitignored en `conocimiento/datos/` que deja
`scripts/sincronizar-conocimiento.py`. Sin esa copia, `buscar` devuelve `None`
y las tools responden `NO_DISPONIBLE`, sin excepcion.
"""
from __future__ import annotations

from historico.conocimiento.extracto import MAX_CARACTERES, extracto
from historico.conocimiento.indice import obtener as _indice
from historico.conocimiento.texto import tokens_consulta
from historico.conocimiento.ubicacion import NO_DISPONIBLE

__all__ = ["NO_DISPONIBLE", "buscar", "disponible"]


def disponible() -> bool:
    return _indice() is not None


def buscar(consulta: str, maximo: int = 5) -> list[dict] | None:
    """Mejores secciones para `consulta`: titulo, ruta, seccion, extracto, puntaje.

    `None` si no hay documentacion cargada; lista vacia si nada coincide.
    """
    idx = _indice()
    if idx is None:
        return None
    terminos = tokens_consulta(consulta or "")
    return [{
        "titulo": r.seccion.titulo,
        "ruta": r.seccion.ruta,
        "seccion": r.seccion.seccion,
        "extracto": extracto(r.seccion.texto, terminos, MAX_CARACTERES),
        "puntaje": round(r.puntaje, 2),
    } for r in idx.buscar(terminos, maximo)]
