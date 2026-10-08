"""La escritura del generador: foto del estado, plan y escritura en UNA transaccion.

Las tres piezas viven juntas a proposito: la lectura del estado y la escritura del
plan solo son correctas dentro de la misma transaccion serializada por el candado
consultivo. Se usa a traves de `historico.alertas.store`.
"""
from __future__ import annotations

import json
from collections.abc import Callable, Sequence
from datetime import date

from historico import db
from historico.alertas import ciclo
from historico.alertas.modelo import AlertaAbierta, EstadoActual, Plan
from historico.alertas.store_sql import _CANDADO_EVALUACION, _INSERTAR_EVENTO, AUTOR_GENERADOR


def aplicar_evaluacion(claves: Sequence[str], planificar: Callable[[EstadoActual], Plan],
                       desde: date, hasta: date) -> Plan:
    """Foto del estado, plan y escritura en UNA transaccion serializada."""
    with db.transaccion() as tx:
        tx.query("SELECT pg_advisory_xact_lock(%s)", (_CANDADO_EVALUACION,))
        plan = planificar(_estado_actual(tx, claves))
        _escribir_plan(tx, plan)
        tx.query("INSERT INTO alertas_evaluaciones "
                 "(desde, hasta, creadas, actualizadas, revisadas, notas) "
                 "VALUES (%s, %s, %s, %s, %s, %s)",
                 (desde, hasta, len(plan.crear), len(plan.sumar),
                  plan.claves_evaluadas, len(plan.notas)))
    return plan


def _estado_actual(tx: db.Transaccion, claves: Sequence[str]) -> EstadoActual:
    abiertas = tx.query(
        "SELECT id, clave, estado, fecha_inicio, fecha_fin, ocurrencias, evidencia "
        "  FROM alertas WHERE estado = ANY(%s) AND (clave = ANY(%s) OR estado = %s) "
        "   FOR UPDATE",
        (list(ciclo.ABIERTOS), list(claves), ciclo.EN_SEGUIMIENTO))
    cerradas = tx.query(
        "SELECT clave, max(fecha_fin) AS fin FROM alertas "
        " WHERE estado = ANY(%s) AND clave = ANY(%s) GROUP BY clave",
        (list(ciclo.CERRADOS), list(claves)))
    en_seguimiento = [a["id"] for a in abiertas if a["estado"] == ciclo.EN_SEGUIMIENTO]
    notas = tx.query(
        "SELECT alerta_id, datos->>'sin_ocurrencias_desde' AS desde FROM alertas_eventos "
        " WHERE tipo = %s AND autor = %s AND alerta_id = ANY(%s)",
        (ciclo.EVENTO_NOTA, AUTOR_GENERADOR, en_seguimiento)) if en_seguimiento else []
    return EstadoActual(
        abiertas={a["clave"]: AlertaAbierta(
            id=a["id"], clave=a["clave"], estado=a["estado"],
            fecha_inicio=date.fromisoformat(a["fecha_inicio"]),
            fecha_fin=date.fromisoformat(a["fecha_fin"]),
            ocurrencias=a["ocurrencias"], evidencia=a["evidencia"] or {}) for a in abiertas},
        fin_cerradas={c["clave"]: date.fromisoformat(c["fin"]) for c in cerradas},
        notas_previas=frozenset((n["alerta_id"], date.fromisoformat(n["desde"]))
                                for n in notas if n["desde"]))


def _escribir_plan(tx: db.Transaccion, plan: Plan) -> None:
    for nueva in plan.crear:
        creada = tx.uno(
            "INSERT INTO alertas (clave, tipo, severidad, titulo, descripcion, fuente, "
            "  variable, fecha_inicio, fecha_fin, ocurrencias, evidencia) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb) RETURNING id",
            (nueva.clave, nueva.tipo, nueva.severidad, nueva.titulo, nueva.descripcion,
             nueva.fuente, nueva.variable, nueva.fecha_inicio, nueva.fecha_fin,
             nueva.ocurrencias, json.dumps(nueva.evidencia)))
        tx.query(_INSERTAR_EVENTO, (creada["id"], ciclo.EVENTO_CREADA, None, AUTOR_GENERADOR,
                                    json.dumps({"fechas": nueva.evidencia["fechas"]})))
    for suma in plan.sumar:
        tx.query("UPDATE alertas SET fecha_inicio = %s, fecha_fin = %s, ocurrencias = %s, "
                 "       evidencia = %s::jsonb, actualizada_en = now(), "
                 "       ultima_ocurrencia_en = now() WHERE id = %s",
                 (suma.fecha_inicio, suma.fecha_fin, suma.ocurrencias,
                  json.dumps(suma.evidencia), suma.alerta_id))
        tx.ejecutar_muchos(_INSERTAR_EVENTO, [
            (suma.alerta_id, ciclo.EVENTO_OCURRENCIA, None, AUTOR_GENERADOR,
             json.dumps({"fecha": f.isoformat()})) for f in suma.fechas_nuevas])
    tx.ejecutar_muchos(_INSERTAR_EVENTO, [
        (nota.alerta_id, ciclo.EVENTO_NOTA, nota.texto, AUTOR_GENERADOR,
         json.dumps({"sin_ocurrencias_desde": nota.sin_ocurrencias_desde.isoformat()}))
        for nota in plan.notas])
