"""Exportacion de datos por rango de fechas: CSV, DAT (texto tabulado) y MAT (MATLAB).

Responsabilidad unica: convertir un rango [desde, hasta] de un DATASET permitido en
un archivo descargable. No es una tool del LLM: sirve al humano que quiere llevarse
los datos a MATLAB, Python, Excel u Origin.

Dos FUENTES (dos "vias" distintas):
- `supabase` (via SQL, pool de `db.py`): la Supabase PV de San Carlos (historico
  estandarizado por el ETL de CSV + capas de analisis + el store ambiental que copia
  el agente de pronostico).
- `agrodash` (via API HTTP, `agrodash_api.py`): la plataforma de sensores de la region
  (cajas -> sensores -> lecturas), leida en vivo por su API publica. Filtrable por caja
  y tipo de sensor, con `paso` (ancho del bucket; 0 = crudo). Si la API no responde,
  la fuente se reporta como no disponible y el resto sigue funcionando.

Seguridad: misma regla que `datos.py` — el dataset, las columnas y los filtros se
resuelven contra un catalogo (allowlist estatica o `information_schema`) ANTES de
interpolarse en el SQL; los valores (rango, cajas, tipos) van parametrizados (%s);
todo corre en sesiones de SOLO LECTURA.

Memoria: CSV y DAT se emiten por lotes (cursor de servidor -> generador de bytes),
asi una exportacion de cientos de miles de filas no carga todo en RAM. MAT exige
el arreglo completo en memoria (scipy), por eso tiene un tope de filas explicito.

Convenciones de cada formato (documentadas para quien consume el archivo):
- csv: coma, UTF-8, encabezado, nulo = celda vacia, booleano = true/false.
- dat: tabulador, encabezado en la 1.ª linea, nulo = NaN, booleano = 1/0, y por
  cada columna temporal se agrega `<col>_unix` (segundos Unix reales). Pensado
  para `readtable`/`loadtxt`.
- mat: una variable MATLAB por columna (vector columna Nx1; numerico=double con
  NaN, texto=cell de char) + `<col>_unix` y `<col>_datenum` por columna temporal
  + struct `meta` (fuente, dataset, rango, filas, zona horaria, generado_en).

Reloj (verificado contra las bases el 2026-09-11): TODAS las horas se exportan en
hora local de Costa Rica (UTC-6) SIN sufijo de zona, y el rango [desde, hasta] se
interpreta en dias locales. Las bases mezclan tres convenciones y cada dataset
declara la suya (`reloj`, `tcol_tz`):
- Tablas PV de Supabase: `timestamptz` cuyo RELOJ ya es local pero quedo etiquetado
  +00 (el pico de potencia cae a las 11-12 "UTC") -> reloj='local': se exporta tal
  cual y el rango se filtra con limites naive (la sesion esta en UTC).
- Store ambiental de Supabase (`lecturas_ambientales_sc.ts`): `timestamptz` UTC REAL
  (pico de irradiancia a las 17 UTC = 11 local) -> reloj='utc', tcol_tz=True: se
  convierte a local y el rango lleva zona (-06:00).
- AgroDash (API, `bucket`): texto ISO NAIVE en HORA LOCAL CR (la API convierte; la DB
  detras guarda UTC, y de ahi salio el store) -> reloj='local', tcol_tz=False: se
  exporta tal cual y el rango se pide a la API en hora local naive (rechaza la "Z").
  Verificado cruzando valores con el store: coinciden uno a uno en local.
"""
from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Iterable, Iterator
from zoneinfo import ZoneInfo

from analizador import agrodash_api, config, datos, db

# ── Modelo ────────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class Columna:
    nombre: str      # alias en el archivo
    expr: str        # expresion SQL (igual al nombre en las tablas planas)
    tipo: str        # data_type de Postgres (decide como se serializa)


@dataclass(frozen=True)
class Dataset:
    clave: str
    fuente: str
    titulo: str
    descripcion: str
    origen: str                       # clausula FROM (tabla o joins), de la allowlist
    tcol: str | None                  # expresion SQL de la columna temporal (None = sin tiempo)
    talias: str | None = None         # alias de la columna temporal en el archivo
    reloj: str = "local"              # 'local' | 'utc' (ver docstring del modulo)
    tcol_tz: bool = True              # True si la columna es timestamptz
    relacion: str | None = None       # tabla para leer columnas de information_schema
    columnas: tuple[Columna, ...] = ()  # columnas ESTATICAS (joins o API)
    filtros: dict[str, str] = field(default_factory=dict)  # param -> expresion SQL (o nombre, via API)
    via: str = "sql"                  # 'sql' (db.py) | 'api' (agrodash_api.py)
    paso: bool = False                # admite `paso` (ancho de bucket) — solo via API


