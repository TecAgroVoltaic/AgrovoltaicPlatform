"""Punto 3: criterios estadisticos de nubes respecto a la irradiancia.

La irradiancia cruda no dice si hubo nubes: la mayor parte de su forma es la
parabola del sol, que depende de la hora y del dia del año, no del cielo. Para
hablar de nubes hay que quitar esa parabola, y eso es el **indice de cielo
despejado**:

    kt = irradiancia medida / irradiancia teorica con cielo despejado

Con kt, "0,9 a mediodia" y "0,9 a las 7 de la mañana" significan lo mismo: cielo
despejado. El clear-sky ya esta materializado en `radiacion_sc_clearsky` (Ineichen
con turbidez de Linke, pvlib), asi que aca es una division.

Pero kt solo dice CUANTA luz llego, no COMO llego. Un dia con kt medio 0,5 puede
ser una capa uniforme de nubes toda la mañana o un sol entrando y saliendo cada dos
minutos, y para un sistema fotovoltaico no son lo mismo ni de lejos. Eso lo separa
el **indice de variabilidad** (VI, de Stein/Hansen/Riley): el largo de arco de la
curva medida dividido por el de la curva de cielo despejado. Un dia perfectamente
despejado da VI ~ 1; el paso de nubes lo dispara.

kt y VI juntos dan la clasificacion del dia:

    kt alto  + VI bajo  -> despejado
    kt bajo  + VI bajo  -> cubierto (capa uniforme)
    VI alto             -> variable (intermitente, el peor caso para el inversor)
    resto               -> parcial

Y hay un tercer uso, que es el que engancha con el punto 1: **kt > 1,2 es
fisicamente imposible**, mas energia que la que manda el sol con cielo despejado.
Eso no es una nube, es un dato malo o una calibracion mal puesta. O sea que el
criterio de nubes es tambien un detector de datos invalidos, y del mejor tipo,
porque no depende de un umbral inventado sino de la fisica.

OJO: se lee `v_sc_radiacion_calibrada`, que anula todo lo anterior al 2025-07-01
(el error de irradiancia que el equipo corrigio a mediados de 2025, ver
docs/memoria/decisiones/respuestas-leo-cardinale.md). Antes de esa fecha no hay
caracterizacion de cielo, y es correcto que no la haya.
"""
from __future__ import annotations

import json
from datetime import date

from historico import config, db

_UPSERT_CIELO = """
    INSERT INTO cielo_diario
        (fecha, n_muestras_dia, kt_medio, kt_mediana, frac_despejado, frac_parcial,
         frac_cubierto, indice_variabilidad, clase, energia_medida_whm2,
         energia_cs_whm2, calculado_en)
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, now())
    ON CONFLICT (fecha) DO UPDATE SET
        n_muestras_dia = EXCLUDED.n_muestras_dia,
        kt_medio = EXCLUDED.kt_medio, kt_mediana = EXCLUDED.kt_mediana,
        frac_despejado = EXCLUDED.frac_despejado, frac_parcial = EXCLUDED.frac_parcial,
        frac_cubierto = EXCLUDED.frac_cubierto,
        indice_variabilidad = EXCLUDED.indice_variabilidad, clase = EXCLUDED.clase,
        energia_medida_whm2 = EXCLUDED.energia_medida_whm2,
        energia_cs_whm2 = EXCLUDED.energia_cs_whm2,
        calculado_en = EXCLUDED.calculado_en
"""

_UPSERT_HALLAZGO = """
    INSERT INTO hallazgos_calidad
        (fecha, fuente, variable, tipo, severidad, n_afectadas, detalle, detectado_en)
    VALUES (%s, 'radiacion_sc_15s', 'irradiancia_incidente', 'kt_imposible',
            %s, %s, %s::jsonb, now())
    ON CONFLICT (fecha, fuente, variable, tipo) DO UPDATE
       SET severidad = EXCLUDED.severidad, n_afectadas = EXCLUDED.n_afectadas,
           detalle = EXCLUDED.detalle, detectado_en = EXCLUDED.detectado_en
"""

