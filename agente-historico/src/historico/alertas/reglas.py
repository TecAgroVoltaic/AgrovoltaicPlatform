"""Las reglas v1: de hallazgos de calidad a candidatos a alerta. Funciones puras.

Una alerta NO re-detecta nada: deriva de un hallazgo que ya esta en
`hallazgos_calidad` (contrato 4.3). Cada regla recibe hallazgos y devuelve los
`Candidato` que le corresponden; agrupar por dia y por clave es trabajo de
`evaluar`, no de la regla. Lo fijo de cada tipo (`DEFINICIONES`) vive en
`definiciones` y se reexporta desde aca.

## La variable de la clave usa el nombre del CATALOGO

`kt_imposible` (cielo) guarda `irradiancia_incidente` y `sobre_maximo_fisico`
(pruebas) guarda `irradiancia_incidente_wm2`: el mismo sensor con dos nombres.
Sin traducir, el mismo problema abriria dos alertas. Es el caso 1 de
`docs/memoria/inconsistencias/silencio-leido-como-salud.md` visto al reves.
"""
from __future__ import annotations

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import date

from historico.alertas.definiciones import (  # noqa: F401
    _CLAVE_DE_LA_RADIACION, _VARIABLES_AC, DEFINICIONES, DIA_ENTERO,
    INCONGRUENCIA_TEMP_IRRADIANCIA, INVERSOR_PARADO_CON_SOL, IRRADIANCIA_IMPOSIBLE,
    SENSOR_TEMPERATURA_SATURADO, TIPOS_DE_HALLAZGO, Definicion,
)
from historico.analitica import catalogo
from historico.calidad.pruebas import entre_sensores
from historico.calidad.pruebas.contrato import GRAVE, Hallazgo

_PREFIJO_IRRADIANCIA = "irradiancia_"


@dataclass(frozen=True)
class Candidato:
    """Un hallazgo que cumple una regla: la materia prima de una alerta."""

    tipo: str
    fuente: str
    variable: str
    hallazgo: Hallazgo

    @property
    def fecha(self) -> date:
        return self.hallazgo.fecha

    @property
    def clave(self) -> str:
        return f"{self.tipo}:{self.fuente}:{self.variable}"

    @property
    def definicion(self) -> Definicion:
        return DEFINICIONES[self.tipo]


_CLAVE_POR_COLUMNA_CRUDA = {
    v.origen_crudo[1]: v.clave for v in catalogo.CATALOGO.values()
    if v.origen_crudo and v.origen_crudo[1] != v.clave}


def _clave_de_catalogo(variable: str) -> str:
    if variable in catalogo.CATALOGO:
        return variable
    return _CLAVE_POR_COLUMNA_CRUDA.get(variable, variable)


def inversor_parado_con_sol(hallazgos: Iterable[Hallazgo]) -> list[Candidato]:
    """`inversor_sin_acoplar` grave. Las tres variables AC son UN apagon: dia entero."""
    return [Candidato(INVERSOR_PARADO_CON_SOL, h.fuente, DIA_ENTERO, h) for h in hallazgos
            if h.tipo == "inversor_sin_acoplar" and h.severidad == GRAVE]


def sensor_temperatura_saturado(hallazgos: Iterable[Hallazgo]) -> list[Candidato]:
    """`saturado_85`: el DS18B20 desconectado."""
    return [Candidato(SENSOR_TEMPERATURA_SATURADO, h.fuente, h.variable, h)
            for h in hallazgos if h.tipo == "saturado_85"]


def irradiancia_imposible(hallazgos: Iterable[Hallazgo]) -> list[Candidato]:
    """`kt_imposible` y `sobre_maximo_fisico` sobre una irradiancia."""
    salida = []
    for h in hallazgos:
        variable = _clave_de_catalogo(h.variable)
        if (h.tipo in DEFINICIONES[IRRADIANCIA_IMPOSIBLE].tipos_de_hallazgo
                and variable.startswith(_PREFIJO_IRRADIANCIA)):
            salida.append(Candidato(IRRADIANCIA_IMPOSIBLE, h.fuente, variable, h))
    return salida


def incongruencia_temp_irradiancia(hallazgos: Iterable[Hallazgo]) -> list[Candidato]:
    """La sexta familia, solo lo grave: el `info` es un dia que no se pudo juzgar."""
    return [Candidato(INCONGRUENCIA_TEMP_IRRADIANCIA, h.fuente, h.variable, h)
            for h in hallazgos if h.tipo == entre_sensores.TIPO and h.severidad == GRAVE]


REGLAS: tuple[Callable[[Iterable[Hallazgo]], list[Candidato]], ...] = (
    inversor_parado_con_sol, sensor_temperatura_saturado,
    irradiancia_imposible, incongruencia_temp_irradiancia,
)


def candidatos(hallazgos: Iterable[Hallazgo]) -> list[Candidato]:
    """Todas las reglas sobre los mismos hallazgos."""
    lista = list(hallazgos)
    return [c for regla in REGLAS for c in regla(lista)]


def descripcion(candidato: Candidato) -> str:
    """El texto de la ficha: el significado del tipo y sobre que variable cae."""
    variable = candidato.variable
    etiqueta = ("todo el día" if variable == DIA_ENTERO
                else getattr(catalogo.CATALOGO.get(variable), "etiqueta", variable))
    return f"{candidato.definicion.que_es} Variable: {etiqueta}. Fuente: {candidato.fuente}."