@dataclass
class Exportacion:
    nombre: str
    content_type: str
    cuerpo: Iterator[bytes]


class ExportacionDemasiadoGrande(ValueError):
    """El rango pedido excede lo que el formato puede armar en memoria (MAT)."""


# ── Catalogo: fuentes y datasets (la allowlist) ───────────────────────────────
FUENTES: dict[str, dict] = {
    "supabase": {
        "titulo": "Supabase PV · San Carlos",
        "descripcion": "Histórico fotovoltaico estandarizado (inversor, piranómetros, calibración, "
                       "Performance Ratio) y el store ambiental copiado desde AgroDash.",
    },
    "agrodash": {
        "titulo": "AgroDash · Cartago + San Carlos",
        "descripcion": "Plataforma de sensores de suelo y ambiente de la región (cajas → sensores → "
                       "lecturas), leída en vivo por su API. Filtrable por caja y tipo de sensor.",
    },
}

_TITULO_SUPABASE: dict[str, str] = {
    "electrico_crudo":     "Eléctrico crudo",
    "electrico_corregido": "Eléctrico corregido",
    "radiacion_15s_cruda": "Radiación 15 s cruda",
    "radiacion_corregida": "Radiación corregida",
    "radiacion_calibrada": "Radiación calibrada",
    "radiacion_clearsky":  "Cielo despejado (clear-sky)",
    "radiacion_poa":       "Radiación en plano (POA)",
    "performance":         "Performance Ratio",
    "diccionario":         "Diccionario de variables",
    "ambiental_crudo":     "Ambiental (store SC)",
}
_DESCRIPCION_SUPABASE: dict[str, str] = {
    "electrico_crudo":     "Inversor (PV1/PV2, AC, temperaturas) a 5 min, tal cual llegó del CSV",
    "electrico_corregido": "Inversor con columnas corregidas (temp 85 → nulo, rangos válidos)",
    "radiacion_15s_cruda": "Piranómetros a 15 s, valores crudos del sensor",
    "radiacion_corregida": "Piranómetros con offset nocturno corregido",
    "radiacion_calibrada": "Piranómetros calibrados a W/m² (clear-sky) + kt*",
    "radiacion_clearsky":  "Irradiancia de cielo despejado modelada (pvlib) para el sitio",
    "radiacion_poa":       "Irradiancia en el plano de cada arreglo (POA, con bifacialidad)",
    "performance":         "Performance Ratio por arreglo y energía integrada",
    "diccionario":         "Diccionario de variables (sin columna temporal: se exporta completo)",
    "ambiental_crudo":     "Lecturas de San Carlos copiadas desde AgroDash (irradiancia, humedad), formato largo",
}
# Relaciones de Supabase cuyo reloj es UTC real (el resto: reloj local etiquetado +00).
_RELOJ_UTC_SUPABASE: frozenset[str] = frozenset({"ambiental_crudo"})

_RELACIONES_SUPABASE: dict[str, tuple[str, str | None]] = {
    **datos.RELACIONES,
    "ambiental_crudo": ("lecturas_ambientales_sc", "ts"),
}

_TS = "timestamp without time zone"

DATASETS: dict[tuple[str, str], Dataset] = {}
for _clave, (_rel, _tcol) in _RELACIONES_SUPABASE.items():
    DATASETS[("supabase", _clave)] = Dataset(
        clave=_clave, fuente="supabase",
        titulo=_TITULO_SUPABASE.get(_clave, _clave), descripcion=_DESCRIPCION_SUPABASE.get(_clave, ""),
        origen=_rel, tcol=_tcol, talias=_tcol,
        reloj="utc" if _clave in _RELOJ_UTC_SUPABASE else "local", tcol_tz=True,
        relacion=_rel,
    )
