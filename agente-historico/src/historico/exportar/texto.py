"""Los tres formatos de texto: csv, dat y dat_numerico. Generadores, no listas.

Devuelven la primera linea sin haber leido la ultima fila: el archivo se transmite
mientras se consulta, y ni el proceso ni el cliente esperan a que las 103.678 filas
de radiacion esten en memoria.

El quoting lo hace el modulo `csv` de la biblioteca estandar, no un `join` a mano:
la relacion `diccionario` guarda descripciones en prosa, y una coma dentro de una
descripcion corre todas las columnas de esa fila una posicion. Es el tipo de error
que no se ve al abrir el archivo y aparece tres semanas despues en un promedio.
"""
from __future__ import annotations

import csv
import math
from datetime import datetime
from decimal import Decimal
from typing import Iterable, Iterator

from historico.exportar import tiempo
from historico.exportar.consulta import Pedido
from historico.exportar.formatos import Formato
from historico.exportar.metadatos import Bloque, lineas

FIN_DE_LINEA = "\n"
CELDA_VACIA = ""
NO_ES_NUMERO = "NaN"
INFINITO = "Inf"
VERDADERO, FALSO = "1", "0"


class _Eco:
    """Sumidero de una linea: `csv.writer` escribe aca y `writerow` la devuelve."""

    def write(self, linea: str) -> str:
        return linea


def _celda(valor: object) -> object:
    """Un valor de la base tal como debe verse en un csv o un dat.

    El booleano va como 1/0 y no como `True`: `valido` y `qc_ok` se leen igual de
    bien y no obligan a quien procese el archivo a saber en que lenguaje se escribio.
    """
    if isinstance(valor, datetime):
        return tiempo.texto(valor)
    if valor is None:
        return CELDA_VACIA
    if isinstance(valor, bool):
        return VERDADERO if valor else FALSO
    if isinstance(valor, Decimal):
        return float(valor)
    return valor


def _numero(valor: object) -> str:
    """Un valor de la base como token numerico que `load()` de MATLAB acepta.

    NULL sale `NaN`, que es lo que `load` entiende como hueco. Cualquier otra cosa
    (una celda vacia, un `NA`) rompe la lectura o corre las columnas.
    """
    if isinstance(valor, datetime):
        return repr(tiempo.datenum(valor))
    if valor is None:
        return NO_ES_NUMERO
    if isinstance(valor, bool):
        return VERDADERO if valor else FALSO
    numero = float(valor)
    if math.isnan(numero):
        return NO_ES_NUMERO
    if math.isinf(numero):
        return INFINITO if numero > 0 else f"-{INFINITO}"
    return repr(numero)


def delimitado(p: Pedido, formato: Formato, bloque: Bloque | None,
               filas: Iterable[tuple]) -> Iterator[str]:
    """csv o dat: bloque de metadatos (si lleva), cabecera de nombres y filas."""
    escritor = csv.writer(_Eco(), delimiter=formato.separador, lineterminator=FIN_DE_LINEA)
    if bloque is not None:
        for linea in lineas(bloque, p.columnas):
            yield f"{linea}{FIN_DE_LINEA}"
    yield escritor.writerow(p.columnas)
    for fila in filas:
        yield escritor.writerow([_celda(v) for v in fila])


def numerico(p: Pedido, formato: Formato, filas: Iterable[tuple]) -> Iterator[str]:
    """dat_numerico: SOLO numeros, sin cabecera ni comentarios.

    Ni una linea que no sea numeros y separadores, porque cualquier otra cosa aborta
    el `load()` de MATLAB. Que eso impida llevar metadatos no se resuelve callando:
    ver `formatos.quiere_metadatos`, que rechaza el pedido antes de llegar aca.
    """
    for fila in filas:
        yield formato.separador.join(_numero(v) for v in fila) + FIN_DE_LINEA


def escribir(p: Pedido, formato: Formato, bloque: Bloque | None,
             filas: Iterable[tuple]) -> Iterator[str]:
    """El archivo de texto que corresponda al formato pedido."""
    if formato.solo_numeros:
        return numerico(p, formato, filas)
    return delimitado(p, formato, bloque, filas)
