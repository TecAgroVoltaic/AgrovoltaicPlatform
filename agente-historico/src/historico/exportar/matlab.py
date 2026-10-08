"""Serializacion a MAT: una variable MATLAB por columna + `<col>_unix`/`_datenum` + `meta`."""
from __future__ import annotations

import io
from typing import Iterable, Iterator

from historico.exportar.modelo import IDENT_MATLAB, Columna
from historico.exportar.reloj import _epoch, _iso
from historico.exportar.texto import _es_numero, _es_tiempo

_DIAS_UNIX_A_DATENUM = 719529.0   # datenum de 1970-01-01 en MATLAB
_SEG_POR_DIA = 86400.0


def _ident_matlab(nombre: str, usados: set[str]) -> str:
    """Identificador MATLAB valido y unico (letras/digitos/_, empieza con letra, ≤63)."""
    s = IDENT_MATLAB.sub("_", nombre) or "col"
    if not s[0].isalpha():
        s = "c_" + s
    s = s[:63]
    base, k = s, 2
    while s in usados:
        s = f"{base[:60]}_{k}"; k += 1
    usados.add(s)
    return s


def _variables(c: Columna, valores: list, n: int, usados: set[str], reloj: str) -> dict:
    """Variables MATLAB de una columna (una, o tres si es temporal)."""
    import numpy as np                 # perezoso: /health y el resto no dependen de numpy

    nombre = _ident_matlab(c.nombre, usados)
    if _es_tiempo(c.tipo):
        texto = np.array([[_iso(v, reloj) if v is not None else ""] for v in valores], dtype=object)
        unix = np.array([np.nan if (e := _epoch(v, reloj)) is None else e for v in valores],
                        dtype=float).reshape(n, 1)
        return {nombre: texto.reshape(n, 1),
                _ident_matlab(f"{c.nombre}_unix", usados): unix,
                _ident_matlab(f"{c.nombre}_datenum", usados): unix / _SEG_POR_DIA + _DIAS_UNIX_A_DATENUM}
    if c.tipo == "boolean" or _es_numero(c.tipo):
        return {nombre: np.array([np.nan if v is None else float(v) for v in valores],
                                 dtype=float).reshape(n, 1)}
    return {nombre: np.array([[("" if v is None else str(v))] for v in valores], dtype=object).reshape(n, 1)}


def _mat(sel: list[Columna], filas: Iterable[tuple], meta: dict, reloj: str) -> Iterator[bytes]:
    from scipy.io import savemat       # perezoso: /health y el resto no dependen de scipy

    columnas: list[list] = [[] for _ in sel]
    for fila in filas:
        for i, v in enumerate(fila):
            columnas[i].append(v)
    n = len(columnas[0]) if sel else 0

    out: dict = {}
    usados: set[str] = set()
    for c, valores in zip(sel, columnas):
        out.update(_variables(c, valores, n, usados, reloj))
    out["meta"] = {**meta, "filas": n, "columnas": [c.nombre for c in sel]}

    buf = io.BytesIO()
    savemat(buf, out, do_compression=True, oned_as="column")
    yield buf.getvalue()
