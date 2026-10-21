"""Fallas del sistema como alertas: UNA abierta por causa, que suma ocurrencias.

La causa es `falla_sistema:<origen>:<tipo>` (p. ej. AgroDash sin responder). Si ya
hay una abierta, no se crea otra: se corre `fecha_fin`, se suma la ocurrencia del
dia y se guarda el ultimo detalle. `ocurrencias` cuenta DIAS, como en el resto de
las alertas; las veces totales van en `evidencia.veces`.

Usa el mismo candado consultivo que la evaluacion de alertas: una falla y una
evaluacion simultaneas no pueden duplicar una alerta.
"""
from __future__ import annotations

import json
from datetime import date

from historico import db
from historico.alertas import ciclo
from historico.alertas.definiciones import DEFINICIONES, FALLA_SISTEMA
from historico.alertas.store_sql import _CANDADO_EVALUACION, _INSERTAR_EVENTO, AUTOR_GENERADOR

MAX_DETALLES = 5
_TITULO = {"fuente_no_disponible": "AgroDash no responde",
           "base_no_disponible": "La base de datos no responde",
           "tiempo_agotado": "Una consulta tardó demasiado",
           "error_interno": "Error interno del asistente"}


def clave(falla: dict) -> str:
    return f"{FALLA_SISTEMA}:{falla['origen']}:{falla['tipo']}"


def _evidencia(previa: dict, falla: dict, hoy: date) -> dict:
    # `canal` (`flow`, `api`) solo llega de `POST /tool`; el lazo del chat no lo pone.
    canal = {"canal": falla["canal"]} if falla.get("canal") else {}
    detalles = [{"dia": hoy.isoformat(), "herramienta": falla["herramienta"],
                 "detalle": falla["detalle"], **canal}, *previa.get("detalles", [])][:MAX_DETALLES]
    return {"veces": int(previa.get("veces", 0)) + 1, "detalles": detalles,
            "fechas": sorted({*previa.get("fechas", []), hoy.isoformat()})}


def registrar(falla: dict, hoy: date) -> None:
    """Crea la alerta de la causa o le suma la ocurrencia. Lanza si la base falla."""
    k = clave(falla)
    with db.transaccion() as tx:
        tx.query("SELECT pg_advisory_xact_lock(%s)", (_CANDADO_EVALUACION,))
        filas = tx.query("SELECT id, fecha_fin, ocurrencias, evidencia FROM alertas "
                         " WHERE clave = %s AND estado = ANY(%s) FOR UPDATE",
                         (k, list(ciclo.ABIERTOS)))
        if filas:
            a = filas[0]
            dia_nuevo = date.fromisoformat(str(a["fecha_fin"])[:10]) < hoy
            tx.query("UPDATE alertas SET fecha_fin = GREATEST(fecha_fin, %s), ocurrencias = %s, "
                     "  evidencia = %s::jsonb, descripcion = %s, actualizada_en = now(), "
                     "  ultima_ocurrencia_en = now() WHERE id = %s",
                     (hoy, a["ocurrencias"] + (1 if dia_nuevo else 0),
                      json.dumps(_evidencia(a["evidencia"] or {}, falla, hoy)), falla["detalle"], a["id"]))
            if dia_nuevo:
                tx.query(_INSERTAR_EVENTO, (a["id"], ciclo.EVENTO_OCURRENCIA, None, AUTOR_GENERADOR,
                                            json.dumps({"fecha": hoy.isoformat()})))
            return
        creada = tx.uno(
            "INSERT INTO alertas (clave, tipo, severidad, titulo, descripcion, fuente, variable, "
            "  fecha_inicio, fecha_fin, ocurrencias, evidencia) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 1, %s::jsonb) RETURNING id",
            (k, FALLA_SISTEMA, DEFINICIONES[FALLA_SISTEMA].severidad,
             _TITULO.get(falla["tipo"], DEFINICIONES[FALLA_SISTEMA].titulo), falla["detalle"],
             falla["origen"], falla["herramienta"], hoy, hoy, json.dumps(_evidencia({}, falla, hoy))))
        tx.query(_INSERTAR_EVENTO, (creada["id"], ciclo.EVENTO_CREADA, None, AUTOR_GENERADOR,
                                    json.dumps({"fechas": [hoy.isoformat()]})))
