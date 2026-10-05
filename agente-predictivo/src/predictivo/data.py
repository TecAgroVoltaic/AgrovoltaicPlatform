"""
Capa de datos del pronostico: lee del STORE (Supabase `lecturas_ambientales`).

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

from predictivo import config
from predictivo.domain import Variable

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

# Dos consultas en vez de una, y a proposito. La version anterior se bajaba
# TODOS los canales de la variable (5 de humedad, 6 de irradiancia) para despues
# descartar todos menos uno en pandas, y encima arrastraba el `sensor_id` (uuid
# de 36 caracteres) repetido en cada fila. Eso eran ~73 MB por arranque en frio y
# fue lo que reviento la cuota de egress del Free tier.
#
# Ahora: primero un agregado diminuto para elegir el canal (once filas), despues
# solo las columnas que se usan del canal elegido. Misma serie de salida, ~20
# veces menos bytes por la red.
_SQL_CANALES = """
    SELECT s.serie_id, s.sensor_id::text, count(*) AS n
    FROM lecturas_ambientales l
    JOIN series_ambientales   s USING (serie_id)
    WHERE s.variable = %s
    GROUP BY s.serie_id, s.sensor_id
"""
_SQL_SERIE = """
    SELECT ts, valor
    FROM lecturas_ambientales
    WHERE serie_id = %s
    ORDER BY ts
"""


def _parquet(variable: str):
    """Cache parquet por variable (no se versiona)."""
    return DATA_DIR / f"store_{variable}.parquet"


def _elegir_canal(variable: str, canales: list[tuple]) -> tuple[int, str]:
    """(serie_id, sensor_id) del canal a usar, a partir de (serie_id, sensor_id, n).

    Misma regla de siempre y por la misma razon: el canal preferido de config si
    esta disponible, si no el de mas lecturas, y el empate se rompe por sensor_id
    ordenado. Lo importante es que sea REPRODUCIBLE, no cual gana.
    """
    n_max = max(n for _, _, n in canales)
    candidatos = sorted(sid for _, sid, n in canales if n == n_max)
    disponibles = {sid for _, sid, _ in canales}
    pref = CANAL_PREFERIDO.get(variable)
    top = pref if (pref and pref in disponibles) else candidatos[0]
    serie_id = next(sid_num for sid_num, sid, _ in canales if sid == top)
    return serie_id, top


def _descargar_desde_store(variable: str, verbose: bool = True) -> pd.Series:
    """Trae la serie de `variable` del store en SOLO LECTURA y elige el canal.
    Devuelve una Serie tz-aware (America/Costa_Rica)."""
    conn_str = config.store_conninfo()
    if verbose:
        print(f"Leyendo store (Supabase) variable={variable!r} (solo lectura)...")
    with psycopg.connect(conn_str, autocommit=True) as conn:
        conn.execute("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY")
        canales = conn.execute(_SQL_CANALES, (variable,)).fetchall()
        if not canales:
            raise SystemExit(
                f"Store sin datos para variable={variable!r}. "
                f"Corre el ETL (predictivo.etl) o revisa STORE_URL."
            )
        serie_id, top = _elegir_canal(variable, canales)
        if verbose:
            print(f"Canales: {len(canales)} | elegido: {top}")
        with conn.cursor() as cur:
            cur.execute(_SQL_SERIE, (serie_id,))
            rows = cur.fetchall()

    if not rows:
        raise SystemExit(
            f"Store sin datos para variable={variable!r} canal={top!r}. "
            f"Corre el ETL (predictivo.etl) o revisa STORE_URL."
        )

    # Indice tz-aware: store.ts es instante absoluto -> convertir a hora local CR.
    idx = pd.to_datetime([r[0] for r in rows], utc=True).tz_convert(TZ)
    valores = pd.array([r[1] for r in rows], dtype="float64")
    serie = pd.Series(valores, index=idx, name=variable).sort_index()
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


# Sigue contando TODOS los canales de la variable, no solo el elegido: es el
# rango del store, no el de la serie que usa el forecaster. Se mantiene asi para
# que los numeros de la consola no cambien con la normalizacion.
_SQL_RANGO = """
    SELECT min(l.ts), max(l.ts), count(*)
    FROM lecturas_ambientales l
    JOIN series_ambientales   s USING (serie_id)
    WHERE s.variable = %s
