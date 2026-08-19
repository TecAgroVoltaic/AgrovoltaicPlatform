"""
Salud de la INGESTA: que tan viejo es el ultimo dato del store, por variable.

SRP: solo responde "¿la ingesta esta fresca?" leyendo el store. No corre el ETL,
no pronostica, no decide que hacer con la respuesta. El borde HTTP (api.py) la
expone; un monitor externo la consulta. Lo que hizo el ETL en su ultima corrida
lo traduce `etl_estado`, que este modulo compone para no dejar el diagnostico a
medias.

Por que existe: el forecaster usa como "ahora" el ultimo dato del store, no el
reloj de pared. Si la ingesta se congela, TODO sigue respondiendo 200 con
numeros viejos y nadie se entera. El 2026-08-14 se descubrio que el ETL llevaba
9 dias fallando cada 15 min sin dejar rastro. Esto es el detector.
"""
from __future__ import annotations

import os
import time
from datetime import datetime, timezone

import psycopg

from pronostico import config, etl_estado
from pronostico.domain import Variable

# Umbral de "stale" en horas. La ingesta corre cada 15 min; con la fuente sana,
# la edad del ultimo dato deberia estar muy por debajo de esto.
UMBRAL_STALE_HORAS = float(os.environ.get("INGESTA_STALE_HORAS", "6"))

ESTADO_OK = "ok"
ESTADO_STALE = "stale"
ESTADO_SIN_DATOS = "sin_datos"
# No es un estado de la ingesta sino la ausencia de respuesta: el store no se
# pudo consultar. Existe para que el panel pueda decir "no se sabe" en vez de
# inventar un "ok" o tumbarse entero.
ESTADO_DESCONOCIDO = "desconocido"

HORAS_POR_DIA = 24

# Lee la VISTA, no la tabla: la definicion de "frescura" vive en el esquema y
# se puede consultar igual desde psql o el dashboard de Supabase.
# La vista `v_salud_ingesta` calculaba `max(ts)` y `count(*)` de una sola pasada,
# y el conteo obliga a recorrer la tabla ENTERA: 885 mil filas hoy, 172 ms, y
# crece para siempre. Se separan, porque no cuestan ni valen lo mismo:
#
#   * `max(ts)` DECIDE el estado (fresco / viejo) y sale del indice
#     (variable, ts) en menos de 1 ms por variable. Siempre fresco.
#   * `filas` es contexto para el lector, no dispara ninguna alerta. Se cachea:
#     solo cambia cuando el ETL inserta, y el ETL corre cada ~6 min.
#
# Las variables salen del dominio, no de un DISTINCT sobre la tabla (que tambien
# la recorria entera).
_SQL_ULTIMO = """
    SELECT v.variable,
           (SELECT max(ts) FROM lecturas_ambientales_sc l WHERE l.variable = v.variable)
      FROM unnest(%s::text[]) AS v(variable)
"""
_SQL_FILAS = "SELECT variable, count(*) FROM lecturas_ambientales_sc GROUP BY variable"

# Cuanto vale un conteo antes de volver a pedirlo. Mas corto que el intervalo del
# ETL no aporta nada: el numero no puede haber cambiado.
TTL_FILAS_SEG = 300.0
# (momento monotonico, conteos). Estado de modulo A PROPOSITO: es un cache de
# proceso, y se pierde con el proceso, que es exactamente lo que se quiere.
_CACHE_FILAS: tuple[float, dict] | None = None


def reiniciar_cache_filas() -> None:
    """Olvida el conteo cacheado. Existe para los tests y para forzar un refresco."""
    global _CACHE_FILAS
    _CACHE_FILAS = None


def _conteos(conn: psycopg.Connection) -> dict:
    """Filas por variable, cacheadas TTL_FILAS_SEG."""
    global _CACHE_FILAS
    ahora = time.monotonic()
    if _CACHE_FILAS and ahora - _CACHE_FILAS[0] < TTL_FILAS_SEG:
        return _CACHE_FILAS[1]
    conteos = {variable: int(n) for variable, n in conn.execute(_SQL_FILAS)}
    _CACHE_FILAS = (ahora, conteos)
    return conteos