_COLS_SENSOR = (
    Columna("caja", "caja", "text"),
    Columna("sensor_numero", "sensor_numero", "integer"),
    Columna("sensor_tipo", "sensor_tipo", "text"),
    Columna("sensor_id", "sensor_id", "text"),
)
DATASETS[("agrodash", "lecturas")] = Dataset(
    clave="lecturas", fuente="agrodash", via="api", paso=True,
    titulo="Lecturas de sensores",
    descripcion="Cada lectura con su caja y tipo de sensor (formato largo). Con resolución 'crudo' cada fila "
                "es una lectura; con un paso mayor, el promedio del intervalo (más n, mínimo, máximo, desvío).",
    origen="api:/readings", tcol="ts", talias="ts", reloj="local", tcol_tz=False,
    columnas=(Columna("ts", "ts", _TS), *_COLS_SENSOR,
              Columna("valor", "valor", "double precision"), Columna("n", "n", "integer"),
              Columna("minimo", "minimo", "double precision"), Columna("maximo", "maximo", "double precision"),
              Columna("desvio", "desvio", "double precision")),
    filtros={"caja": "caja", "sensor_tipo": "sensor_tipo"},
)
DATASETS[("agrodash", "sensores")] = Dataset(
    clave="sensores", fuente="agrodash", via="api",
    titulo="Catálogo de cajas y sensores",
    descripcion="Qué sensores hay en cada caja, con su id (sin columna temporal: se exporta completo).",
    origen="api:/boxes", tcol=None, columnas=_COLS_SENSOR,
    filtros={"caja": "caja", "sensor_tipo": "sensor_tipo"},
)

FORMATOS: dict[str, tuple[str, str]] = {
    # formato -> (content-type, extension)
    "csv": ("text/csv; charset=utf-8", "csv"),
    "dat": ("text/plain; charset=utf-8", "dat"),
    "mat": ("application/x-matlab-data", "mat"),
}

MAX_FILAS_MAT = 500_000     # scipy arma todo en RAM: ~8 bytes × columnas × filas
PASOS_SEG = agrodash_api.PASOS_SEG   # resoluciones admitidas para la via API (0 = crudo)
LOTE = 5_000                # filas por viaje del cursor de servidor
TZ = ZoneInfo(config.TZ)
UTC = timezone.utc
_TIPOS_TIEMPO = ("timestamp", "date")
_TIPOS_NUM = ("double", "numeric", "real", "integer", "bigint", "smallint")
_IDENT_MATLAB = re.compile(r"[^A-Za-z0-9_]")
_SLUG = re.compile(r"[^A-Za-z0-9]+")


# ── Resolucion (el borde de seguridad) ────────────────────────────────────────
def _ds(fuente: str, tabla: str) -> Dataset:
    if fuente not in FUENTES:
        raise ValueError(f"fuente desconocida: {fuente!r} (validas: {', '.join(FUENTES)})")
    ds = DATASETS.get((fuente, tabla))
    if ds is None:
        validas = ", ".join(k for f, k in DATASETS if f == fuente)
        raise ValueError(f"relacion desconocida: {tabla!r} en la fuente {fuente!r} (validas: {validas})")
    return ds


def _formato(formato: str) -> tuple[str, str]:
    par = FORMATOS.get((formato or "").lower())
    if par is None:
        raise ValueError(f"formato invalido: {formato!r} (validos: {', '.join(FORMATOS)})")
    return par


def _columnas(ds: Dataset) -> list[Columna]:
    """Columnas del dataset: estaticas (joins) o leidas del catalogo real (tablas planas)."""
    if ds.columnas:
        return list(ds.columnas)
    filas = db.query(
        """
        SELECT column_name AS nombre, data_type AS tipo
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = %s
        ORDER BY ordinal_position
        """,
        (ds.relacion,), ds.fuente,
    )
    if not filas:
        raise ValueError(f"la relacion {ds.relacion!r} no existe en la base o no tiene columnas")
    return [Columna(f["nombre"], f["nombre"], f["tipo"]) for f in filas]


def _seleccion(ds: Dataset, columnas: list[str] | None) -> list[Columna]:
    """Columnas a exportar, validadas contra el catalogo. Sin `columnas` -> todas.
    Con `columnas` -> ese subconjunto, en ese orden, con la temporal siempre primero
    (sin ella el archivo no se ubica en el tiempo). Un nombre desconocido corta."""
    reales = _columnas(ds)
    por_nombre = {c.nombre: c for c in reales}
    if not columnas:
        return reales
    pedidas = [c.strip() for c in columnas if c and c.strip()]
    desconocidas = [c for c in pedidas if c not in por_nombre]
    if desconocidas:
        raise ValueError(
            f"columnas desconocidas: {', '.join(desconocidas)} (validas: {', '.join(por_nombre)})"
        )
    if ds.talias and ds.talias not in pedidas:
        pedidas.insert(0, ds.talias)
    vistas: set[str] = set()
    return [por_nombre[c] for c in pedidas if not (c in vistas or vistas.add(c))]


