"""El contrato COMUN de una prueba de calidad. Todo el paquete cuelga de aca.

    prueba(serie: Serie, contexto: Contexto) -> list[Hallazgo]

Una prueba = una funcion PURA con esa firma y un `tipo` de hallazgo propio. Nada
mas. Esa uniformidad es lo que permite que el catalogo de pruebas se RECORRA en
vez de llamarse a mano una por una, y es lo que hace que agregar una prueba sea
escribir una funcion y registrarla, sin tocar el que las corre.

## Por que la serie llega ya traida

La consulta va aparte (`consultas.py`). El criterio recibe los datos en memoria y
decide. Es el mismo patron de `calidad.contexto.reducir()`, y por la misma razon:
la decision es lo unico discutible con el equipo, es donde viven los defectos y
es lo que se puede probar entero SIN base de datos.

## Por que hay `estado` y no solo hallazgos

Una prueba que no aparece en el informe se lee como una prueba que paso. Cuatro
de las nueve pruebas de validez fisica del documento (RH, temperatura ambiente,
viento, precipitacion) no tienen fuente en ninguna tabla: si simplemente no
salieran, el informe diria que la validez fisica esta limpia. Por eso el
resultado de correr una prueba es una `Evaluacion` con estado explicito
(`evaluada`, `sin_fuente`, `sin_datos`, `no_aplica`), y los `Hallazgo` son solo
lo que ademas hay que persistir.

## Por que el hallazgo tiene esta forma exacta

`Hallazgo.como_fila()` devuelve la 7-tupla que espera el INSERT de
`calidad/barrido.py`, en su orden: (fecha, fuente, variable, tipo, severidad,
n_afectadas, detalle). La PK del store es (fecha, fuente, variable, tipo), asi
que **cada prueba tiene un `tipo` distinto**: dos pruebas que compartieran tipo
se pisarian la fila en el `ON CONFLICT` y una de las dos desapareceria en
silencio. `fuente` es el nombre de la TABLA BASE, no el de la vista corregida,
porque es con ese nombre que `contexto.reducir()` cruza hallazgos contra filas.

## Zona horaria: no se toca

Las marcas son el reloj de pared local de Costa Rica. `consultas.py` les quita la
etiqueta `+00` (que miente) y aca dentro todo es naive y comparable. Ninguna
prueba convierte zona horaria; la de irradiancia nocturna compara contra
`ventana_solar`, que esta guardada con la misma convencion.
"""
from __future__ import annotations

import json
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import date, datetime
from math import isfinite

from historico.analitica.catalogo import Variable
from historico.calidad.pruebas import umbrales

GRAVE, AVISO, INFO = "grave", "aviso", "info"

EVALUADA, SIN_FUENTE, SIN_DATOS, NO_APLICA = (
    "evaluada", "sin_fuente", "sin_datos", "no_aplica")

# `hallazgos_calidad.fuente` es NOT NULL y una variable sin origen no tiene
# relacion: este literal ocupa la casilla y deja el hueco consultable con SQL.
FUENTE_SIN_ORIGEN = "sin_fuente"
TIPO_SIN_FUENTE = "sin_fuente"

# De donde salio el dato de la serie. NO es metadato decorativo: decide si una
# prueba de validez fisica significa algo o miente por construccion.
#
#   CRUDO      la tabla sin corregir, tal como la escribio el ETL.
#   CORREGIDA  una vista que YA anula lo que cae fuera de rango. La validez fisica
#              leida de aca da cero valores imposibles porque la vista los borro,
#              no porque el sensor estuviera bien.
#   DERIVADA   la vista la calcula al vuelo y no existe cruda en ninguna tabla
#              (hoy solo `kt_star`, que es un cociente). Se puede medir, pero es un
#              numero calculado y no una lectura, y eso hay que decirlo.
CRUDO, CORREGIDA, DERIVADA = "crudo", "corregida", "derivada"


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


# ── Utilidades compartidas por las cuatro familias ──────────────────────────
def es_nan(valor) -> bool:
    """NaN o infinito: una lectura rota que ademas envenena cualquier promedio."""
    return isinstance(valor, float) and not isfinite(valor)


def es_valor(valor) -> bool:
    """Hay numero utilizable (ni NULL ni NaN)."""
    return valor is not None and not es_nan(valor)


def indices_por_dia(serie: Serie) -> dict[date, list[int]]:
    """Indices de la serie agrupados por dia LOCAL y ordenados por marca.

    Todo se agrupa por dia porque la PK del store es por dia. El orden se impone
    aca y no se supone: una serie desordenada daria intervalos negativos.
    """
    grupos: dict[date, list[int]] = {}
    for i, marca in enumerate(serie.marcas):
        grupos.setdefault(marca.date(), []).append(i)
    for indices in grupos.values():
        indices.sort(key=lambda i: serie.marcas[i])
    return grupos


def severidad_por_fraccion(afectadas: int, total: int, maxima: str = GRAVE) -> str:
    """Gradua un hallazgo por cuanto del dia toca. `maxima` pone el techo."""
    fraccion = afectadas / total if total else 1.0
    if fraccion >= umbrales.FRACCION_AFECTADA_PARA_GRAVE and maxima == GRAVE:
        return GRAVE
    if fraccion >= umbrales.FRACCION_AFECTADA_PARA_AVISO and maxima != INFO:
        return AVISO
    return INFO


def hallazgos_por_dia(serie: Serie, indices: Sequence[int], tipo: str,
                      nota: str | None = None, severidad: str | None = None,
                      severidad_maxima: str = GRAVE,
                      detalle_del_dia: Callable[[list[int]], dict] | None = None,
                      **extra) -> list[Hallazgo]:
    """Parte una lista de indices afectados en un hallazgo por dia.

    Es el molde de casi toda prueba: detectar es elegir indices, y esto los
    convierte en filas del store con su severidad graduada y su contexto.
    """
    del_dia = indices_por_dia(serie)
    afectados_por_dia: dict[date, list[int]] = {}
    for i in indices:
        afectados_por_dia.setdefault(serie.marcas[i].date(), []).append(i)

    salida = []
    for dia, afectados in sorted(afectados_por_dia.items()):
        total = len(del_dia[dia])
        detalle = {"de": total, "fraccion": round(len(afectados) / total, 4), **extra}
        if nota:
            detalle["nota"] = nota
        if detalle_del_dia:
            detalle.update(detalle_del_dia(afectados))
        salida.append(Hallazgo(
            fecha=dia, fuente=serie.fuente, variable=serie.variable.clave, tipo=tipo,
            severidad=severidad or severidad_por_fraccion(
                len(afectados), total, severidad_maxima),
            n_afectadas=len(afectados), detalle=detalle))
    return salida
