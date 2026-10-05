"""Etiqueta, unidad y ORDEN de cada columna exportable. Puro, sin base de datos.

Las columnas de la base son nombres de ingenieria (`temp_inclinado`,
`energia_pv1_wh`, `kt_star`) y quien abre el archivo esta a semanas de distancia de
la conversacion donde se eligieron. La etiqueta y la unidad salen de
`analitica.catalogo`, que es la fuente de verdad de que mide cada variable, y NO de
la tabla `diccionario_variables`: esa guarda nombres de columna CRUDA desfasados
(seis de ellos ni siquiera se pueden graficar, ver `api.analitica_variables`).

## Por que el indice es por NOMBRE DE COLUMNA y no por (relacion, columna)

Una misma medicion aparece con el mismo nombre en la tabla cruda, en la vista
corregida y en la vista de performance, y significa lo mismo en las tres. Indexar
por el par obligaria a registrar a mano cada relacion nueva, y la que se olvidara
saldria sin etiqueta. La ambiguedad, que seria el riesgo de indexar por nombre,
esta cerrada por `_indexar`: si dos variables distintas compartieran nombre de
columna, ninguna de las dos se etiqueta. Una etiqueta equivocada es peor que
ninguna.
"""
from __future__ import annotations

from historico.analitica import catalogo
from historico.analitica.catalogo import AMBIENTAL, ELECTRICO, RADIACION, TERMICO, Variable

SIN_UNIDAD = None

# Columnas que no son una medicion sino la contabilidad del ETL. Siguen
# disponibles, pero no viajan por defecto: son ruido para quien analiza.
CONTABILIDAD = ("n_muestras", "intervalo_original_seg", "fuente_archivo", "id")

# Banderas de calidad de las vistas. Se exportan por defecto (dicen si la fila
# entra o no en un analisis), pero van al final: no son mediciones.
BANDERAS = ("valido", "qc_ok")

# Lo que el catalogo de analisis no cubre porque no es una variable analizable.
# Etiqueta y unidad escritas aca a mano, que es donde corresponde: inventarlas en
# el momento de escribir el archivo seria tener dos versiones de cada nombre.
_EXTRA: dict[str, tuple[str, str | None]] = {
    "timestamp": ("Marca de tiempo (hora local de Costa Rica)", SIN_UNIDAD),
    "corriente_aac": ("Corriente AC", "A"),
    "codigo_error": ("Codigo de error del inversor (0 = sin error)", SIN_UNIDAD),
    "detector_incidente_sp722_mv": ("Detector incidente SP722, señal cruda", "mV"),
    "detector_reflejado_sp722_mv": ("Detector reflejado SP722, señal cruda", "mV"),
    "pr_pv1": ("Performance Ratio instantaneo PV1, arreglo inclinado", "adimensional"),
    "pr_pv2": ("Performance Ratio instantaneo PV2, arreglo vertical", "adimensional"),
    "valido": ("Bandera: la lectura cae en el tramo calibrado (desde 2025-07-01)",
               SIN_UNIDAD),
    "qc_ok": ("Bandera: la irradiancia no supera 1,3 veces el cielo despejado",
              SIN_UNIDAD),
    "n_muestras": ("Lecturas promediadas en este bin (contabilidad del ETL)", SIN_UNIDAD),
    "intervalo_original_seg": ("Cadencia declarada por el CSV de origen; NO es el "
                               "salto real entre filas (contabilidad del ETL)", "s"),
    "fuente_archivo": ("CSV de origen (contabilidad del ETL)", SIN_UNIDAD),
    "variable": ("Nombre de la variable, en nombre de columna CRUDA", SIN_UNIDAD),
    "descripcion": ("Descripcion de la variable", SIN_UNIDAD),
    "tabla": ("Tabla en que vive la variable", SIN_UNIDAD),
}

# Orden de lectura: primero lo electrico, despues lo termico que lo acompaña, y al
# final lo que viene de otro registrador.
_ORDEN_FAMILIA = (ELECTRICO, TERMICO, RADIACION, AMBIENTAL)
# Dentro de cada familia, el inclinado y el vertical juntos y por separado, y lo
# comun (que no es de ningun arreglo) despues.
_ORDEN_ARREGLO = (catalogo.INCLINADO, catalogo.VERTICAL, None)

# Grupos de columnas, en el orden en que salen en el archivo.
_TIEMPO, _MEDIDA_CONOCIDA, _MEDIDA_SUELTA, _BANDERA, _CONTABILIDAD = range(5)


def _indexar() -> dict[str, Variable]:
    """columna -> variable del catalogo. Las ambiguas quedan fuera a proposito."""
    encontradas: dict[str, Variable] = {}
    ambiguas: set[str] = set()
    for var in catalogo.CATALOGO.values():
        crudo = var.origen_crudo
        nombres = {n for n in (var.columna, crudo[1] if crudo else None) if n}
        for nombre in nombres:
            previa = encontradas.get(nombre)
            if previa is not None and previa.clave != var.clave:
                ambiguas.add(nombre)
            encontradas[nombre] = var
    return {n: v for n, v in encontradas.items() if n not in ambiguas}


_POR_COLUMNA = _indexar()


def _con_arreglo(var: Variable) -> str:
    """La etiqueta del catalogo, diciendo siempre de que arreglo habla.

    `PV1` y `PV2` a secas no significan nada fuera de este repo, y la mitad de las
    etiquetas del catalogo los dejan pelados (`Voltaje PV1`). El arreglo se agrega
    solo si la etiqueta no lo nombra ya, para no escribir "inclinado" dos veces.
    """
    if var.arreglo and var.arreglo not in var.etiqueta.lower():
        return f"{var.etiqueta}, arreglo {var.arreglo}"
    return var.etiqueta


def describir(columna: str) -> tuple[str, str | None]:
    """(etiqueta, unidad) de una columna. Sin etiqueta conocida, su propio nombre."""
    var = _POR_COLUMNA.get(columna)
    if var is not None:
        return (_con_arreglo(var), var.unidad)
    return _EXTRA.get(columna, (columna, SIN_UNIDAD))


def por_defecto(columna: str) -> bool:
    """Si la columna viaja cuando el cliente no pide una lista explicita."""
    return columna not in CONTABILIDAD


def _grupo(columna: str, columna_tiempo: str | None) -> tuple[int, int, int]:
    """Clave de orden de una columna: (grupo, familia, arreglo)."""
    if columna_tiempo and columna == columna_tiempo:
        return (_TIEMPO, 0, 0)
    if columna in CONTABILIDAD:
        return (_CONTABILIDAD, 0, 0)
    if columna in BANDERAS:
        return (_BANDERA, 0, 0)
    var = _POR_COLUMNA.get(columna)
    if var is None:
        return (_MEDIDA_SUELTA, 0, 0)
    return (_MEDIDA_CONOCIDA, _ORDEN_FAMILIA.index(var.familia),
            _ORDEN_ARREGLO.index(var.arreglo))


def ordenar(columnas: list[str], columna_tiempo: str | None) -> list[str]:
    """Las columnas en orden de LECTURA, no en el del `SELECT *`.

    Tiempo, mediciones agrupadas por familia y por arreglo, banderas de calidad y
    contabilidad del ETL al final. El orden dentro de cada grupo es el de la
    relacion (`sorted` es estable), asi que columnas hermanas no se barajan.

    Es UNA sola funcion porque el catalogo que publica el orden y el archivo que lo
    usa tienen que coincidir: dos criterios serian un archivo cuyas columnas no
    estan donde el cliente dijo que estarian.
    """
    return sorted(columnas, key=lambda c: _grupo(c, columna_tiempo))
