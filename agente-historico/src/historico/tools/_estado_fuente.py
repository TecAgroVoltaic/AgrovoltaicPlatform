"""Estado de UNA fuente en UN dia para `diagnostico_dia`: lecturas, cadencia y hueco."""
from __future__ import annotations

from datetime import date, timedelta

from historico import db

_SEGUNDOS_POR_HORA = 3600

# La cadencia se mide con la MEDIANA de los saltos entre lecturas consecutivas, no
# con el promedio: un solo hueco de 6 h en medio del dia arrastraria el promedio y
# haria parecer que el logger grababa cada varios minutos cuando grababa cada 15 s.
_SQL_CADENCIA = """
    SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY d) AS cadencia_s,
           count(*) AS saltos
      FROM (SELECT EXTRACT(EPOCH FROM ("timestamp"
                     - lag("timestamp") OVER (ORDER BY "timestamp"))) AS d
              FROM {tabla}
             WHERE "timestamp" >= %s AND "timestamp" < %s) t
     WHERE d IS NOT NULL
"""
_SQL_BORDES = """
    SELECT min("timestamp") AS primera, max("timestamp") AS ultima FROM {tabla}
     WHERE "timestamp" >= %s AND "timestamp" < %s
"""
_SQL_ANTES = 'SELECT max("timestamp")::date AS d FROM {tabla} WHERE "timestamp" < %s'
_SQL_DESPUES = 'SELECT min("timestamp")::date AS d FROM {tabla} WHERE "timestamp" >= %s'


def _hueco(tabla: str, dia: date) -> dict:
    """Los bordes del tramo sin datos que contiene a `dia`, para esa fuente.

    Se calcula con dos consultas a los extremos y no barriendo el calendario: el
    ultimo timestamp anterior al dia y el primero posterior ya definen el tramo, y
    los dos son un salto de indice.
    """
    antes = db.uno(_SQL_ANTES.format(tabla=tabla), (dia.isoformat(),)).get("d")
    despues = db.uno(_SQL_DESPUES.format(tabla=tabla),
                     ((dia + timedelta(days=1)).isoformat(),)).get("d")
    ini = date.fromisoformat(antes) + timedelta(days=1) if antes else None
    fin = date.fromisoformat(despues) - timedelta(days=1) if despues else None
    return {
        "ultimo_dia_con_datos_antes": antes,
        "primer_dia_con_datos_despues": despues,
        "hueco_desde": ini.isoformat() if ini else None,
        "hueco_hasta": fin.isoformat() if fin else None,
        "hueco_dias": (fin - ini).days + 1 if (ini and fin) else None,
        "borde": (None if (antes and despues)
                  else "el hueco llega hasta el final del historico" if antes
                  else "el hueco arranca antes del primer dato registrado"),
    }


def _fuente(tabla: str, dia: date, filas: int, veredicto: str, horas_sol: float | None) -> dict:
    """Estado de una fuente ese dia: cuanto grabo, cada cuanto, y contra que se mide."""
    bloque: dict = {"filas": filas, "veredicto": veredicto}
    if not filas:
        bloque["cadencia_s"] = None
        bloque["esperadas"] = None
        bloque.update(_hueco(tabla, dia))
        return bloque

    d0, d1 = dia.isoformat(), (dia + timedelta(days=1)).isoformat()
    cad = db.uno(_SQL_CADENCIA.format(tabla=tabla), (d0, d1))
    bordes = db.uno(_SQL_BORDES.format(tabla=tabla), (d0, d1))
    cadencia = cad.get("cadencia_s")
    bloque["cadencia_s"] = cadencia
    bloque["primera_lectura"] = bordes.get("primera")
    bloque["ultima_lectura"] = bordes.get("ultima")
    # Cuantas lecturas TENDRIA que haber: el logger solo graba de dia, asi que el
    # patron de medida son las horas de sol de ESE dia, no 24 h.
    if cadencia and horas_sol:
        esperadas = int(round(horas_sol * _SEGUNDOS_POR_HORA / cadencia))
        bloque["esperadas"] = esperadas
        bloque["cobertura"] = round(filas / esperadas, 3) if esperadas else None
    else:
        bloque["esperadas"] = None
    return bloque