def _estado(edad_h: float | None, umbral_h: float) -> str:
    if edad_h is None:
        return ESTADO_SIN_DATOS
    return ESTADO_OK if edad_h <= umbral_h else ESTADO_STALE


def _frescura(conn: psycopg.Connection) -> dict:
    """Ultimo dato y filas de cada variable ESPERADA (aunque no tenga ninguna)."""
    variables = [m.value for m in Variable]
    medidas = {v: (None, 0) for v in variables}
    conteos = _conteos(conn)
    for variable, ultimo in conn.execute(_SQL_ULTIMO, (variables,)):
        medidas[variable] = (ultimo, conteos.get(variable, 0))
    return medidas


def _por_variable(medidas: dict, ahora: datetime, umbral_h: float) -> dict:
    salida = {}
    for variable, (ultimo, filas) in medidas.items():
        edad_h = etl_estado.edad_horas(ultimo, ahora)
        salida[variable] = {
            "ultimo_dato": ultimo.isoformat() if ultimo else None,
            "edad_horas": edad_h,
            "filas": filas,
            "estado": _estado(edad_h, umbral_h),
        }
    return salida


def _congelamiento(medidas: dict, ahora: datetime, umbral_h: float) -> dict:
    """Desde cuando no entra un dato NUEVO al store, mirando todas las variables.

    `desde` es el dato mas RECIENTE de todo el sistema: si ninguna variable trajo
    nada despues de ese instante, ese es el momento exacto en que la ingesta se
    detuvo. Se expone en dias porque es la unidad en la que se vive el problema
    (la fuente lleva semanas congelada, no horas).
    """
    ultimos = [ultimo for ultimo, _ in medidas.values() if ultimo is not None]
    if not ultimos:
        return {"congelada": True, "desde": None, "dias": None}
    mas_reciente = max(ultimos)
    edad_h = etl_estado.edad_horas(mas_reciente, ahora)
    return {
        "congelada": edad_h > umbral_h,
        "desde": mas_reciente.isoformat(),
        "dias": round(edad_h / HORAS_POR_DIA, 1),
    }


def estado_ingesta(umbral_horas: float | None = None) -> dict:
    """Reporte de salud de la ingesta: frescura por variable + estado del ETL.

    `estado` global = el PEOR de las variables (sin_datos > stale > ok), para
    que un monitor pueda alertar mirando un solo campo. Los nombres
    `ultima_corrida_etl` / `ultimo_error_etl` se conservan porque ya son contrato
    publico de `GET /salud/ingesta`; su contenido es el que enriquecio
    `etl_estado` (filas de la ultima corrida, duracion, error por variable).
    """
    umbral_h = UMBRAL_STALE_HORAS if umbral_horas is None else umbral_horas
    ahora = datetime.now(timezone.utc)
    with psycopg.connect(config.store_conninfo(), autocommit=True) as conn:
        medidas = _frescura(conn)
        variables = _por_variable(medidas, ahora, umbral_h)
        etl = etl_estado.estado(conn, ahora)
        reporte = {
            "estado": _peor_estado(v["estado"] for v in variables.values()),
            "umbral_stale_horas": umbral_h,
            "consultado_en": ahora.isoformat(),
            "variables": variables,
            "congelamiento": _congelamiento(medidas, ahora, umbral_h),
            "ultima_corrida_etl": etl["ultima_corrida"],
            "ultimo_error_etl": etl["ultimo_error"],
            "etl_fallando": etl["fallando"],
        }
    return reporte


def _peor_estado(estados) -> str:
    """sin_datos manda sobre stale, y stale sobre ok."""
    orden = {ESTADO_OK: 0, ESTADO_STALE: 1, ESTADO_SIN_DATOS: 2}
    peor = max(estados, key=lambda e: orden[e], default=ESTADO_SIN_DATOS)
    return peor
