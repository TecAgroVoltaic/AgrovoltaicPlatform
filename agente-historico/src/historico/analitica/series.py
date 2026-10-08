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

El criterio puro (alinear sobre la rejilla y derivar los trazos) vive en `trazos`;
aca quedan la consulta por bucket y la composicion contra la base.
"""
from __future__ import annotations

from historico import db
from historico.analitica import fuente, resultado
from historico.analitica.trazos import (  # noqa: F401 — se reexportan los nombres de siempre
    BUCKETS_MEDIA_MOVIL,
    DECIMALES,
    _ajuste_lineal,
    _media_movil,
    _redondear,
    _resumen,
    _serie_de,
    reducir,
)
from historico.analitica.ventana import Ventana


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
