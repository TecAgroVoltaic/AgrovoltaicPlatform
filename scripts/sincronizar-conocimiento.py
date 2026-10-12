#!/usr/bin/env python3
"""Copia la documentacion del proyecto adentro del paquete del Agente Historico.

El contexto de build de la imagen es `agente-historico/`, asi que `docs/` y el
catalogo de secciones de la consola no llegan al contenedor por si solos. Este
script deja una copia (gitignored) en `agente-historico/src/historico/conocimiento/datos/`:

    datos/docs/memoria/**.md
    datos/docs/referencia/**.md
    datos/docs/conceptos/**.md
    datos/secciones.json

Idempotente: solo reescribe lo que cambio y borra lo que ya no existe en el origen.
Correrlo una vez en local y, en el deploy, ANTES del rsync al servidor:

    python3 scripts/sincronizar-conocimiento.py
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DESTINO = RAIZ / "agente-historico" / "src" / "historico" / "conocimiento" / "datos"
CARPETAS_DOCS = ("docs/memoria", "docs/referencia", "docs/conceptos")
CATALOGO = ("mvp-debugger/app/lib/navegacion/secciones.json", "secciones.json")


def _deseados() -> dict[Path, Path]:
    """Destino relativo -> origen absoluto, para todo lo que debe quedar copiado."""
    mapa: dict[Path, Path] = {}
    for carpeta in CARPETAS_DOCS:
        for origen in sorted((RAIZ / carpeta).rglob("*.md")):
            mapa[origen.relative_to(RAIZ)] = origen
    origen_catalogo, nombre = CATALOGO
    if (RAIZ / origen_catalogo).is_file():
        mapa[Path(nombre)] = RAIZ / origen_catalogo
    return mapa


def _copiar(origen: Path, destino: Path) -> bool:
    if destino.is_file() and destino.read_bytes() == origen.read_bytes():
        return False
    destino.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(origen, destino)
    return True


def _podar(conservar: set[Path]) -> int:
    """Borra archivos que sobran y las carpetas que queden vacias."""
    borrados = 0
    for archivo in sorted(DESTINO.rglob("*"), reverse=True):
        relativo = archivo.relative_to(DESTINO)
        if archivo.is_file() and relativo not in conservar:
            archivo.unlink()
            borrados += 1
        elif archivo.is_dir() and not any(archivo.iterdir()):
            archivo.rmdir()
    return borrados


def main() -> int:
    deseados = _deseados()
    if not deseados:
        print("No se encontro documentacion para copiar.", file=sys.stderr)
        return 1
    DESTINO.mkdir(parents=True, exist_ok=True)
    copiados = sum(_copiar(origen, DESTINO / rel) for rel, origen in deseados.items())
    borrados = _podar(set(deseados))
    print(f"{len(deseados)} archivos en {DESTINO.relative_to(RAIZ)} "
          f"({copiados} actualizados, {borrados} borrados)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
