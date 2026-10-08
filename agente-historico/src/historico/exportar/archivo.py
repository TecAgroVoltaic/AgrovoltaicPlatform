"""Punto de entrada: arma la exportacion (nombre, content-type, cuerpo en bytes)."""
from __future__ import annotations

from datetime import datetime

from historico import config
from historico.exportar.consulta import _filas
from historico.exportar.estimacion import estimar
from historico.exportar.matlab import _mat
from historico.exportar.modelo import MAX_FILAS_MAT, SLUG, UTC, Dataset, Exportacion, ExportacionDemasiadoGrande
from historico.exportar.resolucion import _ds, _formato, _paso, _seleccion
from historico.exportar.texto import _csv, _dat

_MAX_CAJAS_EN_NOMBRE = 2


def _slug(texto: str, maximo: int = 40) -> str:
    return SLUG.sub("-", texto).strip("-")[:maximo].lower()


def _nombre_archivo(ds: Dataset, ext: str, ed: str, eh: str, filtros: dict | None) -> str:
    partes = [ds.clave] if ds.fuente == "supabase" else [ds.fuente, ds.clave]
    cajas = [v for v in (filtros or {}).get("caja", []) if v]
    if cajas:
        partes.append(_slug("_".join(cajas)) if len(cajas) <= _MAX_CAJAS_EN_NOMBRE else f"{len(cajas)}-cajas")
    if ds.tcol:
        partes += [ed, eh]
    return "_".join(partes) + f".{ext}"


def _verificar_tope_mat(tabla: str, desde: str | None, hasta: str | None, fuente: str,
                        filtros: dict[str, list[str]] | None, paso: int) -> None:
    n = estimar(tabla, desde, hasta, fuente, filtros, paso)["filas"]
    if n > MAX_FILAS_MAT:
        raise ExportacionDemasiadoGrande(
            f"el rango tiene {n:,} filas y .mat admite hasta {MAX_FILAS_MAT:,} "
            f"(se arma completo en memoria): acorta el rango o usa csv/dat"
        )


def _meta_mat(ds: Dataset, fuente: str, tabla: str, ed: str, eh: str,
              filtros: dict[str, list[str]] | None, paso: int) -> dict:
    return {"fuente": fuente, "tabla": tabla, "relacion": ds.relacion or ds.origen,
            "desde": ed, "hasta": eh, "filtros": {k: list(v) for k, v in (filtros or {}).items() if v},
            "paso_seg": paso,
            "zona_horaria": config.TZ,
            "horas": "hora local de Costa Rica (UTC-6), sin sufijo de zona",
            "generado_en": datetime.now(UTC).isoformat()}


def exportar(tabla: str, formato: str = "csv", desde: str | None = None,
             hasta: str | None = None, columnas: list[str] | None = None,
             fuente: str = "supabase", filtros: dict[str, list[str]] | None = None,
             paso: int | None = None) -> Exportacion:
    """Arma la exportacion: valida, consulta por lotes y serializa al formato.

    Devuelve nombre de archivo, content-type y un iterador de bytes (CSV/DAT lo
    emiten a medida que leen; MAT produce un unico bloque tras juntar todo)."""
    ds = _ds(fuente, tabla)
    content_type, ext = _formato(formato)
    sel = _seleccion(ds, columnas)
    p = _paso(ds, paso)
    if ext == "mat":
        _verificar_tope_mat(tabla, desde, hasta, fuente, filtros, p)

    filas, ed, eh = _filas(ds, sel, desde, hasta, filtros, p)
    nombre = _nombre_archivo(ds, ext, ed, eh, filtros)
    if ext == "csv":
        cuerpo = _csv(sel, filas, ds.reloj)
    elif ext == "dat":
        cuerpo = _dat(sel, filas, ds.reloj)
    else:
        cuerpo = _mat(sel, filas, _meta_mat(ds, fuente, tabla, ed, eh, filtros, p), ds.reloj)
    return Exportacion(nombre=nombre, content_type=content_type, cuerpo=cuerpo)
