"""La marca de tiempo del archivo: texto ISO y datenum de MATLAB. Puro, sin base.

## LOS TIMESTAMPS SON HORA LOCAL DE COSTA RICA, aunque digan `+00`

Las columnas son `timestamptz` y los valores vienen etiquetados `+00`, pero lo que
se guardo es el reloj de pared local (UTC-6) con esa etiqueta puesta encima. Esta
verificado contra el dato, no supuesto: ver la cabecera de `analitica/ventana.py`.
Consecuencia para quien exporta: **no se convierte de zona horaria en ningun
punto**, ni aca ni despues en MATLAB. Hacerlo corre seis horas el archivo entero.

`astimezone(UTC)` de abajo no contradice eso, y conviene decir por que: no mueve el
reloj a otra zona, DESHACE lo que haya hecho el driver segun el `TimeZone` de la
sesion y devuelve el mismo instante etiquetado `+00`, que es literalmente lo que la
base tiene escrito. Sin esa linea, el dia que el pooler cambie su zona por defecto
todos los archivos saldrian desplazados y nada avisaria.
"""
from __future__ import annotations

from datetime import datetime, timezone

FORMATO_ISO = "%Y-%m-%d %H:%M:%S"

# datenum de MATLAB del 1970-01-01, o sea del cero de la epoca Unix. MATLAB cuenta
# dias desde el año 0; Python cuenta segundos desde 1970.
DATENUM_EPOCH_UNIX = 719529
SEGUNDOS_POR_DIA = 86400.0


def normalizar(ts: datetime) -> datetime:
    """El instante tal como la base lo tiene escrito, etiquetado `+00`."""
    if ts.tzinfo is None:
        return ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(timezone.utc)


def texto(ts: datetime) -> str:
    """`aaaa-mm-dd hh:mm:ss` en hora local del sitio, sin sufijo de zona.

    Sin sufijo A PROPOSITO: escribir `+00` invita a que Excel, pandas o MATLAB
    conviertan a la zona del que abre el archivo, que es el error que este modulo
    existe para evitar. El bloque de metadatos dice cual es la zona real.
    """
    return normalizar(ts).strftime(FORMATO_ISO)


def datenum(ts: datetime) -> float:
    """Dias desde el año 0, el numero que MATLAB entiende como fecha.

    `datestr(t)` y `datetime(t, 'ConvertFrom', 'datenum')` lo leen directo. Da la
    hora LOCAL del sitio, igual que `texto`, porque parte del mismo instante.
    """
    return normalizar(ts).timestamp() / SEGUNDOS_POR_DIA + DATENUM_EPOCH_UNIX
