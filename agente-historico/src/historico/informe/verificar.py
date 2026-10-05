"""Que la lectura no pueda afirmar un numero que el libro no tiene. PURO.

El modelo no escribe cifras: escribe marcas (`[[H7]]`) y este modulo las cambia por
el valor del hecho, con su unidad. Asi un numero mal copiado es imposible por
construccion y no por obediencia al prompt.

Lo que queda por vigilar son las cifras que el modelo escriba SUELTAS. La regla es
una sola: toda cifra del texto tiene que aparecer en la tabla de hechos o en las
advertencias que acompañan al informe. Una que no aparezca en ninguna de las dos
rechaza la lectura entera, porque un parrafo con un numero inventado no se arregla
borrando el numero.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from historico.informe.tabla import Hecho, texto

HECHO, HIPOTESIS = "hecho", "hipotesis"
TIPOS = (HECHO, HIPOTESIS)

_MARCA = re.compile(r"\[\[\s*(H\d+)\s*\]\]")
# Una cifra pegada a una letra (PV1, SP722, DS18B20) es un nombre, no un numero.
_CIFRA = re.compile(r"(?<![A-Za-z_])\d+(?:[.,]\d+)*")


@dataclass
class Revision:
    parrafos: list[dict] = field(default_factory=list)
    problemas: list[str] = field(default_factory=list)

    @property
    def aprobada(self) -> bool:
        return bool(self.parrafos) and not self.problemas


# "52 días días": el modelo a veces escribe la unidad despues de la marca aunque la
# marca ya la trae. Se arregla aca y no se rechaza: no cambia ningun dato.
_REPETIDA = re.compile(r"(?<![\w%])([^\W\d_]+|%)\s+\1s?(?![\w%])", re.IGNORECASE)


def _sin_unidad_repetida(cadena: str) -> str:
    return _REPETIDA.sub(r"\1", cadena)


def cifras(cadena: str) -> set[str]:
    return set(_CIFRA.findall(cadena))


def permitidas(hechos: list[Hecho], advertencias: list[str]) -> set[str]:
    """Toda cifra que el informe ya muestra en algun lado."""
    salida: set[str] = set()
    for h in hechos:
        salida |= cifras(h.indicador) | cifras(texto(h))
    for a in advertencias:
        salida |= cifras(a)
    return salida


def revisar(parrafos: list[dict], hechos: list[Hecho],
            advertencias: list[str]) -> Revision:
    """Resuelve las marcas y junta todo lo que impide publicar la lectura."""
    por_id = {h.id: h for h in hechos}
    validas = permitidas(hechos, advertencias)
    revision = Revision()
    for n, parrafo in enumerate(parrafos, start=1):
        crudo = str(parrafo.get("texto", "")).strip()
        tipo = parrafo.get("tipo")
        if not crudo:
            continue
        if tipo not in TIPOS:
            revision.problemas.append(f"párrafo {n}: tipo {tipo!r} desconocido")
        citados = _MARCA.findall(crudo)
        for marca in citados:
            if marca not in por_id:
                revision.problemas.append(f"párrafo {n}: cita {marca}, que no existe")
        sueltas = cifras(_MARCA.sub(" ", crudo)) - validas
        if sueltas:
            revision.problemas.append(
                f"párrafo {n}: cifras que no están en los hechos: "
                f"{', '.join(sorted(sueltas))}")
        if tipo == HECHO and not citados:
            revision.problemas.append(f"párrafo {n}: es un hecho y no cita ninguno")
        resuelto = _sin_unidad_repetida(_MARCA.sub(
            lambda m: texto(por_id[m.group(1)]) if m.group(1) in por_id else m.group(0),
            crudo))
        revision.parrafos.append({"tipo": tipo, "texto": resuelto,
                                  "citas": sorted(set(citados), key=lambda c: int(c[1:]))})
    return revision
