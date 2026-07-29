"""
Capa de datos del pronostico — lee del STORE (Supabase `lecturas_ambientales_sc`).

Arquitectura A: el ETL trae la data ambiental de San Carlos desde AgroDash al
store; el forecaster la lee de AQUI (no de AgroDash), asi queda desacoplado de la
fuente y con historia propia. Multi-variable: 'irradiancia' y 'humedad_suelo'.

Responsabilidades:
  1. cargar_serie(variable): trae UNA vez la serie del canal elegido y la cachea
     (memoria + parquet por variable), para no golpear la base en cada corrida.
  2. get_recent_data(now, lookback_min, variable): ventana [now-lb, now)
     ESTRICTAMENTE < now — la barrera anti-fuga del backtest/forecaster.

Convenciones:
  - store.ts es timestamptz (instante absoluto correcto). Se convierte a hora
    LOCAL (America/Costa_Rica) para el indice, que es lo que espera el clear-sky.
  - Canal (sensor_id) por variable: el preferido (config) o el de mas lecturas
    (desempate estable) -> eleccion REPRODUCIBLE.
  - Conexion por config.store_conninfo() (STORE_URL, Supabase). SOLO LECTURA aqui.

Toda la configuracion (geo, DSN del store, canal) vive en config.py; aqui solo la
logica de datos.
"""
from __future__ import annotations

import os

import pandas as pd
import psycopg

from pronostico import config
from pronostico.domain import Variable

# --- Parametros del sitio (re-exportados para uso con **SITE) ---------------
LAT, LON, ALT = config.LAT, config.LON, config.ALT
TZ = config.TZ
# Atajo geografico: physics.clear_sky_ghi(times, **SITE). Es un DICT.
SITE = dict(config.SITE_GEO)

# --- Identidad/umbral heredados (irradiancia) -------------------------------
# El ETL ya normalizo a 'variable', asi que BOX_NAME/SENSOR_TYPE ya NO filtran el
# store; se mantienen por compatibilidad de imports (persistence.py los cita).
SENSOR_TYPE = config.SENSOR_TYPE
BOX_NAME = config.BOX_NAME
UMBRAL_CS = config.UMBRAL_CS

# Canal (sensor_id) preferido por variable. None -> se elige el de mas lecturas.
CANAL_PREFERIDO = {
    Variable.IRRADIANCIA.value: config.CANAL_IRRADIANCIA,
    Variable.HUMEDAD_SUELO.value: os.environ.get("HUMEDAD_CHANNEL") or None,
}

# --- Rutas (fuente de verdad: config) ---------------------------------------
ROOT = config.ROOT
DATA_DIR = config.DATA_DIR

# Cache en memoria POR VARIABLE (evita releer el parquet en cada get_recent_data).
_SERIES: dict[str, pd.Series] = {}

_SQL_STORE = """
    SELECT ts, valor, sensor_id
    FROM lecturas_ambientales_sc
    WHERE variable = %s
    ORDER BY ts
"""


def _parquet(variable: str):
    """Cache parquet por variable (no se versiona)."""
    return DATA_DIR / f"store_{variable}.parquet"


