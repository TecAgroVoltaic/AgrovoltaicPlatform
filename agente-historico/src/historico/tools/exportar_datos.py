"""Tool `exportar_datos` — una FICHA de descarga para que el usuario baje los datos.

Contrato §2 (`docs/referencia/contratos-asistente-alertas.md`). La tool NO genera
el archivo: valida con las mismas funciones de `exportar.py` que usa
`GET /datos/exportar`, estima cuantas filas saldran y devuelve en `_descarga` la
URL de ese mismo endpoint. El navegador la baja con el boton que pinta la
interfaz; el LLM nunca ve bytes (el lazo del chat quita toda clave `_`).

## `hasta`: exclusivo en la entrada, inclusivo en la URL

Todas las tools reciben `hasta` EXCLUSIVO, y el modelo no tiene por que aprender
una excepcion. `GET /datos/exportar`, en cambio, toma una fecha `hasta` como
INCLUSIVA (quien pide "del 1 al 31" espera el 31 adentro). La traduccion se hace
aca, una sola vez: una fecha se corre un dia atras; una fecha con hora ya es
exclusiva tambien en el endpoint y viaja tal cual.
"""
from __future__ import annotations

from datetime import date, timedelta
from urllib.parse import urlencode

from historico import exportar
from historico.tools import opciones

VERSION = 1
RUTA_EXPORTAR = "/datos/exportar"
FUENTE_POR_DEFECTO = "supabase"
FORMATO_POR_DEFECTO = "csv"
_SEPARADOR = ","
_LARGO_FECHA = len("aaaa-mm-dd")
ERROR_MAT = "demasiado grande para .mat; usa csv o acota el rango"
_NOTA = "Ofrecele la descarga al usuario; el boton lo pinta la interfaz."
_NOTA_ERROR = "No hay descarga: explicale el motivo y ofrecele csv o un rango mas corto."

_TABLAS = sorted({clave for _, clave in exportar.DATASETS})

SCHEMA = {
    "name": "exportar_datos",
    "description": (
        "Prepara una DESCARGA de datos crudos o corregidos para que el usuario se los "
        "lleve (Excel, MATLAB, Python). No genera el archivo: devuelve una ficha con "
        "las filas estimadas y la interfaz pinta el boton. Usala cuando pidan bajar, "
        "exportar o descargar datos, o 'estos datos' de un grafico. Tablas de "
        "Supabase (San Carlos): electrico_corregido, radiacion_calibrada, "
        "radiacion_poa, performance, etc.; de AgroDash: lecturas (filtrable por caja "
        "y sensor_tipo, con `paso`) y sensores. `desde`/`hasta` son obligatorios en "
        "las tablas con tiempo. Formato 'mat' tiene tope de filas."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "tabla": {"type": "string", "enum": _TABLAS, "description": "Dataset a exportar."},
            "formato": {"type": "string", "enum": list(exportar.FORMATOS),
                        "description": f"Default '{FORMATO_POR_DEFECTO}'."},
            **opciones.ventana(),
            "columnas": {"type": "array", "items": {"type": "string"},
                         "description": "Subconjunto de columnas. Omitir = todas."},
            "fuente": {"type": "string", "enum": list(exportar.FUENTES),
                       "description": f"Default '{FUENTE_POR_DEFECTO}'."},
            "caja": {"type": "array", "items": {"type": "string"},
                     "description": "Solo AgroDash: cajas a incluir."},
            "sensor_tipo": {"type": "array", "items": {"type": "string"},
                            "description": "Solo AgroDash: tipos de sensor."},
            "paso": {"type": "integer", "enum": list(exportar.PASOS_SEG),
                     "description": "Solo AgroDash lecturas: ancho del bucket en s; 0 = crudo."},
        },
        "required": ["tabla"],
        "additionalProperties": False,
    },
}


def hasta_del_endpoint(hasta: str | None) -> str | None:
    """`hasta` exclusivo de la tool -> el que entiende `GET /datos/exportar`."""
    if hasta is None or len(hasta.strip()) != _LARGO_FECHA:
        return hasta
    try:
        return (date.fromisoformat(hasta.strip()) - timedelta(days=1)).isoformat()
    except ValueError:
        return hasta    # que lo rechace `exportar` con su propio mensaje


def _url(parametros: dict[str, str | int | None]) -> str:
    presentes = {k: v for k, v in parametros.items() if v not in (None, "", 0)}
    return f"{RUTA_EXPORTAR}?{urlencode(presentes, safe=_SEPARADOR + ':')}"


def run(tabla: str, formato: str = FORMATO_POR_DEFECTO, desde: str | None = None,
        hasta: str | None = None, columnas: list[str] | None = None,
        fuente: str = FUENTE_POR_DEFECTO, caja: list[str] | None = None,
        sensor_tipo: list[str] | None = None, paso: int = 0) -> dict:
    ds = exportar._ds(fuente, tabla)
    _, extension = exportar._formato(formato)
    seleccion = [c.nombre for c in exportar._seleccion(ds, columnas)]
    paso = exportar._paso(ds, paso)
    filtros = {nombre: valores for nombre, valores in
               (("caja", caja or []), ("sensor_tipo", sensor_tipo or []))}
    hasta_endpoint = hasta_del_endpoint(hasta)
    estimacion = exportar.estimar(tabla, desde, hasta_endpoint, fuente, filtros, paso)

    resumen = {"tabla": tabla, "fuente": fuente, "formato": extension,
               "filas_estimadas": estimacion["filas"], "cota": estimacion["cota"],
               "primero": estimacion.get("primero"), "ultimo": estimacion.get("ultimo"),
               "columnas": seleccion}
    if extension == "mat" and estimacion["filas"] > exportar.MAX_FILAS_MAT:
        return {"resumen": {**resumen, "error": ERROR_MAT}, "nota": _NOTA_ERROR}

    url = _url({
        "tabla": tabla, "formato": extension, "desde": desde, "hasta": hasta_endpoint,
        "columnas": _SEPARADOR.join(seleccion) if columnas else None,
        "fuente": fuente if fuente != FUENTE_POR_DEFECTO else None,
        "caja": _SEPARADOR.join(filtros["caja"]),
        "sensor_tipo": _SEPARADOR.join(filtros["sensor_tipo"]),
        "paso": paso,
    })
    descarga = {
        "version": VERSION, "tabla": tabla, "fuente": fuente, "formato": extension,
        "desde": estimacion.get("desde"), "hasta": estimacion.get("hasta"),
        "columnas": seleccion, "filtros": filtros, "paso": paso,
        "filas_estimadas": estimacion["filas"], "cota": estimacion["cota"],
        "nombre_sugerido": exportar._nombre_archivo(ds, extension, estimacion.get("desde"),
                                                    estimacion.get("hasta"), filtros),
        "url": url,
    }
    return {"resumen": resumen, "_descarga": descarga, "nota": _NOTA}
