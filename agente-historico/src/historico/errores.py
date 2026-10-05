"""De error tipado a codigo HTTP. UN solo lugar, no diez `try/except` iguales.

Hasta ahora la API solo traducia `TypeError` a 400, asi que todo lo demas salia
500: "culpa del servidor" cuando el parametro lo eligio mal quien pregunto. Y en
esta API quien pregunta suele ser un LLM, que se equivoca de variable o de fecha
con toda naturalidad y necesita poder corregirse: un 500 no le dice nada, un 400
con `codigo` si.

## Por que un manejador de excepciones y no un decorador

Los cuatro errores tipados del proyecto heredan todos de `ValueError`
(`VentanaInvalida`, `VariableDesconocida` (que ademas es `KeyError`),
`FuenteAusente` y los `ValueError` sueltos de los algoritmos). Con un unico
manejador registrado en la app, TODO endpoint queda cubierto por construccion,
incluidos los que se escriban despues y `POST /tool/<nombre>`, donde los
parametros los elige el modelo. Un decorador habria que acordarse de ponerlo, y
el dia que alguien lo olvide el sintoma es un 500 en produccion.

**El costo, dicho en voz alta:** un `ValueError` interno que sea un defecto
nuestro tambien sale 400 en vez de 500. Se acepta a cambio de que ningun error de
parametro se disfrace de fallo del servidor, que es el caso frecuente aca; el
mensaje viaja igual en `detail`, asi que el defecto sigue siendo visible.

## Por que el codigo va en el cuerpo

`detail` es prosa y cambia. El cliente que quiera distinguir "esa fecha no se
entiende" de "esa ventana es demasiado grande" no puede quedar atado a comparar
cadenas de texto en español: el dia que alguien mejora un mensaje se rompe una
decision de interfaz sin que nada avise. `codigo` es el contrato estable, y
`detail` sigue siendo un string para que el cliente actual lo siga leyendo.
"""
from __future__ import annotations

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

# El parametro esta mal escrito o no existe: 400.
_MAL_ESCRITO = status.HTTP_400_BAD_REQUEST
# El parametro se entiende pero la peticion no se puede servir con estos datos: 422.
_IMPOSIBLE_DE_SERVIR = status.HTTP_422_UNPROCESSABLE_CONTENT

# Codigo de un `ValueError` sin codigo propio (cola invalida, unidades mezcladas,
# grupos vacios, agregacion invalida): el parametro es del que pregunta igual.
CODIGO_GENERICO = "parametro_invalido"

ESTADO_POR_CODIGO: dict[str, int] = {
    "fecha_ilegible": _MAL_ESCRITO,
    "rango_vacio": _MAL_ESCRITO,
    "granularidad_desconocida": _MAL_ESCRITO,
    "variable_desconocida": _MAL_ESCRITO,
    CODIGO_GENERICO: _MAL_ESCRITO,
    "ventana_demasiado_fina": _IMPOSIBLE_DE_SERVIR,
    "fuente_ausente": _IMPOSIBLE_DE_SERVIR,
}


class ParametroInvalido(ValueError):
    """Parametro que la funcion llamada no acepta. Traduce el `TypeError` del dispatch.

    Existe para que ese caso entre por la misma puerta que el resto en vez de por
    un `try/except` propio: el `TypeError` de un `run(**params)` con una clave de
    mas significa exactamente lo mismo que un `ValueError`, que quien llamo se
    equivoco de parametro.
    """

    codigo = CODIGO_GENERICO


def traducir(exc: Exception) -> tuple[int, dict]:
    """(estado HTTP, cuerpo) de un error de parametro. Puro: se prueba sin servidor."""
    codigo = getattr(exc, "codigo", None) or CODIGO_GENERICO
    return ESTADO_POR_CODIGO.get(codigo, _MAL_ESCRITO), {
        "detail": str(exc) or exc.__class__.__name__,
        "codigo": codigo,
    }


def registrar(app: FastAPI) -> None:
    """Cablea el manejador compartido. Se llama una vez, al construir la app."""

    @app.exception_handler(ValueError)
    def _parametro_invalido(_: Request, exc: ValueError) -> JSONResponse:
        estado, cuerpo = traducir(exc)
        return JSONResponse(status_code=estado, content=cuerpo)
