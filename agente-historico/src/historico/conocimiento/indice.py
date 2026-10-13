"""Indice lexico BM25 sobre las secciones de la documentacion, sin dependencias.

Cada seccion se indexa como una bolsa de terminos con peso por campo (un BM25F
simplificado): el encabezado y el titulo del documento pesan mas que el cuerpo,
y la `description` y los `tags` del frontmatter suman en todas las secciones de
su documento. Se construye una vez por proceso y queda en memoria.
"""
from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass
from functools import lru_cache

from historico.conocimiento import ubicacion
from historico.conocimiento.documentos import Seccion, cargar_todos
from historico.conocimiento.texto import tokens

PESO_ENCABEZADO = 3.0
PESO_TITULO = 3.0
PESO_DESCRIPCION = 2.0
PESO_TAGS = 2.0
K1, B = 1.2, 0.75
MAX_POR_DOCUMENTO = 2


@dataclass(frozen=True)
class Resultado:
    seccion: Seccion
    puntaje: float


def _bolsa(s: Seccion) -> Counter:
    bolsa: Counter = Counter(tokens(s.texto))
    campos = ((s.seccion, PESO_ENCABEZADO), (s.titulo, PESO_TITULO),
              (s.descripcion, PESO_DESCRIPCION), (" ".join(s.tags), PESO_TAGS))
    for texto, peso in campos:
        for termino in tokens(texto):
            bolsa[termino] += peso
    return bolsa


class Indice:
    def __init__(self, secciones: list[Seccion]):
        self.secciones = secciones
        self._bolsas = [_bolsa(s) for s in secciones]
        self._largos = [sum(b.values()) for b in self._bolsas]
        self._largo_medio = (sum(self._largos) / len(self._largos)) if self._largos else 1.0
        df: Counter = Counter()
        for bolsa in self._bolsas:
            df.update(bolsa.keys())
        n = len(secciones)
        self._idf = {t: math.log(1 + (n - f + 0.5) / (f + 0.5)) for t, f in df.items()}

    def _puntaje(self, i: int, terminos: list[str]) -> float:
        bolsa, largo = self._bolsas[i], self._largos[i]
        norma = K1 * (1 - B + B * largo / self._largo_medio)
        total = 0.0
        for t in terminos:
            tf = bolsa.get(t, 0.0)
            if tf:
                total += self._idf[t] * tf * (K1 + 1) / (tf + norma)
        return total

    def buscar(self, terminos: list[str], maximo: int) -> list[Resultado]:
        """Mejores secciones, a lo sumo MAX_POR_DOCUMENTO por documento."""
        if not terminos:
            return []
        puntajes = [(self._puntaje(i, terminos), i) for i in range(len(self.secciones))]
        puntajes.sort(key=lambda par: -par[0])
        elegidos: list[Resultado] = []
        por_doc: Counter = Counter()
        for puntaje, i in puntajes:
            if puntaje <= 0 or len(elegidos) >= maximo:
                break
            s = self.secciones[i]
            if por_doc[s.ruta] < MAX_POR_DOCUMENTO:
                por_doc[s.ruta] += 1
                elegidos.append(Resultado(s, puntaje))
        return elegidos


@lru_cache(maxsize=1)
def obtener() -> Indice | None:
    """El indice del proceso, o None si no hay copia de la documentacion."""
    carpeta = ubicacion.carpeta_docs()
    if not carpeta.is_dir():
        return None
    secciones = cargar_todos(carpeta)
    return Indice(secciones) if secciones else None