"""


def _rango_desde_store(variable: str) -> dict | None:
    """Los tres numeros del rango con un agregado SQL. None si el store no responde.

    Falla hacia None a proposito: quien llama tiene un camino alternativo (cargar
    la serie), y este atajo nunca debe ser el motivo de que el rango no exista.
    """
    try:
        with psycopg.connect(config.store_conninfo(), autocommit=True) as conn:
            fila = conn.execute(_SQL_RANGO, (variable,)).fetchone()
    except Exception:
        return None
    if not fila:
        return None
    desde, hasta, n = fila
    if not n:
        return {"desde": None, "hasta": None, "n": 0}
    return {"desde": pd.Timestamp(desde).tz_convert(TZ).isoformat(),
            "hasta": pd.Timestamp(hasta).tz_convert(TZ).isoformat(),
            "n": int(n)}


def rango_datos(variable: str = Variable.IRRADIANCIA.value) -> dict:
    """Desde/hasta/cuantas de la serie disponible de `variable`.

    Fuente UNICA del rango: lo consumen el `forecast` (para que quien ancle un
    pronostico vea si el instante elegido tiene sentido) y el mapa de arquitectura.

    Atajo importante: si la serie NO esta ni en memoria ni en el parquet, se le
    piden los tres numeros al store con un agregado en vez de descargarla entera.
    Bajarse 694.000 filas para calcular min/max/count hacia que la vista de
    arquitectura tardara 5 segundos cada vez que se recreaba el contenedor, que no
    tiene volumen y por eso pierde el cache cada 6 h.

    El atajo se toma SOLO en ese caso. Si los datos ya estan disponibles localmente
    se pasa por `cargar_serie`, que es barato y ademas es el punto que las pruebas
    sustituyen: saltearlo haria que un test con una serie armada a mano terminara
    consultando la base de verdad.
    """
    if _SERIES.get(variable) is None and not _parquet(variable).exists():
        rango = _rango_desde_store(variable)
        if rango is not None:
            return rango

    serie = cargar_serie(variable)
    if serie.empty:
        return {"desde": None, "hasta": None, "n": 0}
    return {"desde": serie.index.min().isoformat(),
            "hasta": serie.index.max().isoformat(),
            "n": int(len(serie))}


def valor_medido(t, variable: str = Variable.IRRADIANCIA.value,
                 tolerancia_min: float = 10.0) -> dict | None:
    """Lo que el sensor MIDIO en el instante `t` (la lectura mas cercana).

    Devuelve {valor, ts, desfase_seg} o None si no hay ninguna lectura dentro de
    `tolerancia_min` (p. ej. porque `t` cae en el futuro, o en un hueco).

    NO es fuga: esto se consulta DESPUES de pronosticar y jamas alimenta el
    calculo. Existe para poder contrastar un pronostico anclado en un instante
    historico contra la realidad — que es justo lo que hace honesto al hindcast:
    el forecaster solo vio `< ahora`, y recien despues se mira que paso.
    """
    serie = cargar_serie(variable)
    if serie.empty:
        return None
    t = pd.Timestamp(t)
    t = t.tz_localize(TZ) if t.tz is None else t.tz_convert(TZ)
    pos = serie.index.get_indexer([t], method="nearest")[0]
    if pos < 0:
        return None
    ts = serie.index[pos]
    desfase = abs((ts - t).total_seconds())
    if desfase > tolerancia_min * 60:
        return None
    return {"valor": round(float(serie.iloc[pos]), 2),
            "ts": ts.isoformat(),
            "desfase_seg": int(desfase)}


def peek_serie(variable: str = Variable.IRRADIANCIA.value,
               bucket: str = "D", ultimos_dias: int | None = 60) -> dict:
    """Panorama de una serie del store para el debugger (resumen + puntos a graficar).

    Solo LECTURA del cache (no toca la DB si el parquet existe). `bucket` es un
    alias de resample de pandas ('h', 'D', 'W'); `ultimos_dias` recorta la cola
    (None = toda la serie). Devuelve estadisticas globales + serie remuestreada
    (media por bucket) lista para una grafica."""
    serie = cargar_serie(variable)
    if ultimos_dias:
        corte = serie.index.max() - pd.Timedelta(days=int(ultimos_dias))
        vista = serie[serie.index >= corte]
    else:
        vista = serie
    res = vista.resample(bucket).mean().dropna()
    dt = serie.index.to_series().diff().dropna()
    return {
        "variable": variable,
        "bucket": bucket,
        "ultimos_dias": ultimos_dias,
        "resumen": {
            "filas": int(len(serie)),
            "desde": serie.index.min().isoformat(),
            "hasta": serie.index.max().isoformat(),
            "cadencia_mediana_seg": (None if dt.empty
                                     else int(dt.median().total_seconds())),
            "valor_min": float(serie.min()),
            "valor_max": float(serie.max()),
            "valor_media": float(serie.mean()),
        },
        "puntos": [{"t": t.isoformat(), "v": float(v)} for t, v in res.items()],
    }


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
