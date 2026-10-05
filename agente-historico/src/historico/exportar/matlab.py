"""El `.mat` binario (MATLAB v5) via `scipy.io.savemat`.

Es el unico formato que NO se puede transmitir mientras se consulta: el formato v5
escribe cada variable con su tamaño por delante, asi que hay que tener las columnas
enteras antes de escribir el primer byte. Se acumula por COLUMNA y no por fila
(vectores densos en vez de un dict por lectura), que para las 103.678 filas de
radiacion es la diferencia entre decenas de MB y cientos.

Y es el unico donde los metadatos no compiten con la lectura: `load` trae la struct
`meta` al lado de la struct `datos` sin que nada haya que saltearse. Por eso viajan
siempre, incluso con `metadatos=0`.
"""
from __future__ import annotations

import io
from datetime import datetime
from decimal import Decimal
from typing import Iterable

import numpy as np
from scipy.io import savemat

from historico.exportar import tiempo
from historico.exportar.consulta import Pedido
from historico.exportar.metadatos import Bloque, struct

# Nombre de la struct con las columnas y de la struct con los metadatos.
CAMPO_DATOS, CAMPO_META = "datos", "meta"

# Largo maximo de un nombre de campo en MAT v5 (32 bytes con el terminador). Hoy la
# columna mas larga mide exactamente 31, asi que la proxima columna de radiacion con
# nombre largo toca el techo: mejor un error que lo diga que el de scipy, que habla
# de otra cosa.
LARGO_MAXIMO_CAMPO = 31


def _valor_numerico(valor: object) -> float:
    """Un valor de la base como float. NULL -> NaN, tiempo -> datenum, bool -> 1/0."""
    if isinstance(valor, datetime):
        return tiempo.datenum(valor)
    if valor is None:
        return float("nan")
    if isinstance(valor, bool):
        return 1.0 if valor else 0.0
    if isinstance(valor, Decimal):
        return float(valor)
    return float(valor)


def _es_texto(valores: list) -> bool:
    """Si la columna trae cadenas. Se mira el dato y no el tipo SQL declarado."""
    return any(isinstance(v, str) for v in valores)


def _vector(valores: list) -> np.ndarray:
    """La columna como vector [N x 1]: numerico si se puede, cell de texto si no."""
    if _es_texto(valores):
        return np.array([v if v is not None else "" for v in valores],
                        dtype=object).reshape(-1, 1)
    return np.array([_valor_numerico(v) for v in valores], dtype=float).reshape(-1, 1)


def _verificar_nombres(columnas: tuple[str, ...]) -> None:
    """Corta antes de escribir si algun nombre no cabe como campo de struct."""
    largos = [c for c in columnas if len(c) > LARGO_MAXIMO_CAMPO]
    if largos:
        raise RuntimeError(
            f"MATLAB v5 no admite campos de mas de {LARGO_MAXIMO_CAMPO} caracteres "
            f"y estos los pasan: {', '.join(largos)}. Hay que abreviarlos en la "
            f"vista o exportarlos por otro formato"
        )


def _meta(bloque: Bloque) -> dict:
    """Los metadatos como los quiere MATLAB: los avisos, como CELL de cadenas.

    `savemat` convierte una lista de strings en una matriz de caracteres rellenada
    con espacios hasta la mas larga, y ahi los avisos se leen como un bloque de
    texto cortado. Como cell, `meta.avisos{2}` devuelve el segundo aviso entero.
    """
    campos = struct(bloque)
    return {**campos,
            "avisos": np.array(campos["avisos"], dtype=object).reshape(-1, 1)}


def construir(p: Pedido, bloque: Bloque, filas: Iterable[tuple]) -> bytes:
    """El archivo .mat completo: `datos` con un vector por columna y `meta` al lado."""
    _verificar_nombres(p.columnas)
    columnas: list[list] = [[] for _ in p.columnas]
    for fila in filas:
        for destino, valor in zip(columnas, fila):
            destino.append(valor)
    archivo = io.BytesIO()
    savemat(
        archivo,
        {CAMPO_DATOS: {nombre: _vector(valores)
                       for nombre, valores in zip(p.columnas, columnas)},
         CAMPO_META: _meta(bloque)},
        do_compression=True,
    )
    return archivo.getvalue()
