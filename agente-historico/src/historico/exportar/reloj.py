"""Reloj de la exportacion: parseo del rango en dias locales y conversion a hora local CR.

Cada dataset declara su convencion (`reloj`, `tcol_tz`; ver docstring del paquete) y
aca se traduce: limites del rango para el SQL o la API, y valores al exportarlos.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

from historico import config
from historico.exportar.modelo import TZ, UTC, Dataset


def _fecha(valor: str | None, nombre: str) -> tuple[datetime, bool]:
    """Parsea 'YYYY-MM-DD' o ISO datetime. Devuelve (datetime naive local, es_solo_fecha)."""
    if not valor:
        raise ValueError(f"falta '{nombre}' (YYYY-MM-DD)")
    v = str(valor).strip()
    try:
        if len(v) == 10:
            return datetime.combine(date.fromisoformat(v), datetime.min.time()), True
        dt = datetime.fromisoformat(v.replace("Z", "+00:00"))
        if dt.tzinfo is not None:
            dt = dt.astimezone(TZ).replace(tzinfo=None)
        return dt, False
    except ValueError as exc:
        raise ValueError(f"'{nombre}' invalida: {v!r} (esperaba YYYY-MM-DD)") from exc


def _rango_local(desde: str | None, hasta: str | None) -> tuple[datetime, datetime]:
    """(desde, hasta_exclusivo) naive locales; `hasta` como fecha es inclusivo."""
    d, _ = _fecha(desde, "desde")
    h, solo_fecha = _fecha(hasta, "hasta")
    h_excl = h + timedelta(days=1) if solo_fecha else h
    if h_excl <= d:
        raise ValueError(f"rango vacio: 'hasta' ({hasta}) debe ser posterior a 'desde' ({desde})")
    return d, h_excl


def _etiquetas(desde: str | None, hasta: str | None) -> tuple[str, str]:
    return _fecha(desde, "desde")[0].date().isoformat(), _fecha(hasta, "hasta")[0].date().isoformat()


def _rango_api(desde: str | None, hasta: str | None) -> tuple[datetime, datetime, str, str]:
    """Rango de dias locales como datetimes naive en hora local (lo que entiende la API)."""
    d, h_excl = _rango_local(desde, hasta)
    return (d, h_excl, *_etiquetas(desde, hasta))


def _limite_sql(dt_local: datetime, ds: Dataset) -> str:
    """Un limite del rango (hora local naive) en la forma que la columna compara bien."""
    if ds.reloj == "local":
        return dt_local.isoformat()                       # reloj local etiquetado +00
    aware = dt_local.replace(tzinfo=TZ)
    if ds.tcol_tz:
        return aware.isoformat()                          # timestamptz UTC real: con zona
    return aware.astimezone(UTC).replace(tzinfo=None).isoformat()  # naive en UTC


def rango(desde: str | None, hasta: str | None, ds: Dataset | None = None) -> tuple[str, str, str, str]:
    """(desde_sql, hasta_sql_exclusivo, etiqueta_desde, etiqueta_hasta).

    `hasta` es INCLUSIVO cuando viene como fecha (quien pide "del 1 al 31" espera el
    31 adentro): se suma un dia y se filtra con `<`. Con hora, es exclusivo tal cual.
    Los limites son dias LOCALES y se adaptan a la convencion de reloj del dataset."""
    d, h_excl = _rango_local(desde, hasta)
    ds = ds or Dataset("_", "supabase", "", "", "", None)
    return (_limite_sql(d, ds), _limite_sql(h_excl, ds), *_etiquetas(desde, hasta))


def _expr_local(ds: Dataset) -> tuple[str, list]:
    """Expresion SQL que devuelve la columna temporal en RELOJ LOCAL naive (para min/max)."""
    if ds.reloj == "local":
        # reloj local etiquetado +00: quitar la etiqueta para no mostrar "+00" en min/max
        return (f"({ds.tcol} AT TIME ZONE 'UTC')" if ds.tcol_tz else ds.tcol), []
    if ds.tcol_tz:
        return f"({ds.tcol} AT TIME ZONE %s)", [config.TZ]
    return f"(({ds.tcol} AT TIME ZONE 'UTC') AT TIME ZONE %s)", [config.TZ]


def _local(v, reloj: str):
    """Lleva un datetime al RELOJ LOCAL naive segun la convencion del dataset.

    reloj='utc'  : instante real (aware, o naive en UTC) -> America/Costa_Rica sin zona.
    reloj='local': el reloj ya es local (etiqueta +00 espuria) -> solo quitar la zona."""
    if not isinstance(v, datetime):
        return v
    if reloj == "utc":
        aware = v if v.tzinfo is not None else v.replace(tzinfo=UTC)
        return aware.astimezone(TZ).replace(tzinfo=None)
    return v.replace(tzinfo=None)


def _epoch(v, reloj: str = "local") -> float | None:
    """Segundos Unix REALES de un datetime/date (el reloj local se ancla a UTC-6)."""
    if v is None:
        return None
    loc = _local(v, reloj)
    if isinstance(loc, datetime):
        return loc.replace(tzinfo=TZ).timestamp()
    if isinstance(loc, date):
        return datetime.combine(loc, datetime.min.time(), tzinfo=TZ).timestamp()
    return None


def _iso(v, reloj: str = "local") -> str:
    """ISO en hora local de Costa Rica, sin sufijo de zona."""
    return _local(v, reloj).isoformat()