def _filtros(ds: Dataset, filtros: dict[str, list[str]] | None) -> tuple[list[str], list]:
    """Clausulas WHERE extra (`expr = ANY(%s)`) para los filtros que el dataset declara."""
    clausulas: list[str] = []
    params: list = []
    for nombre, valores in (filtros or {}).items():
        vals = [v for v in (valores or []) if v]
        if not vals:
            continue
        expr = ds.filtros.get(nombre)
        if expr is None:
            raise ValueError(
                f"filtro no admitido para {ds.clave!r}: {nombre!r} "
                f"(validos: {', '.join(ds.filtros) or 'ninguno'})"
            )
        clausulas.append(f"{expr} = ANY(%s)")
        params.append(vals)
    return clausulas, params


def _paso(ds: Dataset, paso: int | None) -> int:
    """Ancho del bucket (seg) para la via API; 0 = crudo. Solo si el dataset lo admite."""
    p = int(paso or 0)
    if p and not ds.paso:
        raise ValueError(f"{ds.clave!r} no admite 'paso'")
    if p not in PASOS_SEG:
        raise ValueError(f"paso invalido: {p} (validos: {', '.join(map(str, PASOS_SEG))})")
    return p


def _rango_api(desde: str | None, hasta: str | None) -> tuple[datetime, datetime, str, str]:
    """Rango de dias locales como datetimes naive en hora local (lo que entiende la API)."""
    d, _ = _fecha(desde, "desde")
    h, solo_fecha = _fecha(hasta, "hasta")
    h_excl = h + timedelta(days=1) if solo_fecha else h
    if h_excl <= d:
        raise ValueError(f"rango vacio: 'hasta' ({hasta}) debe ser posterior a 'desde' ({desde})")
    return d, h_excl, d.date().isoformat(), h.date().isoformat()


def _filas(ds: Dataset, sel: list[Columna], desde: str | None, hasta: str | None,
           filtros: dict[str, list[str]] | None, paso: int, limite: int | None = None
           ) -> tuple[Iterator[tuple], str, str]:
    """Iterador de filas crudas (tuplas en el orden de `sel`) + etiquetas de rango,
    por la via del dataset: SQL (cursor de servidor) o API (buckets por sensor)."""
    nombres = [c.nombre for c in sel]
    if ds.via == "api":
        _filtros(ds, filtros)                      # valida nombres de filtro
        if not ds.tcol:
            return agrodash_api.filas_sensores(nombres, filtros), "completo", "completo"
        d, h, ed, eh = _rango_api(desde, hasta)
        return agrodash_api.filas(nombres, d, h, filtros, paso, limite), ed, eh
    sql, params, ed, eh = _consulta(ds, sel, desde, hasta, filtros, limite)
    it = db.iterar(sql, params, LOTE, ds.fuente)
    next(it)  # la primera entrega son los nombres de columna (ya los tenemos de `sel`)
    return it, ed, eh


# ── Rango de fechas ───────────────────────────────────────────────────────────
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
    d, _ = _fecha(desde, "desde")
    h, solo_fecha = _fecha(hasta, "hasta")
    h_excl = h + timedelta(days=1) if solo_fecha else h
    if h_excl <= d:
        raise ValueError(f"rango vacio: 'hasta' ({hasta}) debe ser posterior a 'desde' ({desde})")
    ds = ds or Dataset("_", "supabase", "", "", "", None)
    return _limite_sql(d, ds), _limite_sql(h_excl, ds), d.date().isoformat(), h.date().isoformat()


def _expr_local(ds: Dataset) -> tuple[str, list]:
    """Expresion SQL que devuelve la columna temporal en RELOJ LOCAL naive (para min/max)."""
    if ds.reloj == "local":
        # reloj local etiquetado +00: quitar la etiqueta para no mostrar "+00" en min/max
        return (f"({ds.tcol} AT TIME ZONE 'UTC')" if ds.tcol_tz else ds.tcol), []
    if ds.tcol_tz:
        return f"({ds.tcol} AT TIME ZONE %s)", [config.TZ]
    return f"(({ds.tcol} AT TIME ZONE 'UTC') AT TIME ZONE %s)", [config.TZ]


