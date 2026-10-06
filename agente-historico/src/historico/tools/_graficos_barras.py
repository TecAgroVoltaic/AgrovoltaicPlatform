"""Las barras de `graficar`: tres algoritmos distintos segun QUE se pide sumar.

Una barra es una cantidad por periodo, y "cantidad" no significa lo mismo para
todas las variables. Promediar el contador diario de energia daria la media de un
acumulador (un numero sin sentido fisico), y promediar la irradiancia esconde lo que
interesa de un mes, que es cuanta energia entro. Por eso se elige el algoritmo que
ya sirve a la vista equivalente:

  * contadores diarios de energia -> cierre del dia (`energia.por_dia`), sumado por bucket;
  * irradiancias en W/m2          -> irradiacion acumulada por mes (`distribucion`);
  * el resto                      -> media por bucket (`series.serie_temporal`).
"""
from __future__ import annotations

from dataclasses import replace

from historico import db
from historico.analitica import catalogo, correlacion, distribucion, energia, fuente, series
from historico.analitica.ventana import DIA, HORA, MES, Ventana
from historico.tools import _chartspec as cs
from historico.tools._ventana_grafico import POR, ajustar_al_tope, subtitulo

CONTADOR_DE_VIDA = "energia_total_wh"
UNIDAD_ENERGIA = energia.UNIDAD


def _resumen(series_: list[tuple[str, str, list]]) -> list[dict]:
    return [{"serie": clave, **cs.estadisticas(valores)} for clave, _, valores in series_]


def _armar(tipo_titulo: str, variables: list[catalogo.Variable], categorias: list[str],
           series_: list[tuple[str, str, list]], unidad: str, sub: str,
           v: Ventana, confianza: dict) -> tuple[dict, dict]:
    titulo = f"{tipo_titulo}: " + " y ".join(var.etiqueta for var in variables)
    grafico = cs.spec(cs.BARRAS, titulo, unidad, cs.barras(categorias, series_, unidad), sub)
    return grafico, {"granularidad": v.granularidad, "series": _resumen(series_),
                     "advertencia": confianza.get("advertencia")}


def _energia(v: Ventana, variables: list[catalogo.Variable]) -> tuple[dict, dict]:
    ajustada = ajustar_al_tope(v, minima=DIA)
    claves = [var.clave for var in variables]
    dias, confianza = db.en_paralelo(lambda: energia.por_dia(ajustada),
                                     lambda: correlacion.confianza_de(ajustada, *claves))
    rejilla = fuente.rejilla(ajustada)
    buckets = [t.date() for t in rejilla]
    categorias = [cs.etiqueta_bucket(t.strftime(fuente.FORMATO_BUCKET), ajustada.granularidad)
                  for t in rejilla]
    series_ = [(var.clave, var.etiqueta,
                cs.sumar_por_bucket(energia.cierre_por_dia(dias, var.clave), buckets,
                                    ajustada.granularidad))
               for var in variables]
    # La hora no es un periodo de cierre: pasar a dia no es "agregar por el tope".
    pedida = DIA if v.granularidad == HORA else v.granularidad
    sub = subtitulo(ajustada, f"energía {POR[ajustada.granularidad]}", pedida)
    return _armar("Energía", variables, categorias, series_, UNIDAD_ENERGIA, sub,
                  ajustada, confianza)


def _irradiacion(v: Ventana, variables: list[catalogo.Variable],
                 granularidad: str | None) -> tuple[dict, dict]:
    if granularidad not in (None, MES):
        raise ValueError("la irradiacion acumulada se agrega por mes; para la media por "
                         "dia u hora usa tipo 'serie'")
    mensual = replace(v, granularidad=MES)
    payloads = [distribucion.irradiacion_mensual(mensual, var.clave) for var in variables]
    categorias = [b["mes"] for b in payloads[0]["barras"]]
    series_ = [(var.clave, var.etiqueta, [b["irradiacion"]["valor"] for b in p["barras"]])
               for var, p in zip(variables, payloads)]
    sub = subtitulo(mensual, "irradiación acumulada por mes")
    return _armar("Irradiación", variables, categorias, series_,
                  distribucion.UNIDAD_IRRADIACION, sub, mensual, payloads[0]["confianza"])


def _media(v: Ventana, variables: list[catalogo.Variable]) -> tuple[dict, dict]:
    ajustada = ajustar_al_tope(v)
    payload = series.serie_temporal(ajustada, [var.clave for var in variables])
    categorias = [cs.etiqueta_bucket(p["t"], ajustada.granularidad)
                  for p in payload["series"][0]["puntos"]]
    series_ = [(s["clave"], s["etiqueta"], [p["valor"] for p in s["puntos"]])
               for s in payload["series"]]
    sub = subtitulo(ajustada, f"media {POR[ajustada.granularidad]}", v.granularidad)
    return _armar("Media", variables, categorias, series_, variables[0].unidad, sub,
                  ajustada, payload["confianza"])


def graficar(v: Ventana, variables: list[catalogo.Variable],
             granularidad: str | None) -> tuple[dict, dict]:
    """(ChartSpec de barras, resumen para el LLM). `variables` ya comparten unidad."""
    claves = [var.clave for var in variables]
    if CONTADOR_DE_VIDA in claves:
        raise ValueError(f"{CONTADOR_DE_VIDA} es el contador de VIDA del inversor y no "
                         f"cierra por dia; para energia por periodo usa energia_hoy_wh")
    if all(c in energia.CIERRE_DIARIO for c in claves):
        return _energia(v, variables)
    if variables[0].unidad == distribucion.UNIDAD_IRRADIANCIA:
        return _irradiacion(v, variables, granularidad)
    return _media(v, variables)
