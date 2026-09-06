"""Fig. 5: la serie temporal de una variable con sus cuatro trazos.

El documento pide, sobre el mismo eje: el valor agregado (con su banda min-max),
la LINEA DE TENDENCIA, la MEDIA MOVIL y la BANDA DE DESVIACION ESTANDAR. Los
cuatro salen calculados de aca, punto por punto, porque **el frontend no calcula
estadistica**: si el navegador ajustara su propia recta, la consola y el agente
podrian discrepar sobre si una variable sube o baja, y esa clase de desacuerdo no
se nota hasta que alguien ya decidio algo con el.

Dos cosas que no son evidentes al leer el codigo:

* **Los buckets vacios se emiten igual**, con `valor: None` y `n: 0`. La rejilla la
  arma `fuente.rejilla` y no la consulta, porque el SQL solo puede devolver los
  buckets que existen y aca los que faltan son justamente el dato. Colapsar los
  huecos dibuja una serie continua sobre periodos en que el sistema no reporto.
* **La media movil se niega a promediar sobre un hueco.** Si en la ventana movil hay
  un bucket sin datos no hay valor: promediar tres dias y llamarlo media semanal
  inventa la suavidad que la media movil se supone que revela.
"""
from __future__ import annotations

from datetime import datetime

from historico import db
from historico.analitica import catalogo, fuente, resultado
from historico.analitica.ventana import Ventana

# Buckets que promedia la media movil. Siete es una semana con granularidad diaria,
# que es la escala en que se lee la estacionalidad sin borrar el detalle del dia.
BUCKETS_MEDIA_MOVIL = 7
# Alcanza para kt* (0 a 1,3) sin ensuciar una potencia en W.
DECIMALES = 4


def _agregados(v: Ventana, o: fuente.Origen) -> dict[str, dict]:
    """Estadistica por bucket, agregada EN LA BASE. Indexada por clave de bucket."""
    filas = db.query(
        f"""
        SELECT to_char(date_trunc(%s, "timestamp"), '{fuente.FORMATO_BUCKET_SQL}') AS bucket,
               avg({o.columna})::double precision         AS valor,
               min({o.columna})::double precision         AS minimo,
               max({o.columna})::double precision         AS maximo,
               stddev_samp({o.columna})::double precision AS desviacion,
               count({o.columna})                         AS n
        {fuente.donde(o)}
         GROUP BY 1
        """,
        (v.trunc, *v.sql),
    )
    return {f.pop("bucket"): f for f in filas}


def _ajuste_lineal(xs: list[float], ys: list[float]) -> tuple[float, float, float | None] | None:
    """Minimos cuadrados. None si no hay con que ajustar una recta (menos de dos
    puntos distintos en x). Devuelve (pendiente, intercepto, r2)."""
    n = len(xs)
    if n < 2:
        return None
    media_x, media_y = sum(xs) / n, sum(ys) / n
    sxx = sum((x - media_x) ** 2 for x in xs)
    if sxx == 0:
        return None
    sxy = sum((x - media_x) * (y - media_y) for x, y in zip(xs, ys))
    syy = sum((y - media_y) ** 2 for y in ys)
    pendiente = sxy / sxx
    # Serie perfectamente plana: la recta la explica entera y no explica nada. R2 es
    # 0/0, y devolver 1,0 haria pasar por ajuste excelente a una variable congelada.
    r2 = (sxy * sxy) / (sxx * syy) if syy else None
    return pendiente, media_y - pendiente * media_x, r2


def _media_movil(valores: list[float | None], buckets: int) -> list[float | None]:
    """Media movil de cola. Sin valor mientras la ventana no este COMPLETA."""
    salida: list[float | None] = []
    for i in range(len(valores)):
        tramo = valores[i - buckets + 1:i + 1] if i >= buckets - 1 else []
        salida.append(sum(tramo) / buckets if tramo and None not in tramo else None)
    return salida


def _redondear(v: float | None) -> float | None:
    return None if v is None else round(v, DECIMALES)


