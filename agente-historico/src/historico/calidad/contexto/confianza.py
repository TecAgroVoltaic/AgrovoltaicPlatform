"""El bloque `confianza`: UN viaje a la base, cache con coalescencia y la reduccion."""
from __future__ import annotations

from historico import cache, db
from historico.calidad.contexto.criterios import TIPOS_DE_DISPONIBILIDAD
from historico.calidad.contexto.reduccion import reducir

# ── Los tres insumos de `confianza`, en UN SOLO viaje ────────────────────────
# Eran tres consultas seguidas (calendario, filas por dia, hallazgos) y ninguna
# depende de las otras. Contra el pooler de Supabase eso costaba tres idas y
# vueltas de ~225 ms para un bloque que viaja DENTRO de casi toda respuesta
# agregada: medido, 0,595 s cada vez que alguien pedia cualquier endpoint de
# analitica. Ver la cabecera de `historico.db`: aca manda la latencia, no el SQL.
#
# Van como subconsultas escalares con `json_agg` y no como tres `UNION ALL` con
# columnas nulas de relleno porque asi cada bloque conserva su FORMA (una lista de
# fechas, una de tripletas, una de objetos) y `reducir` sigue recibiendo lo mismo
# que antes, sin ningun desarmado a mano que se pueda equivocar de columna.
#
# Las fechas salen de `json_agg` como texto ISO ('2026-05-03'), que es exactamente
# lo que devolvia `db.query` (su `_limpiar` convierte date -> isoformat). O sea que
# las claves de `filas` y las fechas de `hallazgos` siguen cruzando igual: si algun
# dia esto devolviera `date`, los diccionarios dejarian de casar EN SILENCIO y
# todos los dias saldrian utilizables.
#
# Los hallazgos se acotan a las variables de las que depende la respuesta, MENOS
# los de disponibilidad, que vienen siempre. Que la planta estuviera parada no es
# un hecho de `voltaje_vac`: es un hecho de la planta, y le importa a cualquier
# pregunta sobre energia aunque las columnas AC no aparezcan en ella. Acotarlos
# por variable los haria invisibles justo en las preguntas donde hacen falta.
_SQL_CONFIANZA = """
    SELECT
      (SELECT coalesce(json_agg(fecha ORDER BY fecha), '[]'::json)
         FROM ventana_solar
        WHERE fecha >= %s AND fecha < %s)                         AS calendario,
      (SELECT coalesce(json_agg(json_build_array(f, fuente, n)), '[]'::json)
         FROM (SELECT "timestamp"::date AS f, 'radiacion_sc_15s' AS fuente,
                      count(*) AS n
                 FROM radiacion_sc_15s
                WHERE "timestamp" >= %s AND "timestamp" < %s GROUP BY 1
               UNION ALL
               SELECT "timestamp"::date, 'monitoreo_sc_electrico', count(*)
                 FROM monitoreo_sc_electrico
                WHERE "timestamp" >= %s AND "timestamp" < %s GROUP BY 1) t) AS filas,
      (SELECT coalesce(json_agg(json_build_object(
                 'fecha', fecha, 'fuente', fuente, 'variable', variable,
                 'tipo', tipo, 'severidad', severidad,
                 'n_afectadas', n_afectadas)), '[]'::json)
         FROM hallazgos_calidad
        WHERE fecha >= %s AND fecha < %s
          AND (variable = ANY(%s) OR variable = '*' OR tipo = ANY(%s)))  AS hallazgos
"""

# El bloque `confianza` se repite en casi toda respuesta agregada, y una sola vista
# de la consola lo pide varias veces con los MISMOS argumentos (`Promise.all` de
# cinco endpoints sobre el mismo rango). El cache no esta tanto por el TTL como por
# la COALESCENCIA: esas cinco peticiones simultaneas terminan haciendo UNA consulta.
# La clave, el TTL y que pasa si el barrido corre con entradas vivas estan
# explicados en `historico.cache`; el resumen es que la ventana en la que se podria
# servir un veredicto viejo nunca supera el TTL, y que si el barrido corre en ESTE
# proceso (el CLI) la invalidacion es inmediata.
_CACHE = cache.registrar(cache.CacheBreve())


def confianza(desde: str, hasta: str, variables: list[str] | None = None,
              fuente: str | None = None) -> dict:
    """El bloque que incrusta toda herramienta que agregue sobre un periodo.

    `variables` son las columnas de las que depende la respuesta, y NO es opcional
    por comodidad: sin ellas el veredicto condena el periodo entero porque OTRA
    columna de la misma tabla esta rota.

    Eso no es teorico, es lo que paso al probarlo. Enero 2026 daba "0 de 31 dias
    utilizables" para la energia DC, cuando `potencia_pv1_w` y `potencia_pv2_w`
    estaban impecables: los graves eran de `frecuencia_hz`, `temperatura_inversor_c`,
    `potencia_total_wac` y los dos DS18B20 muertos. Un veredicto que marca todo en
    rojo no distingue nada, y ademas es falso.

    Los hallazgos de dia entero (`variable = '*'`, como `dia_incompleto` o
    `duplicado_timestamp`) SI cuentan siempre: afectan a todas las columnas.

    La salida trae ademas el bloque `disponibilidad`, que NO entra en el veredicto
    y responde otra pregunta: cuantos dias del periodo tuvo la planta parada. Ver
    la nota de TIPOS_DE_DISPONIBILIDAD.

    Lo que devuelve es SIEMPRE un dict propio del llamador (el cache entrega
    copias): varios le agregan claves encima (`vigilancia`, `sin_vigilancia`, una
    `advertencia` propia), y compartir el objeto guardado haria que la respuesta
    dependiera de quien pregunto antes.
    """
    variables = list(variables or [])
    # El orden de `variables` es parte de la clave y no se normaliza: `reducir` lo
    # usa para el desglose `por_variable`, asi que dos ordenes distintos son dos
    # preguntas distintas aunque casi siempre den lo mismo.
    clave = (desde, hasta, tuple(variables), fuente)
    return _CACHE.obtener(clave, lambda: _consultar(desde, hasta, variables, fuente))


def _consultar(desde: str, hasta: str, variables: list[str],
               fuente: str | None) -> dict:
    """El calculo de verdad, sin cache: UN viaje a la base y la reduccion pura."""
    fila = db.uno(_SQL_CONFIANZA, (
        desde, hasta,                                             # calendario
        desde, hasta, desde, hasta,                               # filas por dia
        desde, hasta, variables, list(TIPOS_DE_DISPONIBILIDAD),   # hallazgos
    ))
    calendario = fila.get("calendario") or []
    if not calendario:
        return reducir([], {}, [], variables, fuente)
    return reducir(
        calendario,
        {(f, fnt): n for f, fnt, n in (fila.get("filas") or [])},
        fila.get("hallazgos") or [],
        variables, fuente,
    )
