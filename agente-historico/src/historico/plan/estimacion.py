"""Cuantas filas tendra cada archivo antes de generarlo, y los topes del plan.

- Ancho: una fila por intervalo de la rejilla completa -> EXACTO.
- Largo con paso: intervalos x cajas de cada columna -> COTA superior (`cota: true`).
- Largo crudo: conteo de lecturas en la base o en la API (exacto salvo con muchos
  sensores de AgroDash, donde se estima ~1 lectura/min por sensor).
"""
from __future__ import annotations

from historico import db
from historico.exportar.modelo import MAX_FILAS_MAT
from historico.plan import agrodash, sql
from historico.plan.modelo import (
    ANCHO, TOPE_DURO, UMBRAL_CONFIRMACION, ArchivoPlan, ColumnaPlan, Plan, PlanInvalido,
)
from historico.plan.rejilla import n_intervalos
from historico.plan.salida import columnas_publicas


def _filas_columna_larga(plan: Plan, c: ColumnaPlan) -> tuple[int, bool]:
    if plan.paso_s:
        unidades = len(c.variable.cajas) or 1      # PV: una serie; resto: una por caja
        return n_intervalos(plan.inicio, plan.fin, plan.paso_s) * unidades, True
    if c.variable.via_api:
        return agrodash.conteo_crudo(c, plan.inicio, plan.fin)
    consulta, params = sql.conteo_crudo(c, plan.inicio, plan.fin)
    return int(db.uno(consulta, tuple(params)).get("n") or 0), False


def _filas_archivo(plan: Plan, a: ArchivoPlan) -> tuple[int, bool]:
    if a.forma == ANCHO:
        return n_intervalos(plan.inicio, plan.fin, plan.paso_s), False
    total, cota = 0, False
    for c in a.columnas:
        n, es_cota = _filas_columna_larga(plan, c)
        total += n
        cota = cota or es_cota
    return total, cota


def estimar(plan: Plan) -> dict:
    """Cuerpo de `GET /datos/exportar/plan/estimar`. Corta con `plan_demasiado_grande`
    (total > TOPE_DURO) o `mat_demasiado_grande` (un .mat sobre su tope de memoria)."""
    archivos = []
    for a in plan.archivos:
        filas, cota = _filas_archivo(plan, a)
        if a.formato == "mat" and filas > MAX_FILAS_MAT:
            raise PlanInvalido("mat_demasiado_grande",
                               f"archivo {a.indice}: {filas:,} filas y .mat admite hasta {MAX_FILAS_MAT:,} "
                               f"(se arma completo en memoria); usa csv/dat o acorta el rango")
        archivos.append({"indice": a.indice, "nombre": a.nombre_completo, "formato": a.formato,
                         "forma": a.forma, "filas": filas, "cota": cota,
                         "columnas": columnas_publicas(a)})
    total = sum(x["filas"] for x in archivos)
    if total > TOPE_DURO:
        raise PlanInvalido("plan_demasiado_grande",
                           f"el plan suma {total:,} filas y el tope es {TOPE_DURO:,}: acorta el "
                           f"rango, usa un intervalo mas grueso o menos columnas")
    return {"archivos": archivos, "total_filas": total,
            "requiere_confirmacion": total > UMBRAL_CONFIRMACION, "tope_duro": TOPE_DURO}
