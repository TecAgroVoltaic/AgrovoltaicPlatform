"""Serializacion a texto por lotes: CSV (coma) y DAT (tabulado, con `<col>_unix`)."""
from __future__ import annotations

import csv
import io
from datetime import date, datetime
from decimal import Decimal
from typing import Iterable, Iterator

from historico.exportar.modelo import LOTE, TIPOS_NUM, TIPOS_TIEMPO, Columna
from historico.exportar.reloj import _epoch, _iso


def _es_tiempo(tipo: str) -> bool:
    return any(t in tipo for t in TIPOS_TIEMPO)


def _es_numero(tipo: str) -> bool:
    return any(t in tipo for t in TIPOS_NUM)


def _celda_csv(v, reloj: str) -> str:
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (datetime, date)):
        return _iso(v, reloj)
    if isinstance(v, Decimal):
        return str(float(v))
    return str(v)


def _celda_dat(v, reloj: str) -> str:
    if v is None:
        return "NaN"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (datetime, date)):
        return _iso(v, reloj)
    if isinstance(v, Decimal):
        return str(float(v))
    if isinstance(v, str):
        return v.replace("\t", " ").replace("\n", " ")
    return str(v)


def _csv(sel: list[Columna], filas: Iterable[tuple], reloj: str) -> Iterator[bytes]:
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow([c.nombre for c in sel])
    yield buf.getvalue().encode("utf-8")
    buf.seek(0); buf.truncate()
    n = 0
    for fila in filas:
        w.writerow([_celda_csv(v, reloj) for v in fila])
        n += 1
        if n % LOTE == 0:
            yield buf.getvalue().encode("utf-8")
            buf.seek(0); buf.truncate()
    resto = buf.getvalue()
    if resto:
        yield resto.encode("utf-8")


def _cabecera_dat(sel: list[Columna], tiempo: list[int]) -> str:
    cab: list[str] = []
    for i, c in enumerate(sel):
        cab.append(c.nombre)
        if i in tiempo:
            cab.append(f"{c.nombre}_unix")
    return "\t".join(cab) + "\n"


def _linea_dat(fila: tuple, tiempo: list[int], reloj: str) -> str:
    celdas: list[str] = []
    for i, v in enumerate(fila):
        celdas.append(_celda_dat(v, reloj))
        if i in tiempo:
            e = _epoch(v, reloj)
            celdas.append("NaN" if e is None else repr(e))
    return "\t".join(celdas)


def _dat(sel: list[Columna], filas: Iterable[tuple], reloj: str) -> Iterator[bytes]:
    tiempo = [i for i, c in enumerate(sel) if _es_tiempo(c.tipo)]
    yield _cabecera_dat(sel, tiempo).encode("utf-8")
    lineas: list[str] = []
    for fila in filas:
        lineas.append(_linea_dat(fila, tiempo, reloj))
        if len(lineas) >= LOTE:
            yield ("\n".join(lineas) + "\n").encode("utf-8")
            lineas = []
    if lineas:
        yield ("\n".join(lineas) + "\n").encode("utf-8")
