"""Tipos del registro: familias, arreglos, `Variable` y su error de busqueda."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from historico.analitica.catalogo.vigiladas import _VIGILADAS

ELECTRICO, RADIACION, TERMICO, AMBIENTAL = "electrico", "radiacion", "termico", "ambiental"
INCLINADO, VERTICAL = "inclinado", "vertical"


class VariableDesconocida(KeyError, ValueError):
    """Clave que no esta en el registro. `codigo` la identifica sin leer el texto.

    Hereda de las DOS a proposito. De `KeyError` porque es lo que uno espera al
    fallar una busqueda por clave; de `ValueError` porque es el parametro de quien
    pregunta el que esta mal, y la API traduce `ValueError` a 400. Sin la segunda,
    una clave mal escrita por el LLM salia como error 500 del servidor, o sea como
    si la culpa fuera nuestra.
    """

    codigo = "variable_desconocida"

    def __str__(self) -> str:
        # `KeyError.__str__` devuelve el repr del argumento, asi que el mensaje
        # saldria entre comillas y con las barras escapadas.
        return self.args[0] if self.args else ""


@dataclass(frozen=True)
class Variable:
    """Una variable medida, con donde vive y que valores puede tomar."""

    clave: str
    etiqueta: str
    unidad: str
    familia: str
    relacion: str | None = None
    columna: str | None = None
    #                       limites de validez fisica (None = sin limite por ese lado)
    minimo: float | None = None
    maximo: float | None = None
    arreglo: str | None = None
    #                       por que no se puede consultar, si es que no se puede
    fuente_ausente: str | None = None
    # Donde vive el dato SIN CORREGIR. None = variable derivada, no existe cruda.
    #
    # NO es un duplicado de `relacion`/`columna`, y la diferencia decide si una
    # prueba sirve o miente. Las vistas corregidas ANULAN lo que cae fuera de rango,
    # asi que la familia de validez fisica leida contra ellas sale vacia por
    # construccion: cero valores imposibles porque la vista ya los borro, no porque
    # el sensor estuviera bien. Esa prueba tiene que leer del crudo.
    # El analisis, al reves, lee siempre de la vista corregida.
    relacion_cruda: str | None = None
    columna_cruda: str | None = None   # None = se llama igual que `columna`
    # Tramo en que esta variable EXISTE. None = sin limite por ese lado.
    #
    # No es lo mismo que un hueco de datos y por eso vive en el catalogo y no se
    # deduce consultando: fuera de este tramo el dato no falta, es que el sensor no
    # estaba puesto o la vista lo anula por decision del equipo. Un grafico vacio
    # tiene que poder decir cual de las dos cosas le paso.
    dato_desde: date | None = None
    dato_hasta: date | None = None
    # Tramo INTERIOR sin dato, contado. No es lo mismo que `dato_desde`/`dato_hasta`
    # y por eso es un campo aparte: aquellos recortan el tramo por los extremos, y
    # esto es un agujero EN MEDIO, que no se puede expresar con un par de fechas.
    #
    # Se guarda como texto medido y no como fechas a proposito: no lo consume ningun
    # filtro (recortar la ventana por el hueco escondera el hueco, que es lo
    # contrario de lo que hace falta), lo consume quien LEE el numero. La energia AC
    # del tablero y el PR por contador se apoyan en columnas cuya cobertura tiene
    # cuatro meses en blanco, y ese hecho tiene que viajar con la respuesta en vez
    # de vivir en el docstring de un modulo.
    hueco: str | None = None

    @property
    def disponible(self) -> bool:
        return self.fuente_ausente is None

    @property
    def origen_crudo(self) -> tuple[str, str] | None:
        """(relacion, columna) sin corregir. None si la variable es derivada."""
        if self.relacion_cruda is None:
            return None
        return (self.relacion_cruda, self.columna_cruda or self.columna)

    @property
    def clave_calidad(self) -> str | None:
        """El nombre con que buscar sus hallazgos. None = el barrido no la vigila.

        ESTA PROPIEDAD EVITA EL PEOR MODO DE FALLO DEL PRODUCTO. `contexto.confianza`
        filtra `hallazgos_calidad` por nombre de variable. Si se le pasa la clave del
        catalogo tal cual, `irradiancia_incidente_wm2` no encuentra nada, porque la
        tabla guarda `irradiancia_incidente`. Cero hallazgos se lee como dato
        impecable: la confianza saldria perfecta justo cuando la irradiancia esta
        rota, que es exactamente al reves de para lo que existe el bloque.

        `None` no es lo mismo que "sin hallazgos": significa que nadie la reviso.
        Quien lo consuma tiene que poder decir esa diferencia.
        """
        crudo = self.origen_crudo
        return crudo[1] if crudo and crudo[1] in _VIGILADAS else None

    @property
    def fuente_calidad(self) -> str | None:
        """La tabla con que el barrido etiqueto sus hallazgos: siempre la cruda."""
        return self.relacion_cruda if self.clave_calidad else None
