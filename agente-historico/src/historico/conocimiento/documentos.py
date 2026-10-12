"""Carga de los .md copiados: frontmatter + una `Seccion` por encabezado `#`/`##`/`###`.

Cada seccion es la unidad que se indexa y se cita. Los encabezados dentro de
bloques de codigo (```) no cortan secciones. El titulo legible del documento sale
del frontmatter (`title`/`titulo`), si no del primer `#`, si no del `name` o del
nombre del archivo.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

_ENCABEZADO = re.compile(r"^(#{1,3})\s+(.+?)\s*#*\s*$")
_CERCO = "```"


@dataclass(frozen=True)
class Seccion:
    ruta: str            # p. ej. docs/memoria/decisiones/x.md
    titulo: str          # titulo legible del documento
    seccion: str         # texto del encabezado ("" = antes del primero)
    texto: str
    descripcion: str = ""
    tags: tuple[str, ...] = field(default_factory=tuple)


def frontmatter(contenido: str) -> tuple[dict[str, str], str]:
    """Separa `---\\nclave: valor\\n---` del cuerpo. Valores de una linea."""
    if not contenido.startswith("---"):
        return {}, contenido
    fin = contenido.find("\n---", 3)
    if fin < 0:
        return {}, contenido
    meta: dict[str, str] = {}
    for linea in contenido[3:fin].splitlines():
        clave, sep, valor = linea.partition(":")
        if sep and clave.strip() and not clave.startswith((" ", "\t")):
            meta[clave.strip()] = valor.strip().strip("\"'")
    return meta, contenido[fin + 4:].lstrip("-\n")


def _tags(valor: str) -> tuple[str, ...]:
    return tuple(t.strip() for t in valor.strip("[]").split(",") if t.strip())


def _partir(cuerpo: str) -> list[tuple[str, str]]:
    """[(encabezado, texto)] respetando los bloques de codigo."""
    partes: list[tuple[str, list[str]]] = [("", [])]
    en_codigo = False
    for linea in cuerpo.splitlines():
        if linea.lstrip().startswith(_CERCO):
            en_codigo = not en_codigo
        hallado = None if en_codigo else _ENCABEZADO.match(linea)
        if hallado:
            partes.append((hallado.group(2).strip(), []))
        else:
            partes[-1][1].append(linea)
    return [(titulo, "\n".join(lineas).strip()) for titulo, lineas in partes]


def _titulo(meta: dict[str, str], partes: list[tuple[str, str]], archivo: Path) -> str:
    for clave in ("title", "titulo"):
        if meta.get(clave):
            return meta[clave]
    if len(partes) > 1:
        return partes[1][0]
    nombre = meta.get("name") or archivo.stem
    return nombre.replace("-", " ").replace("_", " ").capitalize()


def cargar_documento(archivo: Path, raiz: Path) -> list[Seccion]:
    meta, cuerpo = frontmatter(archivo.read_text(encoding="utf-8", errors="replace"))
    partes = _partir(cuerpo)
    titulo = _titulo(meta, partes, archivo)
    ruta = archivo.relative_to(raiz).as_posix()
    comunes = {"ruta": ruta, "titulo": titulo, "descripcion": meta.get("description", ""),
               "tags": _tags(meta.get("tags", ""))}
    return [Seccion(seccion=encabezado, texto=texto, **comunes)
            for encabezado, texto in partes if texto or encabezado]


def cargar_todos(carpeta_docs: Path) -> list[Seccion]:
    """Todas las secciones de todos los .md bajo `carpeta_docs` (rutas `docs/...`)."""
    raiz = carpeta_docs.parent
    secciones: list[Seccion] = []
    for archivo in sorted(carpeta_docs.rglob("*.md")):
        secciones.extend(cargar_documento(archivo, raiz))
    return secciones
