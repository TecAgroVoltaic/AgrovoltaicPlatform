"""Que tan viejo es el dato: la frescura del SISTEMA y el cierre del PERIODO."""
from __future__ import annotations

from datetime import date

from historico.analitica.resumen.constantes import (
    AL_DIA,
    DETENIDA,
    DIAS_ANTIGUEDAD_ALARMANTE,
    DIAS_ANTIGUEDAD_TOLERABLE,
    REZAGADA,
    SIN_DATOS,
)


def _dia(marca: str) -> date:
    """La fecha local de una marca de tiempo. Sin conversion de zona (ver ventana.py)."""
    return date.fromisoformat(marca[:10])


def evaluar_frescura(ultimo_global: str | None, hoy: date) -> dict:
    """Que tan viejo es el ultimo dato de TODA la base. Puro, sin DB.

    ## `ultimo_global` es global A PROPOSITO, y por eso no se acota a la ventana

    Esta casilla contesta "¿la planta esta reportando?". Es una propiedad del
    SISTEMA, no del periodo que el usuario eligio mirar: quien analiza enero de 2025
    no esta preguntando si la planta se cayo en enero de 2025, esta mirando un
    historico.

    Calculada dentro del rango, CUALQUIER ventana que no toque el presente dispara
    una alarma falsa de sistema caido, porque el ultimo registro de esa ventana es
    viejo por definicion. No es hipotetico: con la version acotada, pedir
    `desde=2026-05-03&hasta=2026-06-02` respondia "detenida, 92 dias sin reportar"
    teniendo dato de ayer, y con ese texto se le reporto al equipo una averia que no
    existia. Acotarlo al rango parece lo consistente (todo lo demas del tablero SI se
    acota) y por eso es un error que se comete solo: si alguien vuelve a pasarle aca
    el maximo de la ventana, el tablero vuelve a mentir de la misma forma.

    El ultimo dato DENTRO de la ventana es informacion legitima del periodo, pero es
    otra pregunta y viaja por otro lado, sin alarma: ver `cierre_del_periodo`.
    """
    if not ultimo_global:
        return {"ultimo_dato": None, "antiguedad_dias": None, "estado": SIN_DATOS,
                "alarmante": True, "umbral_alarmante_dias": DIAS_ANTIGUEDAD_ALARMANTE,
                "mensaje": "no hay ni una lectura del inversor en toda la base"}
    antiguedad = max((hoy - _dia(ultimo_global)).days, 0)
    if antiguedad >= DIAS_ANTIGUEDAD_ALARMANTE:
        estado = DETENIDA
    elif antiguedad > DIAS_ANTIGUEDAD_TOLERABLE:
        estado = REZAGADA
    else:
        estado = AL_DIA
    return {
        "ultimo_dato": ultimo_global, "antiguedad_dias": antiguedad, "estado": estado,
        "alarmante": estado == DETENIDA,
        "umbral_alarmante_dias": DIAS_ANTIGUEDAD_ALARMANTE,
        "mensaje": (f"sin datos nuevos hace {antiguedad} dias, sobre un umbral de "
                    f"{DIAS_ANTIGUEDAD_ALARMANTE}: el sistema dejo de reportar"
                    if estado == DETENIDA else None),
    }


def cierre_del_periodo(ultimo_en_ventana: str | None) -> dict:
    """Hasta donde llega el dato DENTRO de la ventana pedida. Sin alarma, a proposito.

    Es informacion util (quien mira mayo puede querer saber que su ventana termina
    el 1 de junio) y es legitima, pero es una pregunta del PERIODO. Por eso no trae
    `estado`, `antiguedad_dias` ni `alarmante`: cualquier campo con forma de semaforo
    terminaria pintado como "el sistema dejo de reportar", que es exactamente el
    defecto que `actualizacion` deshace. La frescura del sistema esta alla y se
    calcula sobre toda la base.
    """
    return {
        "ultimo_dato": ultimo_en_ventana,
        "nota": ("hasta donde llega el dato DENTRO de la ventana pedida. NO dice si "
                 "el sistema sigue reportando: eso es `actualizacion`, que se calcula "
                 "sobre toda la base y no sobre el rango."),
    }
