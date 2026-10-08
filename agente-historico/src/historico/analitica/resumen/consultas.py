"""Las dos consultas del ultimo dato: el del sistema (cacheado) y el de la ventana."""
from __future__ import annotations

from historico import cache, db

# Que cuenta como "hay dato del inversor". Las dos consultas de abajo comparten
# este filtro: mira tambien las columnas de energia y no solo la potencia, porque
# entre nov-2025 y feb-2026 hay dias en que el inversor solo dejo `energia_hoy_wh`,
# y un "ultimo dato" que ignore esa columna puede atrasar el tablero meses.
_HAY_DATO = """(potencia_pv1_w IS NOT NULL OR potencia_pv2_w IS NOT NULL
            OR energia_hoy_wh IS NOT NULL OR energia_total_wh IS NOT NULL)"""

# SIN filtro de fechas, y es el punto entero de esta correccion: alimenta
# `actualizacion`, que habla del sistema y no del periodo (ver `evaluar_frescura`).
_SQL_ULTIMO_GLOBAL = f"""
    SELECT max("timestamp") AS ultimo
      FROM v_sc_electrico_corregido
     WHERE {_HAY_DATO}
"""

# Con filtro de fechas. Alimenta DOS cosas del periodo y ninguna alarma: la ventana
# de los "ultimos 7 dias" y el bloque informativo `ultimo_dato_del_periodo`.
_SQL_ULTIMO_EN_VENTANA = f"""
    SELECT max("timestamp") AS ultimo
      FROM v_sc_electrico_corregido
     WHERE "timestamp" >= %s AND "timestamp" < %s
       AND {_HAY_DATO}
"""

# La frescura global no depende de la ventana, asi que TODA peticion al tablero
# (cualquier rango, y tambien la tool del agente) pregunta exactamente lo mismo. La
# clave es constante: una sola entrada sirve a todas, y la coalescencia de
# `historico.cache` hace que N peticiones simultaneas cuesten UNA consulta. El TTL
# de segundos es de sobra: es una antiguedad medida en DIAS.
_CACHE = cache.registrar(cache.CacheBreve())
_CLAVE_ULTIMO_GLOBAL = "resumen.ultimo_global"


def ultimo_global() -> str | None:
    """El ultimo dato del inversor en TODA la base, cacheado. None si no hay ninguno.

    Va aparte y no fusionada con la consulta de la ventana (un `FILTER` habria dado
    las dos en un viaje) por dos razones: asi no puede volver a colarse el filtro de
    fechas sobre la frescura, y asi la respuesta se puede cachear, que es lo que la
    hace gratis. La consulta pesa lo mismo que un `SELECT 1` (medido: 235 ms contra
    210 ms, todo latencia del pooler), asi que en paralelo no mueve el reloj.
    """
    return _CACHE.obtener(_CLAVE_ULTIMO_GLOBAL,
                          lambda: db.uno(_SQL_ULTIMO_GLOBAL).get("ultimo"))
