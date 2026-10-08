"""El bloque de confianza acotado a las variables de un grafico."""
from __future__ import annotations

from historico.analitica import catalogo
from historico.analitica.ventana import Ventana
from historico.calidad import contexto


def confianza_de(v: Ventana, claves: list[str]) -> dict:
    """El bloque de fiabilidad acotado a las variables de las que depende el grafico.

    Los nombres se traducen con `catalogo.para_confianza`, que es la puerta unica:
    `hallazgos_calidad` guarda `irradiancia_incidente` y el catalogo expone
    `irradiancia_incidente_wm2`, asi que pasar la clave cruda encontraba CERO
    hallazgos de los 321 reales y devolvia una confianza impecable justo cuando la
    irradiancia estaba rota.

    Y se dice aparte cuales variables el barrido no vigila: que no tengan hallazgos
    no significa que esten limpias, significa que nadie las miro, y hoy las dos
    cosas se ven igual.
    """
    variables, fuente = catalogo.para_confianza(*claves)
    desde, hasta = v.sql
    bloque = contexto.confianza(desde, hasta, variables, fuente)
    ciegas = catalogo.sin_vigilancia(*claves)
    if ciegas:
        bloque["sin_vigilancia"] = {
            "variables": ciegas,
            "nota": ("el barrido de calidad NO revisa estas variables una por una: "
                     "que no tengan hallazgos no dice que esten bien, dice que nadie "
                     "las miro. Para ellas la confianza solo mide cobertura de dias "
                     "y hallazgos de dia entero"),
        }
    return bloque
