"""Familia 6: consistencia ENTRE sensores. ¿Dos sensores cuentan la misma historia?

Las otras familias miran una variable sola. Esta cruza la temperatura de modulo
con la irradiancia: un DS18B20 pegado al modulo TIENE que calentarse con el sol.
Si no lo hace, el sensor se despego, esta a la sombra o mide otra cosa, y el dato
de temperatura deja de servir aunque cada lectura este dentro de rango.

Regla inicial del contrato (`docs/referencia/contratos-asistente-alertas.md`, 4.4),
con todos los cortes en `umbrales` y **pendientes de validacion por Hugo**.

## El cruce va por BIN de 5 minutos, jamas por timestamp exacto

Lo electrico va a 5 min y la radiacion a 15 s con jitter: por igualdad exacta se
pierde el 87 % de los pares (medido en `disponibilidad`). Se reusa el mismo mapa
`irradiancia_por_bin` que arma el barrido para la quinta familia, y el mismo
`bin_de_emparejamiento`: dos emparejamientos distintos para la misma radiacion
darian dos verdades.

## Nunca se calla

Un dia sin irradiancia, o sin ventana solar, no es un dia sano: es un dia que no
se pudo juzgar. Sale un hallazgo `info` con `estado: sin_fuente` y su motivo, que
no toca el veredicto (solo cuentan `grave` y `aviso`) pero deja el hueco a la vista.
"""
from __future__ import annotations

from datetime import date

from historico import config
from historico.calidad.pruebas import umbrales
from historico.calidad.pruebas.contrato import (
    GRAVE, INFO, SIN_FUENTE, Contexto, Hallazgo, NoAplica, Serie, es_valor,
    indices_por_dia,
)
from historico.calidad.pruebas.entre_sensores_cruce import (
    _MINUTOS_POR_BIN, _pearson, _racha_mas_larga_min, _temperatura_por_bin,
)

TIPO = "incongruencia_temp_irradiancia"


def incongruencia_temp_irradiancia(serie: Serie, contexto: Contexto) -> list[Hallazgo]:
    """Un hallazgo grave por dia y variable cuando la temperatura no responde al sol."""
    if serie.variable.clave not in umbrales.VARIABLES_DE_TEMPERATURA_DE_MODULO:
        raise NoAplica(
            f"{serie.variable.clave} no es temperatura de modulo; la prueba cruza "
            f"{', '.join(umbrales.VARIABLES_DE_TEMPERATURA_DE_MODULO)} con la irradiancia")

    mapa = getattr(contexto, "irradiancia_por_bin", None) or {}
    salida: list[Hallazgo] = []
    for dia, indices in sorted(indices_por_dia(serie).items()):
        if any(serie.valores[i] == config.VALOR_SATURACION_DS18B20 for i in indices):
            continue  # lo dice `saturado_85`, con nombre y mejor
        ventana = contexto.ventanas_solares.get(dia)
        if ventana is None:
            salida.append(_sin_fuente(serie, dia, umbrales.MOTIVO_SIN_VENTANA_SOLAR))
            continue
        temps = _temperatura_por_bin(serie, indices, ventana.amanecer, ventana.atardecer)
        if not temps:
            continue  # sin temperatura de dia no hay nada que cruzar: `parametro_faltante`
        pares = {b: (t, mapa[b], n) for b, (t, n) in temps.items() if es_valor(mapa.get(b))}
        if not pares:
            salida.append(_sin_fuente(serie, dia, umbrales.MOTIVO_SIN_IRRADIANCIA))
            continue
        hallazgo = _juzgar(serie, dia, pares)
        if hallazgo:
            salida.append(hallazgo)
    return salida


def _juzgar(serie: Serie, dia: date, pares: dict) -> Hallazgo | None:
    temps = [t for t, _, _ in pares.values()]
    ghis = [g for _, g, _ in pares.values()]
    minutos_con_sol = _MINUTOS_POR_BIN * sum(
        1 for g in ghis if g >= umbrales.GHI_DE_DIA_EVALUABLE_WM2)
    if minutos_con_sol < umbrales.MINUTOS_CON_SOL_PARA_EVALUAR:
        return None

    r = _pearson(temps, ghis)
    calientes = [b for b, (t, g, _) in pares.items()
                 if t > umbrales.TEMP_DE_MODULO_CALIENTE_C and g < umbrales.GHI_SIN_SOL_WM2]
    minutos_caliente = _racha_mas_larga_min(calientes)

    motivos = []
    if r is None or r < umbrales.CORRELACION_MINIMA_TEMP_GHI:
        motivos.append(umbrales.MOTIVO_NO_SIGUE_AL_SOL)
    if (max(temps) < umbrales.TEMP_MAXIMA_DE_MODULO_FRIO_C
            and max(ghis) >= umbrales.GHI_DE_SOL_PLENO_WM2):
        motivos.append(umbrales.MOTIVO_FRIO_A_PLENO_SOL)
    if minutos_caliente >= umbrales.MINUTOS_CALIENTE_SIN_SOL:
        motivos.append(umbrales.MOTIVO_CALIENTE_SIN_SOL)
    if not motivos:
        return None

    # Con los motivos 1 y 2 lo que falla es la relacion del dia entero, asi que
    # toda lectura emparejada queda en duda; con el 3 solo, las de la racha.
    solo_racha = motivos == [umbrales.MOTIVO_CALIENTE_SIN_SOL]
    afectadas = sum(pares[b][2] for b in calientes) if solo_racha else sum(
        n for _, _, n in pares.values())
    return Hallazgo(
        fecha=dia, fuente=serie.fuente, variable=serie.variable.clave, tipo=TIPO,
        severidad=GRAVE, n_afectadas=afectadas,
        detalle={"r": None if r is None else round(r, 3),
                 "temp_max": round(max(temps), 2), "ghi_max": round(max(ghis), 1),
                 "bins_evaluados": len(pares), "motivo": motivos[0], "motivos": motivos,
                 "minutos_con_sol": minutos_con_sol,
                 "minutos_caliente_sin_sol": minutos_caliente,
                 "emparejamiento": f"bin de {umbrales.BIN_DE_EMPAREJAMIENTO_SEG} s",
                 "origen": serie.origen,
                 "nota": "umbrales pendientes de validacion por Hugo, sobre "
                         "irradiancia sin calibrar"})


def _sin_fuente(serie: Serie, dia: date, motivo: str) -> Hallazgo:
    return Hallazgo(
        fecha=dia, fuente=serie.fuente, variable=serie.variable.clave, tipo=TIPO,
        severidad=INFO, n_afectadas=None,
        detalle={"estado": SIN_FUENTE, "motivo": motivo, "origen": serie.origen,
                 "nota": "el dia no se pudo juzgar: falta la referencia contra la "
                         "que se cruza la temperatura. No es un aprobado"})
