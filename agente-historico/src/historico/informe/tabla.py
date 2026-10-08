"""El contrato entre las secciones del informe y quien lo escribe. Sin logica.

Una `Hoja` es una tabla ya calculada: sus columnas con unidad y definicion, y sus
filas como dicts. `secciones/` las arma (puro), `libro.py` las vuelca a Excel y
ninguno de los dos sabe del otro mas que esto.

Un `Hecho` es un numero del informe con nombre propio. Es lo UNICO que ve el modelo
al redactar, y lo unico que puede citar: ver `historico.informe.verificar`.
"""
from __future__ import annotations

from dataclasses import dataclass

# Formatos de celda de Excel. Nombres y no literales sueltos para que dos columnas
# de la misma magnitud no puedan salir con distinta cantidad de decimales.
ENTERO = "0"
DECIMAL_2 = "0.00"
DECIMAL_3 = "0.000"
FECHA = "yyyy-mm-dd"

SI, NO = "si", "no"

_SINGULAR = {"días": "día"}


@dataclass(frozen=True)
class Columna:
    clave: str
    etiqueta: str
    unidad: str = ""
    formato: str | None = None
    descripcion: str = ""


@dataclass(frozen=True)
class Hoja:
    nombre: str
    titulo: str
    columnas: tuple[Columna, ...]
    filas: list[dict]
    nota: str = ""


@dataclass(frozen=True)
class Hecho:
    """Un numero (o una fecha, o una etiqueta) que la lectura puede citar.

    `origen` dice de que hoja y de que columna sale, en palabras: quien lee el
    resumen tiene que poder ir a buscarlo sin preguntarle a nadie.
    """
    id: str
    indicador: str
    valor: float | int | str | None
    unidad: str = ""
    origen: str = ""
    decimales: int = 0


def numero_es(valor: float | int, decimales: int = 0) -> str:
    """1644.02 -> '1.644,02'. Punto de miles y coma decimal, como escribe el equipo."""
    crudo = f"{valor:,.{decimales}f}"
    return crudo.replace(",", "\x00").replace(".", ",").replace("\x00", ".")


def texto(hecho: Hecho) -> str:
    """El hecho como se lee en una frase: el valor con su unidad pegada.

    La unidad viaja DENTRO de la sustitucion y no la escribe el modelo: un numero
    correcto con la unidad equivocada es el mismo error por un factor de mil que ya
    tuvo este dataset con las columnas `_wh`.
    """
    if hecho.valor is None:
        return "sin dato"
    if isinstance(hecho.valor, str):
        return hecho.valor
    cifra = numero_es(hecho.valor, hecho.decimales)
    unidad = _SINGULAR.get(hecho.unidad, hecho.unidad) if hecho.valor == 1 else hecho.unidad
    return f"{cifra} {unidad}".strip()


def si_no(valor: bool) -> str:
    return SI if valor else NO