# ── Consulta ──────────────────────────────────────────────────────────────────
def _lista_select(sel: list[Columna]) -> str:
    return ", ".join(c.expr if c.expr == c.nombre else f"{c.expr} AS {c.nombre}" for c in sel)


def _consulta(ds: Dataset, sel: list[Columna], desde: str | None, hasta: str | None,
              filtros: dict[str, list[str]] | None, limite: int | None = None
              ) -> tuple[str, tuple, str, str]:
    """SQL + params + etiquetas de rango. Nombres/expresiones ya validados (catalogo)."""
    clausulas, params = _filtros(ds, filtros)
    ed = eh = "completo"
    if ds.tcol:
        d, h, ed, eh = rango(desde, hasta, ds)
        clausulas = [f"{ds.tcol} >= %s", f"{ds.tcol} < %s"] + clausulas
        params = [d, h] + params
    sql = f"SELECT {_lista_select(sel)} FROM {ds.origen}"
    if clausulas:
        sql += " WHERE " + " AND ".join(clausulas)
    if ds.tcol:
        sql += f" ORDER BY {ds.tcol}"
    if limite:
        sql += " LIMIT %s"
        params.append(int(limite))
    return sql, tuple(params), ed, eh


# ── Catalogo y estimacion (para la UI) ────────────────────────────────────────
def _motivo(exc: Exception) -> str:
    if isinstance(exc, agrodash_api.AgroDashNoDisponible):
        return re.sub(r"\s+", " ", str(exc))[:160]
    if isinstance(exc, RuntimeError):
        return "sin configurar: " + str(exc).split(":")[0]
    texto = re.sub(r"\s+", " ", str(exc)).strip()
    return f"inaccesible: {type(exc).__name__}: {texto[:140]}"


def _catalogo_supabase() -> list[dict]:
    dss = [ds for (f, _), ds in DATASETS.items() if f == "supabase"]
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

    partes, params = [], []
    for ds in dss:
        if not ds.tcol:
            continue
        expr, p = _expr_local(ds)
        partes.append(f"SELECT '{ds.clave}' AS clave, min({expr})::text AS mn, max({expr})::text AS mx FROM {ds.origen}")
        params += p + p     # la expresion aparece dos veces (min y max) -> sus params tambien
    cobertura = {r["clave"]: r for r in db.query(" UNION ALL ".join(partes), tuple(params))} if partes else {}
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


