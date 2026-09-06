"""Los errores tipados de la exportacion. Sin dependencias: lo importa todo el paquete.

Vive aparte de `historico.errores` porque aquel importa FastAPI, y los algoritmos de
este paquete no tienen por que saber que existe un servidor HTTP. El reparto es el
mismo de siempre: aca se PONE el codigo, alla se traduce a un estado HTTP.

`codigo` es el contrato estable y `detail` es prosa: el cliente que quiera
distinguir "esa columna no existe" de "ese formato no admite metadatos" no puede
quedar atado a comparar textos en español.
"""
from __future__ import annotations

RELACION_DESCONOCIDA = "relacion_desconocida"
COLUMNA_DESCONOCIDA = "columna_desconocida"
FORMATO_DESCONOCIDO = "formato_desconocido"
# Se pidieron metadatos en un formato que no puede llevarlos (ver `formatos`).
FORMATO_SIN_METADATOS = "formato_sin_metadatos"
# Se pidio una columna de texto en un formato que solo admite numeros.
COLUMNA_NO_NUMERICA = "columna_no_numerica"

CODIGOS = (RELACION_DESCONOCIDA, COLUMNA_DESCONOCIDA, FORMATO_DESCONOCIDO,
           FORMATO_SIN_METADATOS, COLUMNA_NO_NUMERICA)


class PedidoInvalido(ValueError):
    """Pedido de exportacion que no se puede servir tal como vino.

    Hereda de `ValueError` como los otros tres errores tipados del proyecto
    (`VentanaInvalida`, `VariableDesconocida`, `FuenteAusente`): con eso el
    manejador global de `historico.errores` lo traduce a 4xx con su `codigo` por
    construccion, sin que el endpoint tenga que acordarse de nada.
    """

    def __init__(self, codigo: str, mensaje: str) -> None:
        super().__init__(mensaje)
        self.codigo = codigo
