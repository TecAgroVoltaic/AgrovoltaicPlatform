"""Composicion del analisis desde las filas YA consultadas, y su calculo contra la base."""
from __future__ import annotations

from historico import db
from historico.analitica import catalogo, resultado
from historico.analitica.correlacion import confianza_de
from historico.analitica.rendimiento.avisos import aval_pendiente, error_formula_literal, fuente_energia
from historico.analitica.rendimiento.constantes import (
    _CAMPOS_DEL_DIA,
    CLAVES,
    CLAVES_POA,
    COBERTURA_MINIMA,
    DESFASE_MAXIMO_H,
    GHI,
    INSUMOS,
    TECHO_DT_SEG,
)
from historico.analitica.rendimiento.consulta import consultar
from historico.analitica.rendimiento.dia import evaluar_dia, pr_del_dia
from historico.analitica.rendimiento.pr import matriz
from historico.analitica.ventana import Ventana

_NOTA = (
    "PR diario y mensual (metodo de Leo Cardinale, R1 del 2026-08-30), NO la metrica "
    "de 5 minutos. La irradiacion del dia se integra con el dt REAL entre lecturas "
    "acotado a un techo, y no con el `5/60` literal: la cadencia de la radiacion va de "
    "15 a 330 s y la formula literal infla octubre 2025 un +860% y desinfla diciembre "
    "un -6,6% (ver `error_formula_literal`). El contador de energia es el camino "
    "principal y la integral de la potencia el RESPALDO: cada uno se agrega sobre SU "
    "propio conjunto de dias y nunca se mezclan en el mismo numero. Las variantes "
    "contra POA son PROVISIONALES: R2 dejo la ecuacion de transposicion esperando a "
    "Hugo. Un PR > 1 es fisicamente imposible y viaja marcado."
)


def _por_mes(dias: list[dict], motivo_poa: str) -> list[dict]:
    meses: dict[str, list[dict]] = {}
    for dia in dias:
        meses.setdefault(dia["dia"][:7], []).append(dia)
    return [{"mes": mes, "dias": len(grupo), **matriz(grupo, motivo_poa)}
            for mes, grupo in sorted(meses.items())]


def componer(filas: list[dict], insumo: str = GHI,
             motivo_poa: str = resultado.SIN_LECTURAS) -> dict:
    """Todo el analisis desde las filas YA consultadas. PURA: aca vive el criterio."""
    dias = [evaluar_dia(f) for f in filas]
    validos = [d for d in dias if d["valido"]]
    descartados = [{"dia": d["dia"], "motivos_descarte": d["motivos_descarte"],
                    "cobertura_radiacion": d["cobertura_radiacion"],
                    "cobertura_electrico": d["cobertura_electrico"],
                    "desfase_h": d["desfase_h"]}
                   for d in dias if not d["valido"]]
    return {
        "insumo_del_detalle_diario": insumo,
        "criterio_dia_valido": {
            "cobertura_minima": COBERTURA_MINIMA,
            "desfase_maximo_h": DESFASE_MAXIMO_H,
            "medido_contra": "ventana_solar.horas_sol",
            "explicacion": ("un dia con la mitad de las lecturas da la mitad de la "
                            "irradiacion y arruina el PR sin avisar. El que de verdad "
                            "filtra es el desfase: dos coberturas aceptables por "
                            "separado pueden cubrir tramos distintos del dia"),
        },
        "dias": {"con_dato": len(dias), "validos": len(validos),
                 "descartados": len(descartados), "detalle_descartados": descartados},
        "por_dia": [{**{k: d.get(k) for k in _CAMPOS_DEL_DIA},
                     "pr": pr_del_dia(d, insumo)} for d in dias],
        "por_mes": _por_mes(validos, motivo_poa),
        "total": matriz(validos, motivo_poa),
        "fuente_energia": fuente_energia(validos),
        "error_formula_literal": error_formula_literal(dias),
        "aval_pendiente": aval_pendiente(),
        "techo_dt_seg": TECHO_DT_SEG,
        "nota": _NOTA,
    }


def calcular(ventana: Ventana, insumo: str = GHI) -> dict:
    """El PR diario y mensual de la ventana, con su bloque de confianza.

    `insumo` solo elige que variante se detalla dia a dia: los meses y el total
    llevan SIEMPRE las seis combinaciones, para que el veredicto no dependa de un
    parametro que quien pregunta puede no saber que existe.
    """
    if insumo not in INSUMOS:
        raise ValueError(f"insumo {insumo!r}; validos: {', '.join(INSUMOS)}")
    # Fuera del tramo con POA no hay un PR malo: no hay PR, y se dice distinto.
    sin_poa = catalogo.fuera_de_cobertura(ventana.desde, ventana.hasta, *CLAVES_POA)
    motivo_poa = resultado.FUERA_DE_COBERTURA if sin_poa else resultado.SIN_LECTURAS
    # La confianza y el renglon diario son dos consultas INDEPENDIENTES: salen a la
    # vez y el endpoint pasa de dos viajes al pooler a uno. Ver `db.en_paralelo`.
    confianza, filas = db.en_paralelo(
        lambda: confianza_de(ventana, *CLAVES),
        lambda: consultar(ventana),
    )
    return resultado.sobre(
        ventana, confianza,
        **componer(filas, insumo, motivo_poa),
        cobertura_poa={"fuera_de_cobertura": sin_poa},
    )
