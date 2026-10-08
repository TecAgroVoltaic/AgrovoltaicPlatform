"""Catalogo para la UI: que se puede exportar por fuente, con columnas y cobertura."""
from __future__ import annotations

import re
from datetime import datetime

from historico import agrodash_api, config, db
from historico.exportar.datasets import DATASETS, FUENTES
from historico.exportar.modelo import FORMATOS, MAX_FILAS_MAT, PASOS_SEG, Dataset
from historico.exportar.reloj import _expr_local, _iso


def _motivo(exc: Exception) -> str:
    if isinstance(exc, agrodash_api.AgroDashNoDisponible):
        return re.sub(r"\s+", " ", str(exc))[:160]
    if isinstance(exc, RuntimeError):
        return "sin configurar: " + str(exc).split(":")[0]
    texto = re.sub(r"\s+", " ", str(exc)).strip()
    return f"inaccesible: {type(exc).__name__}: {texto[:140]}"


def _columnas_por_relacion(dss: list[Dataset]) -> dict[str, list[dict]]:
    cols = db.query(
        """
        SELECT table_name AS relacion, column_name AS nombre, data_type AS tipo
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ANY(%s)
        ORDER BY table_name, ordinal_position
        """,
        ([ds.relacion for ds in dss],),
    )
    por_rel: dict[str, list[dict]] = {}
    for c in cols:
        por_rel.setdefault(c["relacion"], []).append({"nombre": c["nombre"], "tipo": c["tipo"]})
    return por_rel


def _cobertura(dss: list[Dataset]) -> dict[str, dict]:
    """Primer/ultimo dato (reloj local) de cada dataset con tiempo, en una sola consulta."""
    partes, params = [], []
    for ds in dss:
        if not ds.tcol:
            continue
        expr, p = _expr_local(ds)
        partes.append(f"SELECT '{ds.clave}' AS clave, min({expr})::text AS mn, max({expr})::text AS mx FROM {ds.origen}")
        params += p + p     # la expresion aparece dos veces (min y max) -> sus params tambien
    if not partes:
        return {}
    return {r["clave"]: r for r in db.query(" UNION ALL ".join(partes), tuple(params))}


def _catalogo_supabase() -> list[dict]:
    dss = [ds for (f, _), ds in DATASETS.items() if f == "supabase"]
    por_rel = _columnas_por_relacion(dss)
    cobertura = _cobertura(dss)
    return [_entrada(ds, por_rel.get(ds.relacion, []), cobertura.get(ds.clave, {})) for ds in dss]


def _catalogo_agrodash() -> tuple[list[dict], list[dict]]:
    """Datasets de AgroDash + cajas/tipos (para los filtros de la UI), via API.
    La cobertura solo informa el ULTIMO dato: el primero es de 2011 (historico) y
    como limite inferior de un rango solo estorba."""
    dss = [ds for (f, _), ds in DATASETS.items() if f == "agrodash"]
    conteo: dict[tuple[str, str], int] = {}
    for s_ in agrodash_api.sensores():
        k = (s_["caja"], s_["sensor_tipo"])
        conteo[k] = conteo.get(k, 0) + 1
    cajas = [{"caja": c, "sensor_tipo": t, "sensores": n} for (c, t), n in sorted(conteo.items())]
    ultimo = agrodash_api.rango_disponible().get("last")
    cob = {"mn": None, "mx": _iso(datetime.fromisoformat(ultimo), "local") if ultimo else None}
    entradas = [_entrada(ds, [{"nombre": c.nombre, "tipo": c.tipo} for c in ds.columnas],
                         cob if ds.tcol else {}) for ds in dss]
    return entradas, cajas


def _entrada(ds: Dataset, columnas: list[dict], cob: dict) -> dict:
    return {
        "clave": ds.clave, "fuente": ds.fuente, "titulo": ds.titulo, "descripcion": ds.descripcion,
        "relacion": ds.relacion or ds.origen, "columna_tiempo": ds.talias,
        "columnas": columnas, "filtros": list(ds.filtros), "via": ds.via,
        "pasos": list(PASOS_SEG) if ds.paso else [],
        "desde": cob.get("mn"), "hasta": cob.get("mx"),
    }


def catalogo() -> dict:
    """Que se puede exportar, por fuente. Una fuente caida o sin configurar se
    reporta (`disponible: false` + motivo) sin tumbar a las demas."""
    fuentes = []
    for clave, meta in FUENTES.items():
        entrada = {"clave": clave, **meta, "disponible": True, "motivo": None, "datasets": []}
        try:
            if clave == "supabase":
                entrada["datasets"] = _catalogo_supabase()
            else:
                entrada["datasets"], entrada["cajas"] = _catalogo_agrodash()
        except Exception as exc:  # noqa: BLE001 — se reporta, no se propaga
            entrada["disponible"] = False
            entrada["motivo"] = _motivo(exc)
        fuentes.append(entrada)
    return {
        "fuentes": fuentes,
        "formatos": [{"clave": k, "extension": ext, "content_type": ct} for k, (ct, ext) in FORMATOS.items()],
        "max_filas_mat": MAX_FILAS_MAT,
        "pasos": list(PASOS_SEG),
        "zona_horaria": config.TZ,
        "nota_horas": "Todas las horas se exportan en hora local de Costa Rica (UTC-6), sin sufijo de zona.",
    }
