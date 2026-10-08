"""Tipos y constantes de la exportacion: columnas, datasets, formatos y topes."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import timezone
from typing import Iterator
from zoneinfo import ZoneInfo

from historico import agrodash_api, config


@dataclass(frozen=True)
class Columna:
    nombre: str      # alias en el archivo
    expr: str        # expresion SQL (igual al nombre en las tablas planas)
    tipo: str        # data_type de Postgres (decide como se serializa)


@dataclass(frozen=True)
class Dataset:
    clave: str
    fuente: str
    titulo: str
    descripcion: str
    origen: str                       # clausula FROM (tabla o joins), de la allowlist
    tcol: str | None                  # expresion SQL de la columna temporal (None = sin tiempo)
    talias: str | None = None         # alias de la columna temporal en el archivo
    reloj: str = "local"              # 'local' | 'utc' (ver docstring del paquete)
    tcol_tz: bool = True              # True si la columna es timestamptz
    relacion: str | None = None       # tabla para leer columnas de information_schema
    columnas: tuple[Columna, ...] = ()  # columnas ESTATICAS (joins o API)
    filtros: dict[str, str] = field(default_factory=dict)  # param -> expresion SQL (o nombre, via API)
    via: str = "sql"                  # 'sql' (db.py) | 'api' (agrodash_api.py)
    paso: bool = False                # admite `paso` (ancho de bucket) — solo via API


@dataclass
class Exportacion:
    nombre: str
    content_type: str
    cuerpo: Iterator[bytes]


class ExportacionDemasiadoGrande(ValueError):
    """El rango pedido excede lo que el formato puede armar en memoria (MAT)."""


FORMATOS: dict[str, tuple[str, str]] = {
    # formato -> (content-type, extension)
    "csv": ("text/csv; charset=utf-8", "csv"),
    "dat": ("text/plain; charset=utf-8", "dat"),
    "mat": ("application/x-matlab-data", "mat"),
}

MAX_FILAS_MAT = 500_000     # scipy arma todo en RAM: ~8 bytes × columnas × filas
PASOS_SEG = agrodash_api.PASOS_SEG   # resoluciones admitidas para la via API (0 = crudo)
LOTE = 5_000                # filas por tanda de bytes emitida
TZ = ZoneInfo(config.TZ)
UTC = timezone.utc
TIPOS_TIEMPO = ("timestamp", "date")
TIPOS_NUM = ("double", "numeric", "real", "integer", "bigint", "smallint")
IDENT_MATLAB = re.compile(r"[^A-Za-z0-9_]")
SLUG = re.compile(r"[^A-Za-z0-9]+")