def _descargar_desde_store(variable: str, verbose: bool = True) -> pd.Series:
    """Trae la serie de `variable` del store en SOLO LECTURA y elige el canal.
    Devuelve una Serie tz-aware (America/Costa_Rica)."""
    conn_str = config.store_conninfo()
    if verbose:
        print(f"Leyendo store (Supabase) variable={variable!r} (solo lectura)...")
    with psycopg.connect(conn_str, autocommit=True) as conn:
        conn.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")
        with conn.cursor() as cur:
            cur.execute(_SQL_STORE, (variable,))
            rows = cur.fetchall()

    df = pd.DataFrame(rows, columns=["ts", "valor", "sensor_id"])
    if df.empty:
        raise SystemExit(
            f"Store sin datos para variable={variable!r}. "
            f"Corre el ETL (pronostico.etl) o revisa STORE_URL."
        )
    df["valor"] = df["valor"].astype(float)
    df["sensor_id"] = df["sensor_id"].astype(str)

    # Elegir el canal (sensor_id): el preferido si esta, si no el de mas lecturas
    # (desempate por sensor_id ordenado) -> reproducible.
    conteos = df["sensor_id"].value_counts()
    n_max = int(conteos.max())
    candidatos = sorted(conteos[conteos == n_max].index)
    pref = CANAL_PREFERIDO.get(variable)
    top = pref if (pref and pref in set(df["sensor_id"])) else candidatos[0]
    if verbose:
        print(f"Canales: {df['sensor_id'].nunique()} | elegido: {top}")
    s = df[df["sensor_id"] == top].copy()

    # Indice tz-aware: store.ts es instante absoluto -> convertir a hora local CR.
    idx = pd.to_datetime(s["ts"], utc=True).dt.tz_convert(TZ)
    serie = pd.Series(s["valor"].values, index=idx, name=variable).sort_index()
    serie = serie[~serie.index.duplicated(keep="first")]
    serie.index.name = "ts"
    return serie


def cargar_serie(variable: str = Variable.IRRADIANCIA.value,
                 forzar: bool = False, verbose: bool = False) -> pd.Series:
    """Serie COMPLETA de `variable` (tz-aware CR). Usa parquet/memoria si existe.

    forzar=True vuelve a bajar del store y reescribe el cache. Esta funcion es la
    unica que toca la DB; get_recent_data lee solo el cache.
    """
    cached = _SERIES.get(variable)
    if cached is not None and not forzar:
        return cached

    pq = _parquet(variable)
    if pq.exists() and not forzar:
        serie = pd.read_parquet(pq)[variable]
    else:
        serie = _descargar_desde_store(variable, verbose=verbose)
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        serie.to_frame().to_parquet(pq)

    # Seguro: indice tz-aware en America/Costa_Rica.
    if serie.index.tz is None:
        serie.index = serie.index.tz_localize(TZ)
    else:
        serie.index = serie.index.tz_convert(TZ)
    serie = serie.sort_index()
    serie.name = variable
    serie.index.name = "ts"
    _SERIES[variable] = serie
    return serie


def get_recent_data(now, lookback_min: float,
                    variable: str = Variable.IRRADIANCIA.value) -> pd.Series:
    """Lecturas de `variable` en [now - lookback_min, now), ESTRICTAMENTE < now.

    Es la barrera anti-fuga: el forecaster jamas ve un dato con timestamp >= now.
    Lee del cache en memoria (no de la DB). `variable` va al final con default
    irradiancia -> las llamadas historicas de 2 args siguen funcionando.
    """
    serie = cargar_serie(variable)
    now = pd.Timestamp(now)
    if now.tz is None:                       # tolera un now naive: se asume hora local
        now = now.tz_localize(TZ)
    desde = now - pd.Timedelta(minutes=lookback_min)
    return serie[(serie.index >= desde) & (serie.index < now)]  # < now: sin fuga


# ---------------------------------------------------------------------------
def main() -> None:
    """CLI: fuerza la descarga de una variable, cachea e imprime diagnostico.

    Uso: python -m pronostico.data [irradiancia|humedad_suelo]
    """
    import sys
    variable = sys.argv[1] if len(sys.argv) > 1 else Variable.IRRADIANCIA.value
    serie = cargar_serie(variable, forzar=True, verbose=True)
    print(f"\n===== SERIE CACHEADA ({variable}) =====")
    print(f"Filas: {len(serie)}")
    print(f"Rango: {serie.index.min()}  ->  {serie.index.max()}")
    dt = serie.index.to_series().diff().dropna()
    if not dt.empty:
        print(f"Cadencia mediana: {dt.median()}  (min={dt.min()}, p95={dt.quantile(.95)})")
    print(f"Valor: min={serie.min():.1f}  max={serie.max():.1f}  media={serie.mean():.1f}")
    print(f"Cache -> {_parquet(variable)}")


if __name__ == "__main__":
    main()