def estimar(tabla: str, desde: str | None, hasta: str | None,
            fuente: str = "supabase", filtros: dict[str, list[str]] | None = None,
            paso: int | None = None) -> dict:
    """Cuantas filas caeran en el rango (y primer/ultimo dato), antes de descargar.
    Via API: con <= MAX_SENSORES_CONTEO sensores el conteo es EXACTO (una llamada gruesa por
    sensor suma `n`); en crudo `cota: false`, con paso es `min(lecturas, intervalos)` por sensor
    (`cota: true`). Con mas sensores, heuristica sensores × intervalos (`cota: true`)."""
    ds = _ds(fuente, tabla)
    clausulas, params = _filtros(ds, filtros)
    base = {"fuente": fuente, "tabla": tabla, "relacion": ds.relacion or ds.origen,
            "max_filas_mat": MAX_FILAS_MAT, "cota": False}
    if ds.via == "api":
        n_sens = len(agrodash_api.sensores(filtros))
        if not ds.tcol:
            return {**base, "filas": n_sens, "primero": None, "ultimo": None, "desde": None, "hasta": None}
        p = _paso(ds, paso)
        d, h, ed, eh = _rango_api(desde, hasta)
        sens = agrodash_api.sensores(filtros)
        if n_sens <= agrodash_api.MAX_SENSORES_CONTEO:
            # Conteo EXACTO: una llamada gruesa por sensor (en paralelo) suma las lecturas.
            ns = agrodash_api.conteos(sens, d, h)
            if not p:
                return {**base, "filas": sum(ns), "cota": False, "sensores": n_sens,
                        "primero": None, "ultimo": None, "desde": ed, "hasta": eh}
            intervalos = max(1, int((h - d).total_seconds() // p))
            return {**base, "filas": sum(min(n_, intervalos) for n_ in ns), "cota": True,
                    "sensores": n_sens, "primero": None, "ultimo": None, "desde": ed, "hasta": eh}
        # Muchos sensores: heuristica (crudo ~1 lectura/min por sensor).
        intervalos = max(1, int((h - d).total_seconds() // (p or 60)))
        return {**base, "filas": n_sens * intervalos, "cota": True, "sensores": n_sens,
                "primero": None, "ultimo": None, "desde": ed, "hasta": eh}
    if not ds.tcol:
        where = (" WHERE " + " AND ".join(clausulas)) if clausulas else ""
        r = db.uno(f"SELECT count(*) AS n FROM {ds.origen}{where}", tuple(params), fuente)
        return {**base, "filas": r.get("n", 0), "primero": None, "ultimo": None,
                "desde": None, "hasta": None}
    d, h, ed, eh = rango(desde, hasta, ds)
    expr, p_expr = _expr_local(ds)
    where = " AND ".join([f"{ds.tcol} >= %s", f"{ds.tcol} < %s"] + clausulas)
    r = db.uno(
        f"SELECT count(*) AS n, min({expr})::text AS mn, max({expr})::text AS mx "
        f"FROM {ds.origen} WHERE {where}",
        tuple(p_expr + p_expr + [d, h] + params), fuente,
    )
    return {**base, "filas": r.get("n", 0), "primero": r.get("mn"), "ultimo": r.get("mx"),
            "desde": ed, "hasta": eh}


def previa(tabla: str, desde: str | None, hasta: str | None, columnas: list[str] | None = None,
           fuente: str = "supabase", filtros: dict[str, list[str]] | None = None, n: int = 8,
           paso: int | None = None) -> dict:
    """Primeras `n` filas del rango, ya serializadas como en el CSV (para mostrar antes de bajar)."""
    ds = _ds(fuente, tabla)
    sel = _seleccion(ds, columnas)
    lim = max(1, min(int(n), 50))
    it, _, _ = _filas(ds, sel, desde, hasta, filtros, _paso(ds, paso), limite=lim)
    filas: list[list[str]] = []
    for fila in it:
        filas.append([_celda_csv(v, ds.reloj) for v in fila])
        if len(filas) >= lim:
            break
    return {"fuente": fuente, "tabla": tabla, "columnas": [c.nombre for c in sel], "filas": filas}


# ── Reloj ─────────────────────────────────────────────────────────────────────
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


# ── Serializadores ────────────────────────────────────────────────────────────
def _es_tiempo(tipo: str) -> bool:
    return any(t in tipo for t in _TIPOS_TIEMPO)


def _es_numero(tipo: str) -> bool:
    return any(t in tipo for t in _TIPOS_NUM)


def _celda_csv(v, reloj: str) -> str:
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (datetime, date)):
        return _iso(v, reloj)
    if isinstance(v, Decimal):
        return str(float(v))
    return str(v)


def _celda_dat(v, reloj: str) -> str:
    if v is None:
        return "NaN"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (datetime, date)):
        return _iso(v, reloj)
    if isinstance(v, Decimal):
        return str(float(v))
    if isinstance(v, str):
        return v.replace("\t", " ").replace("\n", " ")
    return str(v)


def _csv(sel: list[Columna], filas: Iterable[tuple], reloj: str) -> Iterator[bytes]:
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow([c.nombre for c in sel])
    yield buf.getvalue().encode("utf-8")
    buf.seek(0); buf.truncate()
    n = 0
    for fila in filas:
        w.writerow([_celda_csv(v, reloj) for v in fila])
        n += 1
        if n % LOTE == 0:
            yield buf.getvalue().encode("utf-8")
            buf.seek(0); buf.truncate()
    resto = buf.getvalue()
    if resto:
        yield resto.encode("utf-8")


def _dat(sel: list[Columna], filas: Iterable[tuple], reloj: str) -> Iterator[bytes]:
    tiempo = [i for i, c in enumerate(sel) if _es_tiempo(c.tipo)]
    cab: list[str] = []
    for i, c in enumerate(sel):
        cab.append(c.nombre)
        if i in tiempo:
            cab.append(f"{c.nombre}_unix")
    yield ("\t".join(cab) + "\n").encode("utf-8")
    lineas: list[str] = []
    for fila in filas:
        celdas: list[str] = []
        for i, v in enumerate(fila):
            celdas.append(_celda_dat(v, reloj))
            if i in tiempo:
                e = _epoch(v, reloj)
                celdas.append("NaN" if e is None else repr(e))
        lineas.append("\t".join(celdas))
        if len(lineas) >= LOTE:
            yield ("\n".join(lineas) + "\n").encode("utf-8")
            lineas = []
    if lineas:
        yield ("\n".join(lineas) + "\n").encode("utf-8")


def _ident_matlab(nombre: str, usados: set[str]) -> str:
    """Identificador MATLAB valido y unico (letras/digitos/_, empieza con letra, ≤63)."""
    s = _IDENT_MATLAB.sub("_", nombre) or "col"
    if not s[0].isalpha():
        s = "c_" + s
    s = s[:63]
    base, k = s, 2
    while s in usados:
        s = f"{base[:60]}_{k}"; k += 1
    usados.add(s)
    return s


def _mat(sel: list[Columna], filas: Iterable[tuple], meta: dict, reloj: str) -> Iterator[bytes]:
    import numpy as np                 # perezoso: /health y el resto no dependen de scipy
    from scipy.io import savemat

    columnas: list[list] = [[] for _ in sel]
    for fila in filas:
        for i, v in enumerate(fila):
            columnas[i].append(v)
    n = len(columnas[0]) if sel else 0

    out: dict = {}
    usados: set[str] = set()
    for c, valores in zip(sel, columnas):
        nombre = _ident_matlab(c.nombre, usados)
        if _es_tiempo(c.tipo):
            out[nombre] = np.array([[_iso(v, reloj) if v is not None else ""] for v in valores], dtype=object).reshape(n, 1)
            unix = np.array([np.nan if (e := _epoch(v, reloj)) is None else e for v in valores], dtype=float).reshape(n, 1)
            out[_ident_matlab(f"{c.nombre}_unix", usados)] = unix
            out[_ident_matlab(f"{c.nombre}_datenum", usados)] = unix / 86400.0 + 719529.0
        elif c.tipo == "boolean" or _es_numero(c.tipo):
            out[nombre] = np.array([np.nan if v is None else float(v) for v in valores], dtype=float).reshape(n, 1)
        else:
            out[nombre] = np.array([[("" if v is None else str(v))] for v in valores], dtype=object).reshape(n, 1)
    out["meta"] = {**meta, "filas": n, "columnas": [c.nombre for c in sel]}

    buf = io.BytesIO()
    savemat(buf, out, do_compression=True, oned_as="column")
    yield buf.getvalue()


# ── Punto de entrada ──────────────────────────────────────────────────────────
def _slug(texto: str, maximo: int = 40) -> str:
    return _SLUG.sub("-", texto).strip("-")[:maximo].lower()


def _nombre_archivo(ds: Dataset, ext: str, ed: str, eh: str, filtros: dict | None) -> str:
    partes = [ds.clave] if ds.fuente == "supabase" else [ds.fuente, ds.clave]
    cajas = [v for v in (filtros or {}).get("caja", []) if v]
    if cajas:
        partes.append(_slug("_".join(cajas)) if len(cajas) <= 2 else f"{len(cajas)}-cajas")
    if ds.tcol:
        partes += [ed, eh]
    return "_".join(partes) + f".{ext}"


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
        n = estimar(tabla, desde, hasta, fuente, filtros, p)["filas"]
        if n > MAX_FILAS_MAT:
            raise ExportacionDemasiadoGrande(
                f"el rango tiene {n:,} filas y .mat admite hasta {MAX_FILAS_MAT:,} "
                f"(se arma completo en memoria): acorta el rango o usa csv/dat"
            )

    filas, ed, eh = _filas(ds, sel, desde, hasta, filtros, p)
    nombre = _nombre_archivo(ds, ext, ed, eh, filtros)
    if ext == "csv":
        cuerpo = _csv(sel, filas, ds.reloj)
    elif ext == "dat":
        cuerpo = _dat(sel, filas, ds.reloj)
    else:
        meta = {"fuente": fuente, "tabla": tabla, "relacion": ds.relacion or ds.origen,
                "desde": ed, "hasta": eh, "filtros": {k: list(v) for k, v in (filtros or {}).items() if v},
                "paso_seg": p,
                "zona_horaria": config.TZ,
                "horas": "hora local de Costa Rica (UTC-6), sin sufijo de zona",
                "generado_en": datetime.now(UTC).isoformat()}
        cuerpo = _mat(sel, filas, meta, ds.reloj)
    return Exportacion(nombre=nombre, content_type=content_type, cuerpo=cuerpo)
