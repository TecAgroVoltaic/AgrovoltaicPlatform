"""El unico modulo que lee y escribe `alertas`, `alertas_eventos` y `alertas_evaluaciones`.

Toda escritura de varios pasos va por `db.transaccion()`: una alerta sin su
evento `creada`, o una transicion sin su evento, seria una linea de tiempo que
miente. Las lecturas van por el pool de solo lectura, como el resto de la API.

Concurrencia, que es donde un store de estados se rompe en silencio:
  * las transiciones bloquean la fila (`FOR UPDATE`) antes de validar, asi que
    dos personas no pueden resolver y descartar la misma alerta a la vez;
  * el generador toma un candado consultivo de transaccion: dos evaluaciones
    simultaneas se ordenan en vez de crear la misma alerta dos veces. El indice
    unico de abiertas por clave queda de ultima red.

Pasa de 150 lineas y queda junto a proposito: es UNA responsabilidad (la
persistencia del agregado alerta + eventos), y partirlo separaria la lectura del
estado de la escritura del plan, que solo son correctas dentro de la misma
transaccion.
"""
from __future__ import annotations

import json
from collections.abc import Callable, Sequence
from datetime import date

from historico import db
from historico.alertas import ciclo
from historico.alertas.modelo import (
    AlertaAbierta, AlertaAbiertaExistente, AlertaInexistente, EstadoActual, Plan,
)
from historico.calidad.pruebas.contrato import Hallazgo

AUTOR_GENERADOR = "generador"
# Cualquier entero fijo: identifica "la evaluacion de alertas" entre los candados
# consultivos de la base. Solo tiene que no chocar con otro uso, y no hay otro.
_CANDADO_EVALUACION = 4_004_001

COLUMNAS = ("id, clave, tipo, severidad, estado, titulo, descripcion, fuente, variable, "
            "fecha_inicio, fecha_fin, ocurrencias, evidencia, proxima_revision, "
            "creada_en, actualizada_en, ultima_ocurrencia_en")
_COLUMNAS_EVENTO = "id, tipo, nota, autor, datos, creado_en"
_INSERTAR_EVENTO = ("INSERT INTO alertas_eventos (alerta_id, tipo, nota, autor, datos) "
                    "VALUES (%s, %s, %s, %s, %s::jsonb)")


# ── Lectura ──────────────────────────────────────────────────────────────────
def hallazgos(desde: date, hasta: date, tipos: Sequence[str]) -> list[Hallazgo]:
    filas = db.query(
        "SELECT fecha, fuente, variable, tipo, severidad, n_afectadas, detalle "
        "  FROM hallazgos_calidad WHERE fecha >= %s AND fecha < %s AND tipo = ANY(%s)",
        (desde, hasta, list(tipos)))
    return [Hallazgo(fecha=date.fromisoformat(f["fecha"]), fuente=f["fuente"],
                     variable=f["variable"], tipo=f["tipo"], severidad=f["severidad"],
                     n_afectadas=f["n_afectadas"], detalle=f["detalle"] or {})
            for f in filas]


def extension_de_hallazgos() -> tuple[date, date] | None:
    """(primer, ultimo) dia con hallazgos: hasta donde llego el barrido. None si vacio."""
    fila = db.uno("SELECT min(fecha) AS primero, max(fecha) AS ultimo FROM hallazgos_calidad")
    if not fila.get("ultimo"):
        return None
    return date.fromisoformat(fila["primero"]), date.fromisoformat(fila["ultimo"])


def listar(donde: str, params: Sequence, orden: str, limite: int,
           offset: int) -> tuple[int, list[dict]]:
    """Conteo y pagina con el MISMO filtro, en paralelo (ver `db.en_paralelo`)."""
    conteo, filas = db.en_paralelo(
        lambda: db.uno(f"SELECT count(*) AS n FROM alertas WHERE {donde}", tuple(params)),
        lambda: db.query(f"SELECT {COLUMNAS} FROM alertas WHERE {donde} "
                         f"ORDER BY {orden} LIMIT %s OFFSET %s",
                         (*params, limite, offset)))
    return conteo.get("n", 0), filas


def resumen() -> dict:
    fila = db.uno(
        "SELECT (SELECT coalesce(json_object_agg(estado, n), '{}'::json) FROM "
        "          (SELECT estado, count(*) AS n FROM alertas GROUP BY estado) t) AS por_estado,"
        "       (SELECT count(*) FROM alertas WHERE estado = ANY(%s) AND severidad = 'grave')"
        "          AS abiertas_graves,"
        "       (SELECT max(evaluada_en) FROM alertas_evaluaciones) AS ultima_evaluacion",
        (list(ciclo.ABIERTOS),))
    contados = fila.get("por_estado") or {}
    por_estado = {estado: int(contados.get(estado, 0)) for estado in ciclo.ESTADOS}
    return {"por_estado": por_estado,
            "abiertas_graves": int(fila.get("abiertas_graves") or 0),
            "abiertas_total": sum(por_estado[e] for e in ciclo.ABIERTOS),
            "ultima_evaluacion": fila.get("ultima_evaluacion")}


def obtener(alerta_id: int) -> tuple[dict, list[dict]]:
    alerta, eventos = db.en_paralelo(
        lambda: db.uno(f"SELECT {COLUMNAS} FROM alertas WHERE id = %s", (alerta_id,)),
        lambda: db.query(f"SELECT {_COLUMNAS_EVENTO} FROM alertas_eventos "
                         f"WHERE alerta_id = %s ORDER BY creado_en, id", (alerta_id,)))
    if not alerta:
        raise AlertaInexistente(alerta_id)
    return alerta, eventos


# ── Escritura ────────────────────────────────────────────────────────────────
def transicionar(alerta_id: int, accion: ciclo.Accion, nota: str | None, autor: str,
                 proxima_revision: date | None = None) -> dict:
    """Aplica la accion y deja su evento, o no hace nada y levanta el error.

    `proxima_revision`: el seguimiento la fija (o la borra si no viene), cerrar la
    borra porque ya no hay nada que revisar, y el resto no la toca.
    """
    with db.transaccion() as tx:
        actual = tx.uno("SELECT id, clave, estado FROM alertas WHERE id = %s FOR UPDATE",
                        (alerta_id,))
        if not actual:
            raise AlertaInexistente(alerta_id)
        paso = ciclo.transicion(actual["estado"], accion)
        if paso.destino in ciclo.ABIERTOS and actual["estado"] in ciclo.CERRADOS:
            otra = tx.uno("SELECT id FROM alertas WHERE clave = %s AND estado = ANY(%s) "
                          "AND id <> %s", (actual["clave"], list(ciclo.ABIERTOS), alerta_id))
            if otra:
                raise AlertaAbiertaExistente(alerta_id, otra["id"])
        fijar_revision = (accion is ciclo.Accion.SEGUIMIENTO
                          or paso.destino in ciclo.CERRADOS)
        alerta = tx.uno(
            f"UPDATE alertas SET estado = %s, actualizada_en = now(), "
            f"       proxima_revision = CASE WHEN %s THEN %s::date ELSE proxima_revision END "
            f" WHERE id = %s RETURNING {COLUMNAS}",
            (paso.destino, fijar_revision,
             proxima_revision if accion is ciclo.Accion.SEGUIMIENTO else None, alerta_id))
        datos = {"de": actual["estado"], "a": paso.destino}
        if proxima_revision:
            datos["proxima_revision"] = proxima_revision.isoformat()
        tx.query(_INSERTAR_EVENTO, (alerta_id, paso.evento, nota, autor, json.dumps(datos)))
    return alerta


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
