"""Puntos 1 y 2: calidad de los datos por dia y por sensor, y los hallazgos.

Contesta tres preguntas por cada dia y cada fuente:
  * ¿estan TODOS los datos del dia?  -> cobertura y densidad
  * ¿son VALIDOS?                    -> nulos, fuera de rango, saturacion, sensor plano
  * ¿hay DUPLICADOS?                 -> timestamps repetidos

Dos metricas de completitud, no una, porque son fallas distintas:
  * `cobertura` = cuanto de las horas de sol alcanzo a grabar el logger.
    Baja = arranco tarde, paro temprano, o se cayo medio dia.
  * `densidad`  = cuantas de las lecturas esperadas hay DENTRO de lo que si grabo.
    Baja = huecos internos aunque el dia se vea "largo".
Un dia puede tener cobertura 1,0 y densidad 0,4: grabo de punta a punta pero
perdiendo la mitad de las muestras. Con una sola metrica eso no se ve.

La cadencia esperada se INFIERE del propio dia (el hueco mas frecuente) y no de una
constante: el historico tiene 33 cadencias distintas (2 s en dic-2024, 1 min en
may-2025, ~5 min desde nov-2025), asi que cualquier numero fijo mentiria.

La deteccion es determinista y sin LLM: los numeros salen de aca, el lenguaje viene
despues (docs/memoria/proyecto/capa-agentes.md).

## El segundo paso: las seis familias de `calidad.pruebas` (`barrido_pruebas`)

Lo de arriba mira DOS tablas columna por columna con SQL agregado. `calidad.pruebas`
mira el CATALOGO ENTERO de variables lectura por lectura, con los umbrales exactos
del documento (cuatro familias que juzgan el DATO) mas la disponibilidad del
EQUIPO, que juzga si la planta estaba funcionando, y la consistencia ENTRE
sensores (temperatura de modulo contra irradiancia). Los dos pasos escriben en
`hallazgos_calidad` y ninguno pisa al otro: sus tipos son disjuntos y cada uno
borra los suyos antes de reinsertar.

Este modulo sigue siendo el UNICO que escribe en la base (`db.ejecutar` y
`db.ejecutar_muchos`, el pool con escritura), y sigue corriendo por cron y jamas
desde una pregunta: recorrer 274 dias es caro y el resultado no depende de quien
pregunte.

El SQL vive en `barrido_sql` y la politica dia a dia en `barrido_politica`; este
modulo orquesta la corrida y reexporta lo de los tres.
"""
from __future__ import annotations

from datetime import date

from historico import config, db
from historico.calidad import pruebas  # noqa: F401
from historico.calidad.barrido_politica import _hallazgos_de_columnas, _hallazgos_del_dia  # noqa: F401
from historico.calidad.barrido_pruebas import (  # noqa: F401
    TIPOS_DE_PRUEBAS, _barrer_pruebas, _series_del_rango, _ventana_de,
)
from historico.calidad.barrido_sql import (  # noqa: F401
    _LIMPIAR_PRUEBAS, _LIMPIAR_RANGO, _UPSERT, _sql_por_columna, _sql_por_dia,
)

FUENTES = ("radiacion_sc_15s", "monitoreo_sc_electrico")

# Los tipos que produce ESTE modulo. La lista existe para acotar el borrado de
# abajo: `cielo.py` escribe `kt_imposible` sobre la misma fuente, y un DELETE por
# fuente se lo llevaba puesto en cada barrido (lo hacia en silencio, ademas: el
# resumen de la corrida seguia dando los mismos numeros).
TIPOS_PROPIOS = (
    "dia_incompleto", "hueco", "duplicado_timestamp", "cambio_de_cadencia",
    "columna_ausente", "nulos", "fuera_de_rango", "saturado_85",
    "constante_en_cero", "sensor_plano", "offset_nocturno",
)


def barrer(desde: date, hasta: date, fuentes=FUENTES) -> dict:
    """Barre [desde, hasta) y deja los hallazgos en el store. Idempotente.

    Devuelve el resumen de la corrida (cuantos dias y cuantos hallazgos por fuente,
    mas el de las seis familias de `calidad.pruebas` bajo la clave `pruebas`).
    """
    resumen = {}
    for fuente in fuentes:
        if fuente not in config.RANGOS:
            raise ValueError(f"fuente desconocida: {fuente!r}")

        dias = db.query(_sql_por_dia(fuente), (desde, hasta, config.FACTOR_HUECO))
        cols = {c["fecha"]: c for c in db.query(_sql_por_columna(fuente), (desde, hasta))}

        hallazgos: list[tuple] = []
        cadencia_previa = None
        for dia in dias:
            hallazgos += _hallazgos_del_dia(
                fuente, dia, cols.get(dia["fecha"], {}), cadencia_previa)
            cadencia_previa = dia.get("cadencia") or cadencia_previa

        db.ejecutar(_LIMPIAR_RANGO, (fuente, desde, hasta, list(TIPOS_PROPIOS)))
        db.ejecutar_muchos(_UPSERT, hallazgos)

        graves = sum(1 for h in hallazgos if h[4] == "grave")
        resumen[fuente] = {
            "dias_analizados": len(dias),
            "hallazgos": len(hallazgos),
            "graves": graves,
            "dias_sin_hallazgos": len(dias) - len({h[0] for h in hallazgos}),
        }
    # Va despues del recorrido por fuente y no antes: si `fuentes` trae una que no
    # existe, la corrida tiene que morir sin haber escrito nada.
    resumen["pruebas"] = _barrer_pruebas(desde, hasta)
    return resumen
