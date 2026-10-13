"""Lector del catalogo de secciones de la consola (copia de `secciones.json`).

Contrato §5 (`docs/referencia/contratos-asistente-plataforma.md`): la fuente de
verdad es `mvp-debugger/app/lib/navegacion/secciones.json`; aca se lee la copia
que deja `scripts/sincronizar-conocimiento.py`. Sin copia (o ilegible) el
catalogo es una lista vacia, nunca una excepcion.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache

from historico.conocimiento import ubicacion


@dataclass(frozen=True)
class Param:
    nombre: str
    tipo: str
    descripcion: str


@dataclass(frozen=True)
class SeccionConsola:
    id: str
    ruta: str
    etiqueta: str
    descripcion: str
    muestra: tuple[str, ...]
    fuentes: tuple[str, ...]
    params: tuple[Param, ...]

    def nombres_params(self) -> set[str]:
        return {p.nombre for p in self.params}


def _seccion(crudo: dict) -> SeccionConsola:
    return SeccionConsola(
        id=str(crudo["id"]), ruta=str(crudo.get("ruta", "")),
        etiqueta=str(crudo.get("etiqueta", crudo["id"])),
        descripcion=str(crudo.get("descripcion", "")),
        muestra=tuple(str(m) for m in crudo.get("muestra", [])),
        fuentes=tuple(str(f) for f in crudo.get("fuentes", [])),
        params=tuple(Param(str(p.get("nombre", "")), str(p.get("tipo", "")),
                           str(p.get("descripcion", "")))
                     for p in crudo.get("params", []) if p.get("nombre")),
    )


@lru_cache(maxsize=1)
def catalogo() -> tuple[SeccionConsola, ...]:
    archivo = ubicacion.archivo_secciones()
    try:
        crudo = json.loads(archivo.read_text(encoding="utf-8"))
        return tuple(_seccion(s) for s in crudo.get("secciones", []) if s.get("id"))
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return ()


def por_id(id_seccion: str) -> SeccionConsola | None:
    return next((s for s in catalogo() if s.id == id_seccion), None)
