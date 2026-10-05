"""El unico sitio del paquete que arma SQL. Resuelve, cuenta y transmite.

Ningun nombre de tabla ni de columna llega al SQL sin haber pasado por aca, y aca
no se acepta ninguno que no venga de una de las dos puertas que ya existen:

  * la relacion, de `datos.RELACIONES`, la allowlist de nueve relaciones que ya
    usa el peek de datos;
  * las columnas, del catalogo REAL de esa relacion (`information_schema`), que es
    el mismo criterio con que `datos.serie` valida las suyas.

Todo lo demas (fechas, banderas) viaja como parametro `%s`. La allowlist no es
documentacion: es lo unico que separa esto de una inyeccion.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator

from historico import datos, db
from historico.analitica import fuente, ventana
from historico.exportar import etiquetas
from historico.exportar.fallas import COLUMNA_DESCONOCIDA, RELACION_DESCONOCIDA, PedidoInvalido

# Filtro de calidad por relacion, tomado de `analitica.fuente`. Se IMPORTA en vez de
# copiarse porque tiene que decir lo mismo que dicen los graficos: el dia que el
# equipo cambie el criterio de que fila es utilizable, el archivo exportado no puede
# quedarse con el criterio viejo sin que nadie lo note. `.get` y no `[]` porque
# `fuente` solo registra las tres relaciones que analiza y aca hay nueve.
_FILTRO_POR_RELACION = fuente._FILTRO

SIN_FILTRO = ""

# Tipos SQL que se pueden escribir como un numero. El booleano va como 1/0 y la
# marca de tiempo como datenum; el texto no tiene traduccion numerica honesta, asi
# que en un formato solo-numerico se rechaza en vez de salir como NaN (un NaN diria
# "no habia dato", y el dato estaba: era un nombre de archivo).
_TIPOS_NUMERICOS = ("double", "numeric", "real", "integer", "bigint", "smallint",
                    "boolean", "timestamp")

# Lo que la vista calibrada descarta cuando el filtro se aplica, en castellano. Va
# al archivo, porque un numero de filas quitadas sin motivo no se puede interpretar.
MOTIVO_FILTRO = {
    "v_sc_radiacion_calibrada":
        "`valido` descarta las lecturas anteriores al 2025-07-01, que el equipo "
        "invalido por calibracion del piranometro, y `qc_ok` las que superan 1,3 "
        "veces el cielo despejado modelado (fisicamente imposibles)",
}


@dataclass(frozen=True)
class Pedido:
    """Un pedido de exportacion YA VALIDADO. Solo contiene nombres de la allowlist."""

    clave: str
    relacion: str
    columna_tiempo: str | None
    columnas: tuple[str, ...]
    #                  tipo SQL de cada columna, en el mismo orden que `columnas`
    tipos: tuple[str, ...]
    desde: str
    hasta: str
    #                  predicado de calidad que se aplica, o `SIN_FILTRO`
    filtro: str
    #                  el que existe para esta relacion, se aplique o no
    filtro_disponible: str

    @property
    def acota_tiempo(self) -> bool:
        """Si el rango pedido llega a filtrar algo. `diccionario` no tiene tiempo."""
        return self.columna_tiempo is not None

    @property
    def parametros(self) -> tuple:
        return (self.desde, self.hasta) if self.acota_tiempo else ()

    @property
    def columnas_no_numericas(self) -> tuple[str, ...]:
        """Las columnas que no caben en un archivo de solo numeros."""
        return tuple(c for c, t in zip(self.columnas, self.tipos)
                     if not any(n in t for n in _TIPOS_NUMERICOS))

    @property
    def motivo_filtro(self) -> str | None:
        return MOTIVO_FILTRO.get(self.relacion) if self.filtro else None


def _relacion(clave: str) -> tuple[str, str | None]:
    """La allowlist de siempre, con un codigo propio para que el cliente lo distinga."""
    try:
        return datos._rel(clave)
    except ValueError as exc:
        raise PedidoInvalido(RELACION_DESCONOCIDA, str(exc)) from exc


def _columnas(reales: list[str], pedidas: list[str] | None,
              columna_tiempo: str | None) -> tuple[str, ...]:
    """Las columnas a exportar, validadas y en orden de lectura.

    Sin lista explicita van las de `por_defecto`, o sea todo menos la contabilidad
    del ETL. Con lista explicita se respeta lo pedido, pero SIEMPRE en el orden del
    catalogo: es el que la consola publico y el que la cabecera del archivo declara.
    """
    if pedidas is None:
        elegidas = [c for c in reales if etiquetas.por_defecto(c)]
    else:
        desconocidas = [c for c in pedidas if c not in reales]
        if desconocidas:
            raise PedidoInvalido(
                COLUMNA_DESCONOCIDA,
                f"la relacion no tiene {', '.join(desconocidas)}; "
                f"validas: {', '.join(reales)}",
            )
        elegidas = list(dict.fromkeys(pedidas))
    # El tiempo se agrega si no lo pidieron: sin el, una serie temporal exportada no
    # se puede volver a ordenar ni cruzar con nada, y el archivo pasa a ser una nube
    # de numeros sin cuando.
    if columna_tiempo and columna_tiempo not in elegidas:
        elegidas.insert(0, columna_tiempo)
    if not elegidas:
        raise PedidoInvalido(COLUMNA_DESCONOCIDA, "no queda ninguna columna que exportar")
    return tuple(etiquetas.ordenar(elegidas, columna_tiempo))


def preparar(relacion: str, desde: str | None, hasta: str | None,
             columnas: list[str] | None = None, aplicar_filtro: bool = True) -> Pedido:
    """Valida el pedido entero ANTES de tocar la base. Puerta unica del modulo.

    La ventana se normaliza con `analitica.ventana.crear` y no con `periodo.rango`
    porque aca las dos fechas son obligatorias y las escribe una persona: `crear`
    rechaza `2026-13-45` con `fecha_ilegible` y un `hasta` anterior al `desde` con
    `rango_vacio`, mientras que `rango` solo rellena extremos abiertos y dejaria que
    una fecha imposible llegue al SQL y vuelva como error 500 del servidor.
    """
    clave_sql, columna_tiempo = _relacion(relacion)
    v = ventana.crear(desde, hasta)
    disponible = _FILTRO_POR_RELACION.get(clave_sql, SIN_FILTRO).replace(" AND ", "", 1)
    # UNA sola lectura del catalogo real: de ella salen la validacion de los nombres
    # y los tipos que despues deciden si una columna cabe en un formato numerico.
    tipo_de = {c["nombre"]: c["tipo"] for c in datos._columnas(clave_sql)}
    elegidas = _columnas(list(tipo_de), columnas, columna_tiempo)
    d, h = v.sql
    return Pedido(
        clave=relacion,
        relacion=clave_sql,
        columna_tiempo=columna_tiempo,
        columnas=elegidas,
        tipos=tuple(tipo_de[c] for c in elegidas),
        desde=d,
        hasta=h,
        filtro=disponible if aplicar_filtro else SIN_FILTRO,
        filtro_disponible=disponible,
    )


def _donde(p: Pedido) -> str:
    """El WHERE del rango. Vacio si la relacion no tiene columna de tiempo."""
    if not p.acota_tiempo:
        return ""
    return f' WHERE "{p.columna_tiempo}" >= %s AND "{p.columna_tiempo}" < %s'


def _orden(p: Pedido) -> str:
    """Orden TOTAL y estable: sin el, dos descargas del mismo rango pueden diferir."""
    return f' ORDER BY "{p.columna_tiempo or p.columnas[0]}"'


def conteos(p: Pedido) -> dict:
    """Cuantas filas entran al archivo y cuantas quita el filtro, en UNA consulta.

    Las dos salen del MISMO `WHERE` y del MISMO predicado que despues usa la
    descarga: contar por un lado y filtrar por otro es como se fabrica un total que
    describe un archivo distinto del que se entrega.

    Y se cuenta ANTES de transmitir porque el bloque de metadatos encabeza el
    archivo: el numero tiene que existir cuando se escribe la primera linea.
    """
    predicado = p.filtro or "TRUE"
    fila = db.uno(
        f"SELECT count(*) AS candidatas, "
        f"count(*) FILTER (WHERE {predicado}) AS incluidas "
        f"FROM {p.relacion}{_donde(p)}",
        p.parametros,
    )
    candidatas = int(fila.get("candidatas") or 0)
    incluidas = int(fila.get("incluidas") or 0)
    return {"filas": incluidas, "descartadas": candidatas - incluidas}


def filas(p: Pedido) -> Iterator[tuple]:
    """Las filas del pedido, de a una, en el orden y con las columnas del catalogo."""
    seleccion = ", ".join(f'"{c}"' for c in p.columnas)
    donde = _donde(p)
    if p.filtro:
        donde = f"{donde} AND {p.filtro}" if donde else f" WHERE {p.filtro}"
    return db.en_streaming(
        f"SELECT {seleccion} FROM {p.relacion}{donde}{_orden(p)}", p.parametros)
