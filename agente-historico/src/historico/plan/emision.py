"""Emision en streaming: un archivo con los writers de `exportar`, o todos en un zip.

El zip se escribe sobre un flujo no buscable (zipfile usa descriptores de datos), y
cada trozo comprimido sale en cuanto existe: el zip empieza a bajar antes de que se
termine de leer el primer archivo.
"""
from __future__ import annotations

import zipfile
from datetime import datetime
from typing import Iterator
from zoneinfo import ZoneInfo

from historico import config
from historico.exportar.matlab import _mat
from historico.exportar.modelo import FORMATOS, UTC, Exportacion
from historico.exportar.texto import _csv, _dat
from historico.plan.leeme import leeme
from historico.plan.modelo import ArchivoPlan, Plan
from historico.plan.salida import filas, seleccion

NOMBRE_LEEME = "LEEME.txt"


def _meta(plan: Plan, a: ArchivoPlan) -> dict:
    return {"plan_version": 1, "desde": plan.desde.isoformat(), "hasta": plan.hasta.isoformat(),
            "paso_seg": plan.paso_s, "forma": a.forma, "fuentes": a.fuentes,
            "variables": [c.variable.id for c in a.columnas],
            "agregaciones": [c.agregacion for c in a.columnas],
            "zona_horaria": config.TZ,
            "horas": "hora local de Costa Rica (UTC-6), sin sufijo de zona; inicio del intervalo",
            "generado_en": datetime.now(UTC).isoformat()}


def cuerpo(plan: Plan, a: ArchivoPlan) -> Iterator[bytes]:
    sel = seleccion(a)
    it = filas(plan, a)
    if a.formato == "csv":
        return _csv(sel, it, "local")
    if a.formato == "dat":
        return _dat(sel, it, "local")
    return _mat(sel, it, _meta(plan, a), "local")


def archivo(plan: Plan, indice: int) -> Exportacion:
    a = plan.archivos[indice]
    return Exportacion(nombre=a.nombre_completo, content_type=FORMATOS[a.formato][0],
                       cuerpo=cuerpo(plan, a))


class _Tubo:
    """Flujo de solo escritura y no buscable: junta lo que escribe zipfile."""

    def __init__(self) -> None:
        self.trozos: list[bytes] = []
        self.pos = 0

    def write(self, b) -> int:
        self.trozos.append(bytes(b))
        self.pos += len(b)
        return len(b)

    def tell(self) -> int:
        return self.pos

    def flush(self) -> None:
        pass

    def vaciar(self) -> Iterator[bytes]:
        trozos, self.trozos = self.trozos, []
        yield from trozos


def _zip(plan: Plan) -> Iterator[bytes]:
    tubo = _Tubo()
    with zipfile.ZipFile(tubo, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        ahora = datetime.now(ZoneInfo(config.TZ)).timetuple()[:6]
        zf.writestr(zipfile.ZipInfo(NOMBRE_LEEME, date_time=ahora), leeme(plan),
                    compress_type=zipfile.ZIP_DEFLATED)
        yield from tubo.vaciar()
        for a in plan.archivos:
            info = zipfile.ZipInfo(a.nombre_completo, date_time=ahora)
            info.compress_type = zipfile.ZIP_DEFLATED
            with zf.open(info, "w", force_zip64=True) as destino:
                for trozo in cuerpo(plan, a):
                    destino.write(trozo)
                    yield from tubo.vaciar()
            yield from tubo.vaciar()
    yield from tubo.vaciar()


def zip_(plan: Plan, nombre: str = "datos") -> Exportacion:
    return Exportacion(nombre=f"{nombre}.zip", content_type="application/zip", cuerpo=_zip(plan))
