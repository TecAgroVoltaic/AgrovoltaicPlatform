"""Los tipos del resultado de una corrida y la evaluacion de UNA prueba sobre UNA serie.

Una prueba que no aparece en el informe se lee como una prueba que paso. Con
cuatro de las nueve pruebas de validez fisica sin fuente en la base, esa lectura
convertiria el informe en una mentira comoda. Por eso `correr()` devuelve una
`Evaluacion` POR CADA par (prueba, serie), con estado explicito, exista o no un
hallazgo. Los hallazgos son un subconjunto: lo que ademas hay que persistir.

Se usa a traves de `registro`, que reexporta lo de aca.
"""
from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from historico.analitica import catalogo
from historico.calidad.pruebas.contrato import (
    AVISO, EVALUADA, FUENTE_SIN_ORIGEN, NO_APLICA, SIN_DATOS, SIN_FUENTE,
    TIPO_SIN_FUENTE, Contexto, Hallazgo, NoAplica, Prueba, Serie,
)


@dataclass(frozen=True)
class PruebaRegistrada:
    """Una prueba con su identidad: como se llama, de que familia y que tipo deja."""

    nombre: str
    familia: str
    tipo: str
    ejecutar: Prueba


@dataclass(frozen=True)
class Evaluacion:
    """El resultado de correr UNA prueba sobre UNA serie. Nunca se omite.

    `origen` viaja aca y no solo en el hallazgo porque cambia lo que la prueba
    PUEDE decir: sobre una vista corregida la validez fisica no mide nada, y
    sobre una variable derivada mide un numero calculado, no una lectura. Sin ese
    dato, tres resultados muy distintos se leen igual.
    """

    prueba: str
    familia: str
    variable: str
    fuente: str
    origen: str
    estado: str
    motivo: str | None
    hallazgos: tuple[Hallazgo, ...]



@dataclass(frozen=True)
class Corrida:
    """Lo que dejo recorrer el catalogo: el informe completo y lo persistible."""

    evaluaciones: tuple[Evaluacion, ...]
    sin_fuente: tuple[Hallazgo, ...]

    @property
    def hallazgos(self) -> list[Hallazgo]:
        de_pruebas = [h for e in self.evaluaciones for h in e.hallazgos]
        return list(self.sin_fuente) + de_pruebas

    def filas(self) -> list[tuple]:
        """Listas para el INSERT de `barrido.py`, en el orden de sus columnas."""
        return [h.como_fila() for h in self.hallazgos]

    @property
    def resumen(self) -> dict:
        conteo = {estado: 0 for estado in (EVALUADA, SIN_FUENTE, SIN_DATOS, NO_APLICA)}
        por_familia: dict[str, dict] = {}
        for evaluacion in self.evaluaciones:
            conteo[evaluacion.estado] += 1
            familia = por_familia.setdefault(
                evaluacion.familia, {"pruebas": 0, "con_hallazgos": 0, SIN_FUENTE: 0})
            familia["pruebas"] += 1
            familia["con_hallazgos"] += bool(evaluacion.hallazgos)
            familia[SIN_FUENTE] += evaluacion.estado == SIN_FUENTE
        return {"evaluaciones": len(self.evaluaciones), **conteo,
                "hallazgos": len(self.hallazgos), "por_familia": por_familia,
                "sin_vigilancia_previa": self.sin_vigilancia_previa}

    @property
    def sin_vigilancia_previa(self) -> list[str]:
        """Las variables que el barrido NO revisaba antes de esta corrida.

        Mismo modo de fallo que `sin_fuente`, una capa mas arriba: para el
        `albedo`, las cuatro SP722, `cs_ghi_wm2`, `kt_star` y las dos POA, el
        store de hallazgos siempre estuvo vacio porque nadie las miraba, no
        porque estuvieran sanas. Quien lea esta corrida tiene que saber que para
        esas variables es la PRIMERA revision, no una confirmacion.
        """
        claves = {e.variable for e in self.evaluaciones}
        return catalogo.sin_vigilancia(*sorted(claves)) if claves else []


def _evaluar(prueba: PruebaRegistrada, serie: Serie, contexto: Contexto) -> Evaluacion:
    def resultado(estado, motivo=None, hallazgos=()):
        return Evaluacion(prueba.nombre, prueba.familia, serie.variable.clave,
                          serie.fuente, serie.origen, estado, motivo,
                          tuple(hallazgos))

    if not serie.variable.disponible:
        return resultado(SIN_FUENTE, serie.variable.fuente_ausente)
    if serie.vacia:
        return resultado(SIN_DATOS, "la serie no trae ni una lectura en el rango")
    try:
        return resultado(EVALUADA, hallazgos=prueba.ejecutar(serie, contexto))
    except NoAplica as motivo:
        return resultado(NO_APLICA, motivo.motivo)


def _hallazgo_sin_fuente(serie: Serie, pruebas: Sequence[PruebaRegistrada]) -> Hallazgo:
    """UNA fila por variable sin origen, no una por prueba.

    Una por prueba colisionaria contra si misma en la PK del store (mismo dia,
    misma variable, mismo tipo). El detalle lista las pruebas que quedaron sin
    correr, que es la informacion que se perderia al agrupar.
    """
    return Hallazgo(
        fecha=serie.fecha, fuente=FUENTE_SIN_ORIGEN, variable=serie.variable.clave,
        tipo=TIPO_SIN_FUENTE, severidad=AVISO, n_afectadas=None,
        detalle={"motivo": serie.variable.fuente_ausente,
                 "etiqueta": serie.variable.etiqueta,
                 "pruebas_sin_correr": [p.nombre for p in pruebas],
                 "nota": "el documento pide estas pruebas y la base no tiene el dato; "
                         "queda medido para que el hueco no se lea como un aprobado"})
