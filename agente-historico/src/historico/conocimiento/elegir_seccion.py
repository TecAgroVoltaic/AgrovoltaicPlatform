"""Elige la seccion de la consola que mejor responde a "¿donde veo ...?".

Coincidencia lexica de los terminos del objetivo contra cada seccion del
catalogo: `etiqueta` e `id` pesan 3, cada item de `muestra` 2 y la
`descripcion` 1. Cada termino suma una vez, con el peso del campo mas fuerte
donde aparece. Por debajo de `UMBRAL` no hay eleccion: decide el LLM.
"""
from __future__ import annotations

from dataclasses import dataclass

from historico.conocimiento.secciones import SeccionConsola, catalogo
from historico.conocimiento.texto import tokens, tokens_consulta

PESO_ETIQUETA = 3.0
PESO_MUESTRA = 2.0
PESO_DESCRIPCION = 1.0
UMBRAL = 2.0


@dataclass(frozen=True)
class Candidata:
    seccion: SeccionConsola
    puntaje: float
    muestra: str | None     # el item de `muestra` que mas coincide, si alguno


def _campos(s: SeccionConsola) -> list[tuple[set[str], float]]:
    return [(set(tokens(f"{s.etiqueta} {s.id}")), PESO_ETIQUETA),
            (set(tokens(" ".join(s.muestra))), PESO_MUESTRA),
            (set(tokens(s.descripcion)), PESO_DESCRIPCION)]


def _puntaje(s: SeccionConsola, terminos: list[str]) -> float:
    campos = _campos(s)
    return sum(max((peso for bolsa, peso in campos if t in bolsa), default=0.0)
               for t in terminos)


def _mejor_muestra(s: SeccionConsola, terminos: list[str]) -> str | None:
    cuentas = [(len(set(tokens(m)) & set(terminos)), m) for m in s.muestra]
    cuenta, item = max(cuentas, default=(0, None), key=lambda par: par[0])
    return item if cuenta else None


def candidatas(objetivo: str) -> list[Candidata]:
    """Secciones con algo en comun con el objetivo, de mejor a peor."""
    terminos = tokens_consulta(objetivo or "")
    puntuadas = [Candidata(s, _puntaje(s, terminos), _mejor_muestra(s, terminos))
                 for s in catalogo()]
    return sorted((c for c in puntuadas if c.puntaje > 0), key=lambda c: -c.puntaje)


def elegir(objetivo: str) -> tuple[Candidata | None, list[Candidata]]:
    """(elegida o None si nada supera el umbral, alternativas)."""
    todas = candidatas(objetivo)
    if todas and todas[0].puntaje >= UMBRAL:
        return todas[0], todas[1:]
    return None, todas
