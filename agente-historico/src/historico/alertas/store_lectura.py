"""Lecturas del store de alertas, por el pool de SOLO LECTURA como el resto de la API.

Se usan a traves de `historico.alertas.store`, que las reexporta.
"""
from __future__ import annotations

from collections.abc import Sequence
from datetime import date

from historico import db
from historico.alertas import ciclo
from historico.alertas.modelo import AlertaInexistente
from historico.alertas.store_sql import _COLUMNAS_EVENTO, COLUMNAS
from historico.calidad.pruebas.contrato import Hallazgo


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
