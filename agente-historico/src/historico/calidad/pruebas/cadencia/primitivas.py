"""Piezas de la cadencia: origenes, pasos por dia, moda y tasa nominal."""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

from historico.calidad.pruebas import umbrales
from historico.calidad.pruebas.contrato import Serie, indices_por_dia

DECLARADA, INFERIDA, NOMINAL = "declarada", "inferida", "nominal"
# La moda de TODA la serie, para el dia que no da ni para una moda propia.
INFERIDA_SERIE = "inferida_serie"

# Cuantos saltos vecinos, a cada lado, entran en la moda LOCAL de una muestra.
# Con 5 la ventana son 11 saltos, que es lo que hace el criterio robusto en las
# dos direcciones a la vez: un hueco suelto queda en minoria y se detecta, y un
# cambio de regimen a media mañana no contamina al tramo vecino porque la ventana
# es corta. Ver el docstring del modulo.
MUESTRAS_DE_CONTEXTO = 5

# Cuantas veces tiene que repetirse un salto para creerle que es LA cadencia.
# Con 1 basta un salto suelto para definirse a si mismo como normal, y entonces
# ninguna serie corta puede tener un hueco: el valor que se quiere juzgar seria a
# la vez la vara con que se lo juzga.
REPETICIONES_PARA_CREER = 2

# Los intervalos se agrupan al segundo para sacar la moda: el sub-segundo de una
# marca es jitter del logger, no cadencia, y sin redondear la moda seria siempre
# el primer valor porque no habria dos iguales.
_PRECISION_SEG = 1


@dataclass(frozen=True)
class Paso:
    """El salto de tiempo entre una muestra y la anterior DEL MISMO DIA."""

    anterior: int
    segundos: float


@dataclass(frozen=True)
class Esperada:
    """La cadencia contra la que se juzga una muestra, y de donde salio."""

    segundos: float
    origen: str


def moda(valores, minimo_repeticiones: int = 1) -> float | None:
    """El valor mas repetido entre los positivos, redondeado al segundo.

    `minimo_repeticiones` es lo que separa "el dato me dice cual es la cadencia" de
    "el dato no alcanza para saberlo". Con dos muestras hay UN salto, y su moda es
    ese mismo salto: preguntarle al dato cual era la cadencia esperada devuelve el
    valor que se queria juzgar, asi que nada puede salir nunca anomalo. Exigiendo
    que el valor se repita, ese caso devuelve None y el llamador pasa al respaldo.
    """
    candidatos = [round(v, _PRECISION_SEG) for v in valores if v and v > 0]
    if not candidatos:
        return None
    valor, repeticiones = Counter(candidatos).most_common(1)[0]
    return valor if repeticiones >= minimo_repeticiones else None


def nominal(fuente: str) -> float:
    """La tasa de muestreo que el documento le asigna a la fuente."""
    return umbrales.CADENCIA_NOMINAL_POR_FUENTE.get(
        fuente, umbrales.CADENCIA_NOMINAL_POR_DEFECTO)


def pasos(serie: Serie) -> list[Paso | None]:
    """Para cada muestra, su salto respecto a la anterior del mismo dia."""
    salida: list[Paso | None] = [None] * serie.n
    for indices in indices_por_dia(serie).values():
        for previo, actual in zip(indices, indices[1:]):
            salida[actual] = Paso(
                anterior=previo,
                segundos=(serie.marcas[actual] - serie.marcas[previo]).total_seconds())
    return salida