def reducir(buckets: list[datetime], agregados: dict[str, dict],
            media_movil: int = BUCKETS_MEDIA_MOVIL) -> dict:
    """El criterio, sin base de datos: alinear los agregados sobre la rejilla y
    derivar los cuatro trazos. Es la parte probable sin DB y donde vive la decision.

    Devuelve `{"puntos": [...], "tendencia": (pendiente, intercepto, r2) | None,
    "n_con_dato": int}`. La tendencia sale como tupla cruda y no como metrica porque
    quien la envuelve (`_serie_de`) es el que conoce la unidad de la variable.
    """
    if media_movil < 1:
        raise ValueError(f"la media movil necesita al menos 1 bucket, no {media_movil}")
    puntos = []
    for t in buckets:
        fila = agregados.get(t.strftime(fuente.FORMATO_BUCKET), {})
        valor, desv = fila.get("valor"), fila.get("desviacion")
        con_banda = valor is not None and desv is not None
        puntos.append({
            "t": t.strftime(fuente.FORMATO_BUCKET),
            "valor": _redondear(valor), "n": int(fila.get("n") or 0),
            "minimo": _redondear(fila.get("minimo")),
            "maximo": _redondear(fila.get("maximo")),
            "desviacion": _redondear(desv),
            "banda_inferior": _redondear(valor - desv) if con_banda else None,
            "banda_superior": _redondear(valor + desv) if con_banda else None,
        })

    dias = [(t - buckets[0]).total_seconds() / 86400 for t in buckets] if buckets else []
    con_dato = [(x, p["valor"]) for x, p in zip(dias, puntos) if p["valor"] is not None]
    ajuste = _ajuste_lineal([x for x, _ in con_dato], [y for _, y in con_dato])
    movil = _media_movil([p["valor"] for p in puntos], media_movil)
    for x, p, m in zip(dias, puntos, movil):
        p["media_movil"] = _redondear(m)
        p["tendencia"] = _redondear(ajuste[1] + ajuste[0] * x) if ajuste else None
    return {"puntos": puntos, "tendencia": ajuste, "n_con_dato": len(con_dato)}


def _resumen(puntos: list[dict], unidad: str) -> dict:
    """Los escalares de la serie. El min y el max salen de los extremos POR BUCKET,
    no de las medias: el pico del dia no es el promedio de la hora en que ocurrio."""
    n = sum(p["n"] for p in puntos)
    con_dato = [p for p in puntos if p["valor"] is not None]
    media = sum(p["valor"] * p["n"] for p in con_dato) / n if n and con_dato else None
    return {
        "media": resultado.metrica(_redondear(media), n, unidad),
        "minimo": resultado.metrica(min((p["minimo"] for p in con_dato), default=None),
                                    n, unidad),
        "maximo": resultado.metrica(max((p["maximo"] for p in con_dato), default=None),
                                    n, unidad),
    }


def _serie_de(o: fuente.Origen, agregados: dict[str, dict], buckets: list[datetime],
              media_movil: int) -> dict:
    """Arma la serie de UNA variable. Recibe los agregados YA consultados.

    La consulta no se hace aca adentro a proposito: `serie_temporal` las dispara
    todas a la vez (una por variable pedida) y despues reparte. Ver `db.en_paralelo`.
    """
    var = catalogo.obtener(o.clave)
    reducida = reducir(buckets, agregados, media_movil)
    ajuste = reducida.pop("tendencia")
    return {
        "clave": o.clave, "etiqueta": var.etiqueta, "unidad": var.unidad,
        "relacion": o.relacion, **reducida,
        "tendencia": {
            "pendiente": resultado.metrica(_redondear(ajuste[0]) if ajuste else None,
                                           reducida["n_con_dato"] if ajuste else 0,
                                           f"{var.unidad}/dia"),
            "intercepto": _redondear(ajuste[1]) if ajuste else None,
            "r2": _redondear(ajuste[2]) if ajuste and ajuste[2] is not None else None,
        },
        "resumen": _resumen(reducida["puntos"], var.unidad),
    }


def serie_temporal(v: Ventana, variables: str | list[str],
                   media_movil: int = BUCKETS_MEDIA_MOVIL) -> dict:
    """Fig. 5: una o varias variables agregadas a la granularidad de la ventana.

    Varias a la vez para poder superponerlas en el mismo eje. Cada clave se valida
    contra el catalogo: una desconocida levanta `catalogo.VariableDesconocida` y una
    sin fuente en la base levanta `fuente.FuenteAusente`, nunca una serie vacia muda.
    """
    claves = [variables] if isinstance(variables, str) else list(variables)
    if not claves:
        raise ValueError("hace falta al menos una variable para dibujar una serie")
    fuente.validar_tamano(v)
    buckets = fuente.rejilla(v)
    origenes = [fuente.origen(c) for c in claves]
    # Una consulta por variable pedida mas la de confianza, y ninguna depende de las
    # otras: en fila eran N+1 viajes al pooler de ~225 ms cada uno. Ver
    # `db.en_paralelo` y la cabecera de `historico.db`.
    confianza, *agregados = db.en_paralelo(
        lambda: fuente.confianza_de(v, claves),
        *[(lambda o=o: _agregados(v, o)) for o in origenes],
    )
    return resultado.sobre(
        v, confianza,
        buckets_media_movil=media_movil,
        series=[_serie_de(o, ag, buckets, media_movil)
                for o, ag in zip(origenes, agregados)],
    )
