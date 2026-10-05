"""Los cuatro formatos de salida y que puede llevar cada uno adentro.

Un registro y no un `if formato == ...` repartido por tres archivos: agregar un
formato es agregar una linea, y la politica de metadatos deja de ser una regla que
haya que recordar en cada sitio donde se escribe una fila.

## `dat_numerico` no puede llevar metadatos, y pedirselos FALLA

`load()` de MATLAB exige una matriz rectangular de numeros: cualquier linea que no
lo sea (un `#`, una cabecera con nombres) aborta la lectura. Esa parte es una
restriccion del formato, no una decision nuestra.

Lo que si es decision es que pedir `metadatos=1` con ese formato responda 400 en
vez de devolver el archivo pelado. Servir menos de lo que se pidio sin decirlo es
EXACTAMENTE el patron que este proyecto ya cometio cinco veces
(`docs/memoria/inconsistencias/silencio-leido-como-salud.md`): un resultado
plausible que esconde que algo no se hizo. Y como la unica cosa que arma esa
combinacion es un formulario que la consola controla, que llegue significa que el
cliente esta mal programado: mejor que reviente temprano y fuerte que que alguien
analice un archivo creyendo que leyo sus advertencias.

Omitir el parametro NO es pedirlo. Por eso `pedido` distingue `None` (no lo
mandaron: se usa lo que el formato admita) de `1` (lo mandaron: si el formato no
puede, es un error). Sin esa distincion, un cliente que manda `metadatos=1` por
defecto en todos los formatos no podria bajar un `dat_numerico` nunca.
"""
from __future__ import annotations

from dataclasses import dataclass

from historico.exportar.fallas import FORMATO_DESCONOCIDO, FORMATO_SIN_METADATOS, PedidoInvalido

CSV, DAT, DAT_NUMERICO, MAT = "csv", "dat", "dat_numerico", "mat"

# Politica de metadatos de cada formato. Viaja en el catalogo para que la consola
# no tenga que deducirla ni ofrecer una combinacion imposible.
SIEMPRE, OPCIONAL, PROHIBIDO = "siempre", "opcional", "prohibido"

SI, NO = 1, 0

TABULADOR = "\t"
ESPACIO = " "
COMA = ","


@dataclass(frozen=True)
class Formato:
    """Un formato de salida con todo lo que el resto del paquete necesita saber."""

    clave: str
    extension: str
    tipo_mime: str
    metadatos: str
    #                    None = binario (no se escribe por lineas)
    separador: str | None
    descripcion: str

    @property
    def es_texto(self) -> bool:
        return self.separador is not None

    @property
    def solo_numeros(self) -> bool:
        """Si el archivo no admite ni una celda que no sea un numero."""
        return self.clave == DAT_NUMERICO


FORMATOS: dict[str, Formato] = {
    CSV: Formato(
        CSV, "csv", "text/csv", OPCIONAL, COMA,
        "Separado por comas, UTF-8, fecha ISO. Lo lee pandas, Excel y R."),
    DAT: Formato(
        DAT, "dat", "text/plain", OPCIONAL, TABULADOR,
        "Igual que el csv pero separado por tabuladores."),
    DAT_NUMERICO: Formato(
        DAT_NUMERICO, "dat", "text/plain", PROHIBIDO, ESPACIO,
        "ASCII solo numerico, sin cabecera, separado por espacios, para el `load()` "
        "clasico de MATLAB. El tiempo va como datenum. NO admite metadatos: "
        "cualquier linea que no sea un numero rompe `load()`, asi que pedirlos "
        "devuelve error en vez de un archivo pelado."),
    MAT: Formato(
        MAT, "mat", "application/octet-stream", SIEMPRE, None,
        "Binario MATLAB v5 (`load` directo). Trae la struct `datos` con un vector "
        "por columna y la struct `meta` con rango, unidades y advertencias. Aca los "
        "metadatos son nativos y no rompen nada, asi que van siempre."),
}

POR_DEFECTO = CSV


def obtener(clave: str) -> Formato:
    """El formato pedido, o `PedidoInvalido`. Puerta unica de validacion."""
    formato = FORMATOS.get(clave)
    if formato is None:
        raise PedidoInvalido(
            FORMATO_DESCONOCIDO,
            f"formato {clave!r} desconocido; validos: {', '.join(FORMATOS)}",
        )
    return formato


def quiere_metadatos(formato: Formato, pedido: int | None) -> bool:
    """Si este archivo lleva metadatos. Levanta si se pidieron y el formato no puede.

    `pedido` es `None` cuando el cliente no mando el parametro, y ahi manda el
    formato. Ver la cabecera del modulo para por que esa diferencia importa.
    """
    if formato.metadatos == PROHIBIDO:
        if pedido == SI:
            raise PedidoInvalido(
                FORMATO_SIN_METADATOS,
                f"el formato {formato.clave!r} no admite metadatos: cualquier linea "
                f"que no sea un numero rompe el `load()` de MATLAB. Pedilo sin "
                f"`metadatos`, o con `metadatos=0`, o usa `dat` si los queres",
            )
        return False
    if formato.metadatos == SIEMPRE:
        return True
    return pedido != NO


def ignoro_el_pedido(formato: Formato, pedido: int | None) -> bool:
    """Si el archivo lleva metadatos aunque hayan pedido no llevarlos.

    Solo pasa en `.mat`, donde la struct `meta` es nativa y no rompe nada. Se
    devuelve para que el propio archivo lo diga: dar de MAS tampoco se avisa por
    telepatia.
    """
    return formato.metadatos == SIEMPRE and pedido == NO
