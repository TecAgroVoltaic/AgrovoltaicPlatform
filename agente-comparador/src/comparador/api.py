"""API HTTP del Comparador — expone el store de hallazgos para la consola.

Transporte puro: valida en el borde, consulta, devuelve. NO detecta nada; la
deteccion es del barrido (`calidad.py` y `cielo.py`), que corre por lotes y deja
los hallazgos en la base. Este servicio solo los sirve.

Esa separacion es a proposito y es la misma que ya sigue el resto del proyecto:
si la consola disparara la deteccion, cada visita a la pantalla recorreria los
274 dias, y ademas el resultado dependeria de quien mire y cuando.

Seguridad: si COMPARADOR_API_KEY esta en el entorno, todo menos /health exige el
header `x-api-key` (comparacion en tiempo constante).
"""
from __future__ import annotations

import os
import secrets
from datetime import date

from fastapi import Depends, FastAPI, Header, HTTPException, Query, status

from comparador import db, reporte

ENV_API_KEY = "COMPARADOR_API_KEY"

app = FastAPI(
    title="Comparador San Carlos",
    description="Calidad del historico PV y caracterizacion del cielo.",
    version="0.1.0",
)


def _auth(x_api_key: str | None = Header(default=None)) -> None:
    esperada = os.environ.get(ENV_API_KEY)
    if not esperada:
        return
    if not x_api_key or not secrets.compare_digest(x_api_key, esperada):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "x-api-key invalida o ausente")


def _rango(desde: str | None, hasta: str | None) -> tuple[date, date]:
    """Fechas pedidas o todo el rango. `hasta` es EXCLUSIVO, como en todo el repo."""
    lim = db.uno(
        'SELECT min(fecha) AS d0, max(fecha) AS d1 FROM ventana_solar'
    )
    if not lim.get("d0"):
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "falta la ventana solar: corre `python -m comparador sol`")
    try:
        d0 = date.fromisoformat(desde) if desde else date.fromisoformat(lim["d0"])
        d1 = date.fromisoformat(hasta) if hasta else date.fromisoformat(lim["d1"])
    except ValueError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"fecha invalida: {e}")
    if d1 < d0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            f"rango invertido: {d0} > {d1}")
    return d0, d1


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/calidad/resumen", dependencies=[Depends(_auth)])
def resumen(desde: str | None = Query(None), hasta: str | None = Query(None)) -> dict:
    """Cobertura, cielo y el conteo de hallazgos por tipo. Lo de la cabecera."""
    d0, d1 = _rango(desde, hasta)
    cobertura = db.uno(
        """
        SELECT (SELECT count(DISTINCT "timestamp"::date) FROM radiacion_sc_15s
                 WHERE "timestamp" >= %s AND "timestamp" < %s + 1) AS dias_con_datos,
               (SELECT count(*) FROM ventana_solar
                 WHERE fecha >= %s AND fecha <= %s)              AS dias_calendario
        """,
        (d0, d1, d0, d1),
    )
    cielo = db.uno(
        """
        SELECT count(*)                                    AS dias,
               avg(kt_medio)                               AS kt_medio,
               avg(indice_variabilidad)                    AS vi_medio,
               count(*) FILTER (WHERE clase = 'despejado') AS despejados,
               count(*) FILTER (WHERE clase = 'parcial')   AS parciales,
               count(*) FILTER (WHERE clase = 'cubierto')  AS cubiertos,
               count(*) FILTER (WHERE clase = 'variable')  AS variables,
               100.0 * sum(energia_medida_whm2)
                     / nullif(sum(energia_cs_whm2), 0)     AS pct_del_techo
          FROM cielo_diario WHERE fecha >= %s AND fecha <= %s
        """,
        (d0, d1),
    )
    tipos = db.query(
        """
        SELECT fuente, tipo, severidad,
               count(DISTINCT fecha)    AS dias,
               count(DISTINCT variable) AS variables,
               sum(n_afectadas)         AS lecturas,
               min(fecha)               AS primer_dia,
               max(fecha)               AS ultimo_dia
          FROM hallazgos_calidad
         WHERE fecha >= %s AND fecha <= %s
         GROUP BY fuente, tipo, severidad
         ORDER BY (severidad = 'grave') DESC, dias DESC
        """,
        (d0, d1),
    )
    return {"periodo": {"desde": d0.isoformat(), "hasta": d1.isoformat()},
            "cobertura": cobertura, "cielo": cielo, "tipos": tipos}


