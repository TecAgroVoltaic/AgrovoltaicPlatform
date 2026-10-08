"""Quien vigila que: el matiz entre "salio limpia" y "nadie la miro".

Apoyo PURO de `/calidad/resumen`: la consulta del conteo la hace el endpoint, para
mandarla en la misma tanda que las otras cuatro.
"""
from __future__ import annotations

from historico.analitica import catalogo

_NOTA_VIGILANCIA = (
    "`sin_vigilancia` NO significa `sin hallazgos`, y la respuesta separa las dos "
    "cosas a proposito porque confundirlas hace afirmar algo falso. "
    "`hallazgos_en_el_periodo` cuenta los que SI existen para esa clave (la POA "
    "tiene, y aun asi nadie la barre), y `cuentan_para_el_veredicto` dice si "
    "`confianza` puede verlos: solo llegan los que traen una de las "
    "`fuentes_del_veredicto`, las unicas relaciones con denominador de filas por "
    "dia. Los motivos: `columna_no_barrida` = su tabla si se cuenta, pero el barrido "
    "no mira esa columna; `fuente_sin_denominador` = puede acumular hallazgos y "
    "ninguno pesara jamas en el veredicto; `variable_derivada` = no existe cruda, "
    "ningun detector puede escribirla; `sin_fuente_en_la_base` = ninguna tabla la "
    "contiene. En los cuatro, cero hallazgos no es un aprobado: es un examen en blanco. "
    "`hallazgos_sin_peso` es el TOTAL de los que no pesan en el veredicto (la suma de "
    "`hallazgos_en_el_periodo` de las que tienen `cuentan_para_el_veredicto` en false), "
    "y viaja sumado porque el que lo lee no puede sumarlo: son casi uno de cada cinco "
    "y el titular de esa advertencia es el total, no la mayor de las partes."
)

_SQL_VIGILANCIA = ("SELECT variable, count(*) AS n FROM hallazgos_calidad "
                   "WHERE fecha >= %s AND fecha < %s GROUP BY variable")


# Las relaciones cuyos hallazgos SI llegan al veredicto del dia. NO es una lista a
# mano: es el conjunto de `fuente_calidad` del catalogo, que por construccion son
# las dos tablas que el CTE `filas_dia` de `calidad.contexto` sabe contar (esa es
# literalmente la condicion 2 para entrar en `catalogo._VIGILADAS`). Derivarlo en
# vez de copiar los dos nombres es lo que hace que, si algun dia `contexto` aprende
# a contar una tercera tabla, esta respuesta no se quede vieja en silencio.
def _fuentes_del_veredicto() -> list[str]:
    return sorted({var.fuente_calidad for var in catalogo.CATALOGO.values()
                   if var.fuente_calidad})


def _motivo_sin_vigilancia(var, fuentes: list[str]) -> str:
    """Por que el barrido no revisa esta variable. Cuatro casos, todos distintos."""
    if not var.disponible:
        return "sin_fuente_en_la_base"
    if var.relacion_cruda is None:
        return "variable_derivada"
    if var.relacion_cruda not in fuentes:
        return "fuente_sin_denominador"
    return "columna_no_barrida"


def _vigilancia(conteo: dict[str, int]) -> dict:
    """Que variables reviso el barrido en el periodo y cuales no las miro NADIE.

    Sin esto, un examen en blanco se lee como un aprobado: `confianza` responde
    "cero hallazgos" tanto para una variable sana como para una que nadie abrio.
    Vivia solo por variable en `/calidad/pruebas` y dentro de `confianza` en
    analitica, asi que la vista de calidad lo reconstruia a mano.

    PURA: recibe el conteo por variable ya consultado (`_SQL_VIGILANCIA`). La
    consulta se hace afuera para que el endpoint la pueda mandar junto con las otras
    cuatro en un solo viaje al pooler; ver `calidad_resumen`.
    """
    fuentes = _fuentes_del_veredicto()
    vigiladas, ciegas = [], []
    for var in catalogo.CATALOGO.values():
        if var.clave_calidad:
            vigiladas.append(var.clave)
            continue
        crudo = var.origen_crudo
        cruda = crudo[1] if crudo else None
        ciegas.append({
            "clave": var.clave,
            "familia": var.familia,
            "fuente": var.relacion_cruda,
            "motivo": _motivo_sin_vigilancia(var, fuentes),
            "hallazgos_en_el_periodo": (
                conteo.get(var.clave, 0)
                + (conteo.get(cruda, 0) if cruda and cruda != var.clave else 0)),
            "cuentan_para_el_veredicto": var.relacion_cruda in fuentes,
        })
    return {
        "vigiladas": vigiladas,
        "sin_vigilancia": ciegas,
        # El TITULAR de la advertencia, sumado aca. La consola no puede sumarlo (no
        # se calcula en el navegador), asi que sin este total mostraba el corte y la
        # mayor de las partes en vez del numero que hace pesar la advertencia.
        "hallazgos_sin_peso": sum(c["hallazgos_en_el_periodo"] for c in ciegas
                                  if not c["cuentan_para_el_veredicto"]),
        "fuentes_del_veredicto": fuentes,
        "nota": _NOTA_VIGILANCIA,
    }
