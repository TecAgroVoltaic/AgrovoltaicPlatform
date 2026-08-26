"""Tool `diagnostico_dia` — todo lo que se sabe de UN dia, para poder explicarlo.

Existe por una pregunta que las otras tools no podian contestar: **por que ese dia
esta pintado de ese color en el mapa de la consola**. `hallazgos_calidad` acotada a
un dia sirve cuando el dia tiene hallazgos, pero el caso mas frecuente del mapa es
el contrario: 295 de los 569 dias no tienen NI UNA fila, y ahi `hallazgos_calidad`
devuelve una lista vacia. Una lista vacia es justo el material con el que un LLM
inventa ("el sensor estaba en mantenimiento"), porque no hay nada que lo contradiga.

Asi que esta tool devuelve tambien lo que se sabe de la AUSENCIA, que es
verificable aunque no haya datos: a que hueco pertenece el dia, de cuando a cuando
va ese hueco, cual fue el ultimo dia grabado antes y el primero despues. Eso no
explica la CAUSA -y la tool lo dice explicitamente en su nota- pero convierte
"no se" en un hecho contable, que es lo unico honesto que se puede decir.

El veredicto NO se recalcula aca: sale de `calidad.contexto.dias`, la misma
funcion que alimenta la vista y `calidad_periodo`. Si esta tool tuviera su propio
criterio, el agente podria contradecir al cuadrito que el usuario acaba de tocar.
"""
from __future__ import annotations

from datetime import date, timedelta

from historico import db
from historico.calidad import contexto
from historico.tools.hallazgos import QUE_ES

FUENTES = ("radiacion_sc_15s", "monitoreo_sc_electrico")
# Cuantos dias a cada lado se devuelven como vecinos. Tres alcanzan para ver si el
# dia es un bache suelto o el borde de un hueco largo, sin inflar el payload.
VECINOS = 3

SCHEMA = {
    "name": "diagnostico_dia",
    "description": (
        "Todo lo que se sabe de UN dia concreto del historico: cuantas lecturas grabo "
        "cada fuente contra cuantas deberia haber grabado, el veredicto de calidad, la "
        "lista COMPLETA de hallazgos de ese dia con su significado, como estuvo el cielo, "
        "los dias vecinos y -si falta dato- de cuando a cuando va el hueco al que "
        "pertenece el dia y cual fue el ultimo dia con datos antes de el. "
        "Usala SIEMPRE que pregunten por un dia puntual: 'que paso el 2025-05-20', "
        "'por que no hay datos ese dia', 'que problema tiene esa fecha'. "
        "Es la unica fuente para explicar un dia: lo que esta tool no dice, no se sabe."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "fecha": {"type": "string",
                      "description": "El dia en ISO (YYYY-MM-DD), hora local de Costa Rica."},
        },
        "required": ["fecha"],
        "additionalProperties": False,
    },
}

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

_SQL_HALLAZGOS = """
    SELECT fuente, variable, tipo, severidad, n_afectadas, detalle
      FROM hallazgos_calidad
     WHERE fecha = %s
     ORDER BY (severidad = 'grave') DESC, fuente, tipo, variable
"""
_SQL_VENTANA = "SELECT amanecer, atardecer, horas_sol FROM ventana_solar WHERE fecha = %s"

NOTA = (
    "El store registra la AUSENCIA de dato, no su causa. Si un dia no tiene lecturas, lo "
    "unico verificable es desde cuando hasta cuando falta y cual fue el ultimo dia grabado: "
    "decilo asi y NO atribuyas un motivo (corte electrico, mantenimiento, sensor quemado, "
    "logger apagado) que no aparezca en estos campos."
)


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
        esperadas = int(round(horas_sol * 3600 / cadencia))
        bloque["esperadas"] = esperadas
        bloque["cobertura"] = round(filas / esperadas, 3) if esperadas else None
    else:
        bloque["esperadas"] = None
    return bloque


def run(fecha: str) -> dict:
    try:
        dia = date.fromisoformat(str(fecha).strip()[:10])
    except ValueError as exc:
        raise ValueError(f"fecha invalida: {fecha!r} (se espera YYYY-MM-DD)") from exc

    # Un solo viaje trae el dia y sus vecinos con el MISMO veredicto que la vista.
    ventana = contexto.dias((dia - timedelta(days=VECINOS)).isoformat(),
                            (dia + timedelta(days=VECINOS + 1)).isoformat())
    hoy = next((d for d in ventana if d["fecha"] == dia.isoformat()), None)
    if hoy is None:
        return {
            "fecha": dia.isoformat(),
            "existe": False,
            "nota": ("ese dia no esta en el calendario del historico (ventana_solar): "
                     "queda fuera del periodo cubierto, no es un dia sin datos"),
        }

    sol = db.uno(_SQL_VENTANA, (dia.isoformat(),))
    horas_sol = sol.get("horas_sol")

    hallazgos = db.query(_SQL_HALLAZGOS, (dia.isoformat(),))
    for h in hallazgos:
        h["que_es"] = QUE_ES.get(h["tipo"], "")

    fuentes = {
        "radiacion_sc_15s": _fuente(
            "radiacion_sc_15s", dia, hoy["filas_radiacion"],
            hoy["veredicto_radiacion"], horas_sol),
        "monitoreo_sc_electrico": _fuente(
            "monitoreo_sc_electrico", dia, hoy["filas_electrico"],
            hoy["veredicto_electrico"], horas_sol),
    }

    cielo = ({"clase": hoy["clase"], "kt_medio": hoy["kt_medio"],
              "indice_variabilidad": hoy["indice_variabilidad"]}
             if hoy.get("clase") else None)

    return {
        "fecha": dia.isoformat(),
        "existe": True,
        "veredicto_dia": hoy["veredicto"],
        "ventana_solar": {"amanecer": sol.get("amanecer"), "atardecer": sol.get("atardecer"),
                          "horas_sol": horas_sol},
        "fuentes": fuentes,
        "cielo": cielo,
        "hallazgos": hallazgos,
        "n_hallazgos": len(hallazgos),
        "vecinos": [
            {"fecha": d["fecha"], "filas_radiacion": d["filas_radiacion"],
             "filas_electrico": d["filas_electrico"], "veredicto": d["veredicto"]}
            for d in ventana if d["fecha"] != dia.isoformat()
        ],
        "significado_veredicto": {
            "ok": "sin hallazgos ese dia",
            "aviso": "hay defectos puntuales; el dia se puede usar con cuidado",
            "grave": ("un problema grave toca al menos la quinta parte de las lecturas, "
                      "o falta media jornada"),
            "sin_datos": "esa fuente no grabo ni una fila ese dia",
        },
        "nota": NOTA,
    }
