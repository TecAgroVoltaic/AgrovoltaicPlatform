"""Fig. 6, panel GHI: irradiacion mensual acumulada, integrando a cadencia real."""
from __future__ import annotations

from datetime import datetime

from historico import db
from historico.analitica import catalogo, fuente, resultado
from historico.analitica.distribucion.comun import (
    _FORMATO_MES_SQL,
    FORMATO_MES,
    IRRADIANCIA_POR_DEFECTO,
    JULIOS_POR_KWH,
    MINIMO_LECTURAS_INTEGRAL,
    UNIDAD_IRRADIACION,
    UNIDAD_IRRADIANCIA,
    _meses,
)
from historico.analitica.ventana import Ventana


def reducir_irradiacion(meses: list[datetime], filas: list[dict]) -> list[dict]:
    """Julios por metro cuadrado a kWh/m2, un renglon por mes. Pura.

    La media diaria se divide por los dias CON DATO y no por los del mes: un mes con
    seis dias registrados no acumulo poco, es que casi no se midio, y dividir entre
    30 lo haria pasar por un mes oscuro.
    """
    por_mes = {f["mes"]: f for f in filas}
    barras = []
    for t in meses:
        mes = t.strftime(FORMATO_MES)
        f = por_mes.get(mes, {})
        n, dias = int(f.get("n") or 0), int(f.get("dias") or 0)
        integrable = n >= MINIMO_LECTURAS_INTEGRAL and f.get("julios_m2") is not None
        total = f["julios_m2"] / JULIOS_POR_KWH if integrable else None
        barras.append({
            "mes": mes, "n": n, "dias_con_dato": dias,
            "irradiacion": resultado.metrica(
                round(total, 2) if total is not None else None, n, UNIDAD_IRRADIACION),
            "media_diaria": resultado.metrica(
                round(total / dias, 2) if total is not None and dias else None,
                n, f"{UNIDAD_IRRADIACION}/dia"),
        })
    return barras


def irradiacion_mensual(v: Ventana, variable: str = IRRADIANCIA_POR_DEFECTO) -> dict:
    """Fig. 6 (panel GHI): irradiacion acumulada por mes, integrando a cadencia real."""
    var, o = catalogo.obtener(variable), fuente.origen(variable)
    if var.unidad != UNIDAD_IRRADIANCIA:
        raise ValueError(
            f"{variable!r} ({var.unidad}) no se puede integrar a {UNIDAD_IRRADIACION}: "
            f"hace falta una irradiancia en {UNIDAD_IRRADIANCIA}"
        )
    # La integral y la confianza son independientes: van a la vez y el endpoint pasa
    # de dos viajes al pooler a uno. Ver `db.en_paralelo`.
    confianza, filas = db.en_paralelo(
        lambda: fuente.confianza_de(v, [variable]),
        lambda: db.query(
            f"""
            WITH lecturas AS ({fuente.lecturas_pesadas(o)})
            SELECT to_char(date_trunc('month', ts), '{_FORMATO_MES_SQL}') AS mes,
                   sum(valor * segundos)::double precision AS julios_m2,
                   count(valor)                            AS n,
                   count(DISTINCT ts::date)                AS dias
              FROM lecturas
             GROUP BY 1
            """,
            v.sql,
        ),
    )
    barras = reducir_irradiacion(_meses(v), filas)
    total = sum(b["irradiacion"]["valor"] or 0 for b in barras)
    n_total = sum(b["n"] for b in barras)
    return resultado.sobre(
        v, confianza,
        variable={"clave": variable, "etiqueta": var.etiqueta, "unidad": var.unidad},
        techo_salto_seg=fuente.TECHO_SALTO_SEG, barras=barras,
        total=resultado.metrica(round(total, 2), n_total, UNIDAD_IRRADIACION),
    )