@app.get("/calidad/dias", dependencies=[Depends(_auth)])
def dias(desde: str | None = Query(None), hasta: str | None = Query(None)) -> dict:
    """Un renglon por dia de CALENDARIO, no por dia con datos.

    Los dias sin ninguna fila tienen que aparecer: son la mitad del periodo (274
    de 569) y es justo lo que hay que ver. Por eso se sale de `ventana_solar`,
    que los tiene todos, y no de las tablas de datos.
    """
    d0, d1 = _rango(desde, hasta)
    filas = db.query(
        """
        WITH rad AS (SELECT "timestamp"::date f, count(*) n FROM radiacion_sc_15s
                      WHERE "timestamp" >= %s AND "timestamp" < %s + 1 GROUP BY 1),
             ele AS (SELECT "timestamp"::date f, count(*) n FROM monitoreo_sc_electrico
                      WHERE "timestamp" >= %s AND "timestamp" < %s + 1 GROUP BY 1),
             filas_dia AS (
                SELECT f, 'radiacion_sc_15s' AS fuente, n FROM rad
                UNION ALL
                SELECT f, 'monitoreo_sc_electrico',      n FROM ele),
             -- "material" = el hallazgo toca al menos una quinta parte de las
             -- lecturas de su fuente ese dia, o es de los que invalidan el dia
             -- entero por naturaleza (falta media jornada, timestamps repetidos).
             hall AS (
                SELECT h.fecha f, h.fuente,
                       count(*) FILTER (WHERE h.severidad = 'grave') AS graves,
                       count(*) FILTER (WHERE h.severidad = 'aviso') AS avisos,
                       count(*) FILTER (
                           WHERE h.severidad = 'grave' AND (
                             h.tipo IN ('dia_incompleto','duplicado_timestamp')
                             OR h.n_afectadas >= 0.2 * COALESCE(fd.n, 0)
                           )) AS materiales
                  FROM hallazgos_calidad h
                  LEFT JOIN filas_dia fd ON fd.f = h.fecha AND fd.fuente = h.fuente
                 GROUP BY h.fecha, h.fuente)
        SELECT v.fecha,
               COALESCE(rad.n, 0) AS filas_radiacion,
               COALESCE(ele.n, 0) AS filas_electrico,
               COALESCE(hr.graves, 0) AS graves_rad, COALESCE(hr.avisos, 0) AS avisos_rad,
               COALESCE(hr.materiales, 0) AS materiales_rad,
               COALESCE(he.graves, 0) AS graves_ele, COALESCE(he.avisos, 0) AS avisos_ele,
               COALESCE(he.materiales, 0) AS materiales_ele,
               c.clase, c.kt_medio, c.indice_variabilidad
          FROM ventana_solar v
          LEFT JOIN rad  ON rad.f = v.fecha
          LEFT JOIN ele  ON ele.f = v.fecha
          LEFT JOIN hall hr ON hr.f = v.fecha AND hr.fuente = 'radiacion_sc_15s'
          LEFT JOIN hall he ON he.f = v.fecha AND he.fuente = 'monitoreo_sc_electrico'
          LEFT JOIN cielo_diario c ON c.fecha = v.fecha
         WHERE v.fecha >= %s AND v.fecha <= %s
         ORDER BY v.fecha
        """,
        (d0, d1, d0, d1, d0, d1),
    )

    def _veredicto(filas_del_dia, materiales, graves, avisos) -> str:
        """El veredicto se decide ACA y no en la vista.

        Si lo calculara el cliente, la consola y el reporte podrian discrepar sobre
        si un dia sirve. Y "grave" NO es cualquier hallazgo grave: un dia no deja de
        servir porque 3 de 144 lecturas de una de trece columnas se salieran de
        rango. Grave es cuando el problema toca una parte material del dia.
        """
        if not filas_del_dia:
            return "sin_datos"
        if materiales:
            return "grave"
        if graves or avisos:
            return "aviso"
        return "ok"

    for f in filas:
        f["veredicto_radiacion"] = _veredicto(
            f["filas_radiacion"], f["materiales_rad"], f["graves_rad"], f["avisos_rad"])
        f["veredicto_electrico"] = _veredicto(
            f["filas_electrico"], f["materiales_ele"], f["graves_ele"], f["avisos_ele"])
        # El del dia es el peor de los dos: si una de las dos fuentes no sirve, el
        # dia no sirve entero para cruzar irradiancia contra generacion.
        orden = ["ok", "aviso", "grave", "sin_datos"]
        f["veredicto"] = max((f["veredicto_radiacion"], f["veredicto_electrico"]),
                             key=orden.index)
    return {"periodo": {"desde": d0.isoformat(), "hasta": d1.isoformat()}, "dias": filas}


@app.get("/calidad/hallazgos", dependencies=[Depends(_auth)])
def hallazgos(
    fecha: str | None = Query(None, description="un dia puntual (ISO)"),
    tipo: str | None = Query(None),
    desde: str | None = Query(None),
    hasta: str | None = Query(None),
    limit: int = Query(200, ge=1, le=1000),
) -> dict:
    """El detalle. Filtrable por dia o por tipo."""
    if fecha:
        d0 = d1 = _rango(fecha, fecha)[0]
    else:
        d0, d1 = _rango(desde, hasta)
    cond, params = ["fecha >= %s", "fecha <= %s"], [d0, d1]
    if tipo:
        cond.append("tipo = %s")
        params.append(tipo)
    filas = db.query(
        f"""SELECT fecha, fuente, variable, tipo, severidad, n_afectadas, detalle
              FROM hallazgos_calidad
             WHERE {' AND '.join(cond)}
             ORDER BY (severidad = 'grave') DESC, fecha DESC, tipo, variable
             LIMIT %s""",
        tuple(params) + (limit,),
    )
    return {"hallazgos": filas, "limite": limit, "truncado": len(filas) == limit}


@app.get("/cielo", dependencies=[Depends(_auth)])
def cielo(desde: str | None = Query(None), hasta: str | None = Query(None)) -> dict:
    """La serie diaria de cielo: kt, variabilidad, clase y energias."""
    d0, d1 = _rango(desde, hasta)
    return {"dias": db.query(
        """SELECT fecha, n_muestras_dia, kt_medio, kt_mediana, frac_despejado,
                  frac_parcial, frac_cubierto, indice_variabilidad, clase,
                  energia_medida_whm2, energia_cs_whm2
             FROM cielo_diario WHERE fecha >= %s AND fecha <= %s ORDER BY fecha""",
        (d0, d1))}


@app.get("/reporte", dependencies=[Depends(_auth)])
def texto(desde: str | None = Query(None), hasta: str | None = Query(None)) -> dict:
    """El mismo informe que imprime el CLI, para poder copiarlo tal cual."""
    from datetime import timedelta
    d0, d1 = _rango(desde, hasta)
    return {"texto": reporte.generar(d0, d1 + timedelta(days=1))}
