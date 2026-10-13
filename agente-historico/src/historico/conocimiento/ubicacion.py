"""Donde vive la copia de la documentacion (la deja `scripts/sincronizar-conocimiento.py`).

La carpeta es gitignored y viaja dentro del paquete (package-data), asi que se
resuelve relativa a este archivo tanto en desarrollo como instalado en la imagen.
`HISTORICO_CONOCIMIENTO_DIR` permite apuntar a otra copia sin reinstalar.
"""
from __future__ import annotations

import os
from pathlib import Path

NO_DISPONIBLE = ("documentación no disponible: falta la copia de docs en el servicio "
                 "(correr scripts/sincronizar-conocimiento.py antes del deploy)")
_VARIABLE = "HISTORICO_CONOCIMIENTO_DIR"


def carpeta_datos() -> Path:
    propia = os.environ.get(_VARIABLE)
    return Path(propia) if propia else Path(__file__).resolve().parent / "datos"


def carpeta_docs() -> Path:
    return carpeta_datos() / "docs"


def archivo_secciones() -> Path:
    return carpeta_datos() / "secciones.json"
