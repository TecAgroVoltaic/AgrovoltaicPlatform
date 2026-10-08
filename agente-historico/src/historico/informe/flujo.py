"""Arma el informe de un periodo: consulta, compone, redacta y escribe.

Tres pasos que no se mezclan:

  1. `datos.recolectar`     la unica parte que toca la base.
  2. `composicion.componer` PURA: hojas, hechos y advertencias desde las filas.
  3. `redaccion.redactar`   el modelo, que solo ve los hechos y puede fallar sin
                            que el libro deje de salir.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from historico import config, errores
from historico.analitica import resumen, ventana as ventana_mod
from historico.analitica.ventana import Ventana
from historico.informe import datos, libro, metodo, redaccion
from historico.informe.composicion import componer
from historico.informe.tabla import Hecho

SIN_LECTURA_PEDIDA = "se pidió el informe sin lectura"

__all__ = ["SIN_LECTURA_PEDIDA", "Informe", "componer", "generar", "preparar",
           "ventana_inclusiva"]


@dataclass(frozen=True)
class Informe:
    cuerpo: bytes
    nombre: str
    meta: dict
    hechos: list[Hecho]
    advertencias: list[str]
    lectura: dict


def ventana_inclusiva(desde: str | None, hasta: str | None) -> tuple[Ventana, str, str]:
    """El rango como lo escribe una persona: `hasta` entra. Igual que Descargas."""
    if not desde or not hasta:
        raise errores.ParametroInvalido(
            "el informe necesita `desde` y `hasta` (aaaa-mm-dd), los dos incluidos")
    # Se parsean por la puerta de `ventana` para heredar su error con `codigo`.
    primero = ventana_mod.crear(desde, None).desde
    ultimo = ventana_mod.crear(hasta, None).desde
    if ultimo < primero:
        raise errores.ParametroInvalido(
            f"`hasta` ({ultimo}) no puede ser anterior a `desde` ({primero})")
    v = ventana_mod.crear(primero, ultimo + timedelta(days=1))
    return v, primero.isoformat(), ultimo.isoformat()


def _ahora() -> str:
    return datetime.now(ZoneInfo(config.TZ)).strftime("%Y-%m-%d %H:%M (hora de Costa Rica)")


def preparar(desde: str | None, hasta: str | None) -> tuple[dict, dict]:
    """(meta, composicion) sin redactar ni escribir. Lo usa tambien la tool."""
    v, etiqueta_desde, etiqueta_hasta = ventana_inclusiva(desde, hasta)
    insumos = datos.recolectar(v)
    ultimo_dato = resumen.ultimo_global()
    meta = {"desde": etiqueta_desde, "hasta": etiqueta_hasta, "generado": _ahora(),
            "ultimo_dato": ultimo_dato}
    return meta, componer(insumos, etiqueta_desde, etiqueta_hasta, ultimo_dato)


def generar(desde: str | None, hasta: str | None, foco: str | None = None,
            con_lectura: bool = True, client=None) -> Informe:
    """El informe completo del periodo [desde, hasta], los dos dias incluidos."""
    meta, comp = preparar(desde, hasta)
    meta["foco"] = (foco or "").strip() or None
    if con_lectura:
        lectura = redaccion.redactar(comp["hechos"], comp["advertencias"],
                                     meta["foco"], client=client)
    else:
        lectura = {"parrafos": [], "motivo": SIN_LECTURA_PEDIDA, "intentos": 0,
                   "modelo": None, "usage": {}, "costo": {}}
    cuerpo = libro.escribir(meta, lectura, comp["advertencias"], comp["hechos"],
                            comp["hojas"], metodo.parametros(), metodo.traza(meta, lectura))
    nombre = f"informe-agrovoltaic-sc_{meta['desde']}_{meta['hasta']}.xlsx"
    return Informe(cuerpo, nombre, meta, comp["hechos"], comp["advertencias"], lectura)
