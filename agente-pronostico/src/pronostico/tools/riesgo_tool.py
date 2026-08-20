"""Tool `riesgo_de_nubes` — cuanto confiar en el pronostico, y por que.

Que la separa de las otras: `diagnosticar_condiciones` describe COMO VIENE el
cielo; esta dice QUE TAN SEGUIDO CAMBIA a esta hora y EN QUE DIRECCION. Son
preguntas distintas y la segunda es la que el agente no podia responder.

Lo que NO hace, a proposito: no predice si va a haber nubes. Medido sobre 78
dias, anticipar el cambio desde el sensor da correlacion 0,24 a 1 h y 0,08 a
6 h, y la nubosidad de los modelos numericos no lo predice en absoluto. Una tool
que devolviera "probabilidad de nube" para mover el valor pronosticado estaria
inventando una certeza que los datos no respaldan.

Lo que si hace, porque esta medido: dar el material para graduar la CONFIANZA. El
error del metodo se concentra en los cambios de cielo (a 1 h, el 28 % del tiempo
produce el 52 % del error) y es ASIMETRICO segun la direccion: al taparse
sobre-estima (+181 W/m2), al abrirse sub-estima (-233). Saber cual de los dos
acecha a esta hora cambia como se lee el pronostico.
"""
from __future__ import annotations

from pronostico.domain import Variable
from pronostico.forecasters import riesgo

SCHEMA = {
    "name": "riesgo_de_nubes",
    "description": (
        "Dice que tan confiable es un pronostico para un momento dado: en que regimen viene "
        "el cielo (calmo / medio / turbulento) y con que frecuencia historica el cielo cambia "
        "fuerte A ESA HORA, separado por direccion (se tapa o se abre). NO predice si va a "
        "haber nubes: eso no se puede anticipar y no lo intenta. Usala para declarar tu "
        "confianza con evidencia y para explicar de que lado podria fallar el numero, no para "
        "cambiar el numero. Es especialmente util en horizontes cortos (hasta 1-2 h), donde el "
        "estado actual del cielo todavia informa."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "variable": {
                "type": "string",
                "enum": [Variable.IRRADIANCIA.value],
                "description": ("Solo 'irradiancia': la humedad de suelo no tiene nubes ni "
                                "cielo despejado con que medir un regimen."),
            },
            "instante": {
                "type": "string",
                "description": "Momento sobre el que se quiere el riesgo, ISO ('2026-07-22T14:00').",
            },
            "horizonte_seg": {
                "type": "integer", "minimum": 60, "maximum": 21600,
                "description": ("Con cuanta anticipacion se pronostica. Define sobre que "
                                "lapso se mide la probabilidad de cambio."),
            },
        },
        "required": ["variable", "instante", "horizonte_seg"],
        "additionalProperties": False,
    },
}


def run(variable: str, instante: str, horizonte_seg: int) -> dict:
    """El riesgo, mas la guia de como convertirlo en una confianza declarada.

    El corte de datos es `instante - horizonte_seg`, igual que en `predecir`: si
    mirara hasta el instante mismo, estaria usando informacion que en el momento
    de pronosticar no existia.
    """
    import pandas as pd

    from pronostico import config

    t = pd.Timestamp(instante)
    t = t.tz_localize(config.TZ) if t.tz is None else t.tz_convert(config.TZ)
    corte = t - pd.Timedelta(seconds=int(horizonte_seg))

    salida = riesgo.evaluar(t, horizonte_seg, variable, antes_de=corte)
    salida["datos_visibles_hasta"] = corte.isoformat()
    salida["asimetria_del_error"] = {
        "si_se_tapa": "el pronostico queda ALTO (medido: sobre-estima ~180 W/m2 a 1 h)",
        "si_se_abre": "el pronostico queda BAJO (medido: sub-estima ~230 W/m2 a 1 h)",
        "nota": ("por eso la direccion del riesgo importa mas que su magnitud: no es lo "
                 "mismo un numero que puede quedar corto que uno que puede quedar largo"),
    }
    salida["como_declarar_confianza"] = (
        "Alta: cielo calmo y baja frecuencia de cambio a esta hora. Media: uno de los dos "
        "en contra. Baja: cielo turbulento, o alta frecuencia de cambio, o horizonte de 3 h "
        "o mas (ahi el estado actual ya no informa y solo queda la hora del dia). Deci "
        "SIEMPRE de que lado podria fallar, no solo cuanto."
    )
    return salida