# DOS cuidados que no son opcionales, los dos descubiertos corriendo esto:
#
# 1. Las muestras con kt > KT_IMPOSIBLE se EXCLUYEN de la estadistica. Si no, un
#    dia con la calibracion rota daba kt medio 5,67, o sea que el promedio diario
#    reportaba mas de cinco veces la energia del cielo despejado. Se cuentan
#    aparte, como hallazgo: son un problema de calidad, no una caracteristica del
#    cielo, y mezclarlas hace que un dato malo se disfrace de dia soleado.
#
# 2. El VI se calcula sobre una REJILLA UNIFORME de 5 minutos, no sobre las
#    muestras crudas. El indice de variabilidad esta definido para un intervalo
#    fijo, y el historico tiene 33 cadencias distintas. Calculado en crudo daba
#    VI 4,2 con cadencia de 315 s y VI 23,8 con cadencia de 42 s **para el mismo
#    kt**: el numerador no encoge al afinar el muestreo (el ruido de nubes es de
#    alta frecuencia) pero el denominador si (el cielo despejado es suave), asi
#    que el cociente medía la cadencia del logger en vez del cielo. Con la rejilla
#    los dias son comparables entre si. Se usan 5 min porque es el regimen
#    dominante (195 de 274 dias): los dias mas finos se agregan hacia abajo, que
#    es honesto; inventar muestras hacia arriba no lo seria.
_SQL_CIELO = """
    WITH m AS (
        SELECT c."timestamp" AS ts,
               c."timestamp"::date AS fecha,
               r.irradiancia_incidente_wm2 AS ghi,
               c.cs_ghi_wm2 AS cs,
               r.irradiancia_incidente_wm2 / c.cs_ghi_wm2 AS kt
          FROM v_sc_radiacion_calibrada r
          JOIN radiacion_sc_clearsky   c USING ("timestamp")
         WHERE c."timestamp" >= %s AND c."timestamp" < %s
           AND c.cs_ghi_wm2 > %s
           AND r.irradiancia_incidente_wm2 IS NOT NULL
    ),
    imposibles AS (
        SELECT fecha, count(*) AS n_imposible, max(kt) AS kt_max, count(*) AS _n
          FROM m WHERE kt > %s GROUP BY fecha
    ),
    totales AS (
        SELECT fecha, count(*) AS n_total FROM m GROUP BY fecha
    ),
    rejilla AS (
        SELECT fecha,
               to_timestamp(floor(EXTRACT(epoch FROM ts) / 300) * 300) AS t5,
               avg(ghi) AS ghi, avg(cs) AS cs, avg(kt) AS kt
          FROM m
         WHERE kt <= %s
         GROUP BY 1, 2
    ),
    d AS (
        SELECT fecha, kt,
               ghi - lag(ghi) OVER w AS d_ghi,
               cs  - lag(cs)  OVER w AS d_cs,
               EXTRACT(epoch FROM (t5 - lag(t5) OVER w)) / 60.0 AS d_min,
               (ghi + lag(ghi) OVER w) / 2.0 AS trap_ghi,
               (cs  + lag(cs)  OVER w) / 2.0 AS trap_cs
          FROM rejilla
        WINDOW w AS (PARTITION BY fecha ORDER BY t5)
    )
    SELECT t.fecha,
           count(d.kt)                                                 AS n,
           t.n_total,
           COALESCE(i.n_imposible, 0)                                  AS n_kt_imposible,
           i.kt_max,
           avg(d.kt)                                                   AS kt_medio,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY d.kt)           AS kt_mediana,
           count(*) FILTER (WHERE d.kt >= %s)::float
             / nullif(count(d.kt), 0)                                  AS frac_despejado,
           count(*) FILTER (WHERE d.kt >= %s AND d.kt < %s)::float
             / nullif(count(d.kt), 0)                                  AS frac_parcial,
           count(*) FILTER (WHERE d.kt < %s)::float
             / nullif(count(d.kt), 0)                                  AS frac_cubierto,
           sum(sqrt(d.d_ghi * d.d_ghi + d.d_min * d.d_min))
             / nullif(sum(sqrt(d.d_cs * d.d_cs + d.d_min * d.d_min)), 0) AS vi,
           sum(d.trap_ghi * d.d_min / 60.0)                            AS energia_medida,
           sum(d.trap_cs  * d.d_min / 60.0)                            AS energia_cs
      FROM totales t
      LEFT JOIN d          ON d.fecha = t.fecha
      LEFT JOIN imposibles i ON i.fecha = t.fecha
     GROUP BY t.fecha, t.n_total, i.n_imposible, i.kt_max
     ORDER BY t.fecha
"""


def clasificar(kt_medio: float | None, vi: float | None) -> str:
    """Clase del dia a partir de cuanta luz llego (kt) y que tan a saltos (VI)."""
    if kt_medio is None:
        return "sin_datos"
    if vi is not None and vi >= config.VI_VARIABLE:
        return "variable"
    if kt_medio >= config.KT_DESPEJADO:
        return "despejado"
    if kt_medio < config.KT_CUBIERTO:
        return "cubierto"
    return "parcial"


def caracterizar(desde: date, hasta: date) -> dict:
    """Calcula el cielo de cada dia de [desde, hasta) y lo guarda. Idempotente.

    De paso deja los hallazgos `kt_imposible`, que son datos invalidos detectados
    por fisica y no por umbral.
    """
    filas = db.query(_SQL_CIELO, (
        desde, hasta, config.CS_MINIMO_WM2,
        config.KT_IMPOSIBLE,          # imposibles: se apartan
        config.KT_IMPOSIBLE,          # rejilla: solo las validas
        config.KT_DESPEJADO,
        config.KT_CUBIERTO, config.KT_DESPEJADO,
        config.KT_CUBIERTO,
    ))

    cielo, hallazgos = [], []
    for f in filas:
        clase = clasificar(f["kt_medio"], f["vi"])
        cielo.append((
            f["fecha"], f["n"], f["kt_medio"], f["kt_mediana"],
            f["frac_despejado"], f["frac_parcial"], f["frac_cubierto"],
            f["vi"], clase, f["energia_medida"], f["energia_cs"],
        ))
        if f["n_kt_imposible"]:
            # Grave si es masivo (calibracion rota); aviso si son picos sueltos.
            proporcion = f["n_kt_imposible"] / f["n_total"]
            hallazgos.append((
                f["fecha"],
                "grave" if proporcion > 0.05 else "aviso",
                f["n_kt_imposible"],
                json.dumps({
                    "muestras_imposibles": f["n_kt_imposible"],
                    "de": f["n_total"],
                    "proporcion": round(proporcion, 4),
                    "kt_max": round(f["kt_max"], 2) if f["kt_max"] else None,
                    "umbral": config.KT_IMPOSIBLE,
                    "nota": "kt sobre 1,2 es mas energia que la de cielo despejado: "
                            "dato invalido o calibracion mal puesta, no una nube",
                }),
            ))

    db.ejecutar_muchos(_UPSERT_CIELO, cielo)
    db.ejecutar_muchos(_UPSERT_HALLAZGO, hallazgos)

    clases: dict[str, int] = {}
    for c in cielo:
        clases[c[8]] = clases.get(c[8], 0) + 1
    return {
        "dias_caracterizados": len(cielo),
        "por_clase": clases,
        "dias_con_kt_imposible": len(hallazgos),
    }
