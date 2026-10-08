"""Las crestas contra la base: muestras adelgazadas por grupo y el sobre con metricas.

`_muestras` se resuelve en la fachada del paquete: es el punto que sustituyen las
pruebas para no ir a la base.
"""
from __future__ import annotations

from historico import db
from historico.analitica import catalogo, correlacion, resultado
from historico.analitica.crestas.densidad import (
    MUESTRAS_MAXIMAS,
    PUNTOS_REJILLA,
    SUPERIOR,
    UNIDADES_MEZCLADAS,
    reducir,
)
from historico.analitica.ventana import Ventana

_SQL_MUESTRAS = """
    SELECT s.valor, s.total
      FROM (SELECT {columna} AS valor,
                   row_number() OVER (ORDER BY "timestamp") AS rn,
                   count(*)    OVER ()                      AS total
              FROM {relacion}
             WHERE "timestamp" >= %s AND "timestamp" < %s
               AND {columna} IS NOT NULL) s
     WHERE mod(s.rn, greatest(1, s.total / %s)) = 0
"""


def _muestras(ventana: Ventana, variable: catalogo.Variable,
              tope: int) -> tuple[list[float], int]:
    """Las lecturas del grupo, adelgazadas a paso fijo, y cuantas hay en total.

    El paso fijo (y no un muestreo al azar) mantiene la distribucion y ademas hace
    la respuesta reproducible: la misma pregunta dibuja la misma cresta dos veces.
    """
    sql = _SQL_MUESTRAS.format(columna=variable.columna, relacion=variable.relacion)
    filas = db.query(sql, ventana.sql + (tope,))
    return [f["valor"] for f in filas], (filas[0]["total"] if filas else 0)


def _enriquecer(grupo: dict, variable: catalogo.Variable, fuera: str | None) -> dict:
    """Le pone nombre y unidad al grupo y saca CADA escalar por `metrica`.

    `fuera` es el motivo LEGIBLE de que la ventana no toque el tramo en que la
    variable existe. Viaja aparte del codigo `fuera_de_cobertura` porque el codigo
    dice que paso y este dice entre que fechas si habria dato, que es lo unico
    accionable para quien pregunto.

    Los estadisticos salen envueltos uno por uno y no como numeros pelados por la
    misma razon de siempre: una mediana de 0 y una mediana que no existe se ven
    igual sueltas, y esta figura se usa justamente para mirar sensores sospechosos.
    Las densidades y la rejilla si van crudas: son arreglos de 200 puntos y
    envolverlos punto a punto multiplicaria la respuesta sin decir nada nuevo.
    """
    motivo = (resultado.FUERA_DE_COBERTURA if fuera
              else grupo["motivo"] or resultado.SIN_LECTURAS)
    est = grupo["estadisticos"] if not fuera else None
    n = 0 if est is None else grupo["n_usadas"]
    probabilidad = None if fuera else grupo["prob_sobre_umbral"]
    return {
        **grupo, "motivo": resultado.FUERA_DE_COBERTURA if fuera else grupo["motivo"],
        "fuera_de_cobertura": fuera,
        "etiqueta": variable.etiqueta, "unidad": variable.unidad,
        "estadisticos": None if est is None else {
            nombre: resultado.metrica(valor, n, variable.unidad, motivo)
            for nombre, valor in est.items()},
        "prob_sobre_umbral": resultado.metrica(
            probabilidad, 0 if probabilidad is None else n, "probabilidad", motivo),
    }


def densidades(ventana: Ventana, grupos: list[str], umbral: float | None = None,
               cola: str = SUPERIOR, puntos_rejilla: int = PUNTOS_REJILLA,
               tope_muestras: int = MUESTRAS_MAXIMAS) -> dict:
    """Crestas de una misma magnitud para varios grupos del catalogo."""
    from historico.analitica import crestas as fachada

    if not grupos:
        raise ValueError("hay que pedir al menos un grupo (clave del catalogo)")
    variables = [catalogo.obtener(c) for c in grupos]
    ausentes = [v for v in variables if not v.disponible]
    if ausentes:
        raise ValueError(f"{ausentes[0].clave}: {ausentes[0].fuente_ausente}")
    unidades = {v.unidad for v in variables}
    if len(unidades) > 1:
        # Apilar W sobre grados C da una figura que se lee pero no significa nada.
        raise ValueError(f"{UNIDADES_MEZCLADAS}: las crestas comparan una MISMA "
                         f"magnitud entre grupos, y llegaron {sorted(unidades)}")

    # Un grupo fuera de su cobertura no se consulta: devolveria cero lecturas, y
    # "no hay dato" y "no existia todavia" no son lo mismo. Se evalua grupo por grupo
    # porque las crestas comparan sensores con historias distintas: el SP722 grabo
    # dieciocho dias y el piranometro de al lado casi un año.
    fuera = {v.clave: catalogo.fuera_de_cobertura(ventana.desde, ventana.hasta, v.clave)
             for v in variables}
    # Una consulta por grupo mas la de confianza, todas independientes: la vista de
    # Estadistica pide tres grupos, o sea cuatro viajes al pooler en fila (~900 ms)
    # que juntos cuestan uno. Ver `db.en_paralelo` y la cabecera de `historico.db`.
    #
    # El grupo fuera de cobertura sigue sin consultarse (devuelve la muestra vacia
    # sin tocar la base), pero conserva su lugar en la lista: sacarlo desalinearia
    # los resultados de las variables que si se consultaron.
    confianza, *por_grupo = db.en_paralelo(
        lambda: correlacion.confianza_de(ventana, *grupos),
        *[(lambda v=v: ([], 0) if fuera[v.clave]
           else fachada._muestras(ventana, v, tope_muestras)) for v in variables],
    )
    muestras = {v.clave: m for v, m in zip(variables, por_grupo)}

    calculado = reducir(muestras, umbral, cola, puntos_rejilla)
    por_clave = {g["grupo"]: g for g in calculado["grupos"]}
    return resultado.sobre(
        ventana, confianza,
        unidad=unidades.pop(), rejilla=calculado["rejilla"],
        umbral=umbral, cola=cola,
        grupos=[_enriquecer(por_clave[v.clave], v, fuera[v.clave]) for v in variables],
        nota=(f"densidades KDE (gaussian_kde) sobre una rejilla comun, coloreables "
              f"por `prob_cola` (masa de probabilidad de la cola {cola} en cada punto). "
              f"Los grupos con mas de {tope_muestras} lecturas se muestrean a paso "
              f"fijo: `n` es el total real y `n_usadas` lo que entro al calculo."),
    )
