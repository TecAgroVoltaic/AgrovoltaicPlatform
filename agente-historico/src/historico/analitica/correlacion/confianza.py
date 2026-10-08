"""El bloque de confianza de un grupo de variables, con su ceguera a la vista."""
from __future__ import annotations

from historico.analitica import catalogo
from historico.analitica.ventana import Ventana
from historico.calidad import contexto


def advertir_sin_vigilancia(bloque: dict, ciegas: list[str]) -> dict:
    """Le agrega al bloque de confianza lo que el barrido NO revisa. PURA.

    Cero hallazgos y nadie mirando se ven IGUAL en el bloque, y no son lo mismo.
    Una correlacion entre irradiancia y potencia tiene confianza medida; una entre
    POA y potencia sale con la misma cara y no la tiene, porque el barrido no vigila
    la POA. Es la misma regla por la que `metrica` exige un motivo: la ausencia de
    señal no es señal de ausencia.

    La advertencia previa NO se pisa: si el periodo ya venia flojo, las dos cosas
    tienen que llegar juntas al que lee.
    """
    if not ciegas:
        return bloque
    bloque["sin_vigilancia"] = ciegas
    aviso = (f"el barrido no revisa {', '.join(ciegas)}: que no tengan hallazgos NO "
             f"dice que esten limpias, dice que nadie las miro")
    previa = bloque.get("advertencia")
    bloque["advertencia"] = f"{previa}. {aviso}" if previa else aviso
    return bloque


def confianza_de(ventana: Ventana, *claves: str) -> dict:
    """El bloque de confianza de estas variables, con su ceguera a la vista.

    Puerta unica de los tres modulos de esta tanda. La traduccion clave -> nombre de
    calidad la hace el CATALOGO (`para_confianza`), que es donde tiene que vivir:
    hacerla a mano en cada modulo fue justo como aparecio el fallo de los 321
    hallazgos de irradiancia que se perdian.
    """
    variables, fuente = catalogo.para_confianza(*claves)
    bloque = contexto.confianza(*ventana.sql, variables, fuente)
    return advertir_sin_vigilancia(bloque, catalogo.sin_vigilancia(*claves))
