"""Los tipos del contrato: serie, contexto, hallazgo, `NoAplica` y la firma `Prueba`."""
from __future__ import annotations

import json
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime

from historico.analitica.catalogo import Variable
from historico.calidad.pruebas import umbrales
from historico.calidad.pruebas.contrato.constantes import CORREGIDA, CRUDO, DERIVADA


class NoAplica(Exception):
    """La prueba no tiene sentido para esta serie y lo dice en vez de pasar.

    Devolver una lista vacia seria indistinguible de "no encontre nada", que es
    justo la confusion que este paquete existe para evitar.
    """

    def __init__(self, motivo: str) -> None:
        super().__init__(motivo)
        self.motivo = motivo


@dataclass(frozen=True)
class VentanaSolar:
    """Amanecer y atardecer de un dia, en el reloj de pared local del store."""

    amanecer: datetime
    atardecer: datetime


@dataclass(frozen=True)
class Serie:
    """Las lecturas de UNA variable en UNA fuente, ya traidas de la base.

    `fecha` es el dia al que se atribuyen los hallazgos que no salen de una marca
    concreta (una variable sin fuente no tiene ni una marca y aun asi hay que
    poder anotarla en un store que lleva la fecha en la PK).

    `origen` no tiene valor por defecto a proposito. Un defecto permisivo dejaria
    que una serie de vista corregida pasara por cruda sin que nadie lo note, y la
    validez fisica saldria vacia dando un aprobado falso. Que el constructor lo
    exija es lo que hace ese error imposible en vez de improbable.
    """

    variable: Variable
    fuente: str
    fecha: date
    #                   CRUDO | CORREGIDA | DERIVADA. Sin defecto a proposito: ver
    #                   la constante. Quien arma la serie tiene que declararlo.
    origen: str
    marcas: Sequence[datetime] = ()
    valores: Sequence[float | None] = ()
    #                   `intervalo_original_seg` fila por fila, si la fuente lo trae
    intervalos: Sequence[float | None] = ()
    #                   etiqueta de sensor/canal por lectura, si la fuente lo trae
    dispositivos: Sequence[str] = ()

    def __post_init__(self) -> None:
        for nombre, columna in (("valores", self.valores),
                                ("intervalos", self.intervalos),
                                ("dispositivos", self.dispositivos)):
            if columna and len(columna) != len(self.marcas):
                raise ValueError(
                    f"`{nombre}` tiene {len(columna)} elementos y `marcas` "
                    f"{len(self.marcas)}: la serie va en columnas paralelas")
        if not self.valores and self.marcas:
            raise ValueError("hay marcas sin valores: la serie quedaria muda")
        if self.origen not in (CRUDO, CORREGIDA, DERIVADA):
            raise ValueError(
                f"origen {self.origen!r} desconocido; validos: "
                f"{CRUDO}, {CORREGIDA}, {DERIVADA}")

    @property
    def n(self) -> int:
        return len(self.marcas)

    @property
    def vacia(self) -> bool:
        return not self.marcas


@dataclass(frozen=True)
class Contexto:
    """Lo que algunas pruebas necesitan y no cabe en la serie.

    Es el unico canal de parametrizacion, para que la firma siga siendo una sola
    y el catalogo se pueda recorrer.
    """

    ventanas_solares: Mapping[date, VentanaSolar] = field(default_factory=dict)
    dispositivos_esperados: Sequence[str] = ()
    #        cadencia a la que se normalizan los saltos; None = la nominal de la fuente
    cadencia_de_salto_seg: float | None = None
    #        lectura de "desviacion absoluta" del documento (ver `anomalias`)
    desviacion_de_ruido: str = umbrales.DESVIACION_MAD

    def cadencia_de_salto(self, fuente: str) -> float:
        if self.cadencia_de_salto_seg:
            return self.cadencia_de_salto_seg
        return umbrales.CADENCIA_REFERENCIA_DE_SALTO_POR_FUENTE.get(
            fuente, umbrales.CADENCIA_REFERENCIA_DE_SALTO_SEG)


@dataclass(frozen=True)
class Hallazgo:
    """Un problema detectado, con la forma exacta de `hallazgos_calidad`."""

    fecha: date
    fuente: str
    variable: str
    tipo: str
    severidad: str
    n_afectadas: int | None
    detalle: dict

    def como_fila(self) -> tuple:
        """La tupla que consume el INSERT del barrido, en su mismo orden."""
        return (self.fecha, self.fuente, self.variable, self.tipo, self.severidad,
                self.n_afectadas, json.dumps(self.detalle, default=str))


Prueba = Callable[[Serie, Contexto], list[Hallazgo]]
