"""Los 9 KPIs a partir de los renglones ya traidos: energias, rendimiento y composicion."""
from __future__ import annotations

from datetime import date

from historico.analitica import energia, resultado
from historico.analitica.resumen.constantes import (
    _KWP_POR_ARREGLO,
    _NOTA,
    DIAS_POR_ANO,
    DIAS_VENTANA_RECIENTE,
)
from historico.analitica.resumen.frescura import cierre_del_periodo, evaluar_frescura


def energias(dias: list[dict], ac: dict) -> dict:
    """Las tres energias del tablero: total AC del inversor y DC por arreglo.

    El total NO es la suma de los dos arreglos. Es la cuenta AC del propio
    inversor, que es lo que pide R7 y lo unico que existe en los cuatro meses en
    que las columnas DC vinieron vacias. `ac` llega ya resumido (ver
    `analitica.energia.resumir`) para no calcular dos veces lo mismo.
    """
    return {
        "total_ac_kwh": ac["registrada_kwh"],
        "inclinado_kwh": energia.integral_dc(dias, energia.INCLINADO),
        "vertical_kwh": energia.integral_dc(dias, energia.VERTICAL),
    }


def rendimiento(energia_arreglo: dict, dias_con_datos: int) -> dict:
    """kWh/kWp acumulado del periodo y su tasa anual, desde una metrica de kWh.

    El documento deja abierta la unidad de tiempo ("definir mensual o anual"), asi
    que se reportan las dos y con el nombre diciendo cual es cual.

    **El divisor del anualizado son los DIAS CON DATOS, no los de calendario**, y la
    diferencia no es cosmetica: sobre todo el historico hay 569 dias de calendario y
    274 con datos, asi que el arreglo inclinado da 416 kWh/kWp/año contra calendario
    y 864 contra dias con datos (el mismo orden que los 896 de diciembre 2025, un mes
    completo). Los 295 dias que faltan son un hueco de LOGGING, no de generacion: no
    sabemos que la planta no genero, sabemos que nadie lo anoto. Dividir por el
    calendario mezcla desempeño de la planta con disponibilidad del registrador y
    castiga a la planta por un fallo del datalogger, que no es lo que se pidio. Sobre
    cuanto se calculo viaja aparte, en el bloque `confianza`.
    """
    motivo = energia_arreglo.get("motivo", resultado.SIN_LECTURAS)
    if energia_arreglo["valor"] is None or not dias_con_datos:
        return {"periodo_kwh_kwp": resultado.metrica(None, 0, "kWh/kWp", motivo),
                "anualizado_sobre_dias_con_datos_kwh_kwp_ano":
                    resultado.metrica(None, 0, "kWh/kWp/ano", motivo)}
    por_kwp = energia_arreglo["valor"] / _KWP_POR_ARREGLO
    return {
        "periodo_kwh_kwp": resultado.metrica(round(por_kwp, 2),
                                             energia_arreglo["n"], "kWh/kWp"),
        "anualizado_sobre_dias_con_datos_kwh_kwp_ano": resultado.metrica(
            round(por_kwp * DIAS_POR_ANO / dias_con_datos, 1),
            energia_arreglo["n"], "kWh/kWp/ano"),
    }


def componer(ultimo_global: str | None, ultimo_en_ventana: str | None,
             dias_periodo: list[dict], dias_reciente: list[dict],
             dias_con_datos: int, hoy: date) -> dict:
    """Los 9 KPIs a partir de los renglones YA traidos. Puro: aca vive el criterio.

    Los DOS ultimos datos entran por separado y no se pueden confundir: el global
    manda en `actualizacion` (el sistema) y el de la ventana en
    `ultimo_dato_del_periodo` (el periodo). Ver `evaluar_frescura`.
    """
    ac_periodo = energia.resumir(dias_periodo)
    energia_periodo = energias(dias_periodo, ac_periodo)
    energia_reciente = energias(dias_reciente, energia.resumir(dias_reciente))
    return {
        "actualizacion": evaluar_frescura(ultimo_global, hoy),
        "ultimo_dato_del_periodo": cierre_del_periodo(ultimo_en_ventana),
        "energia_periodo": energia_periodo,
        "energia_reciente": energia_reciente,
        "rendimiento_especifico": {
            "inclinado": rendimiento(energia_periodo["inclinado_kwh"], dias_con_datos),
            "vertical": rendimiento(energia_periodo["vertical_kwh"], dias_con_datos),
        },
        # Las DOS energias AC con su significado, mas el control AC/DC de R7. Va
        # entero y no recortado: "cuanto registramos" y "cuanto produjo la planta"
        # son preguntas distintas, y su diferencia es el unico numero que ve los huecos.
        "energia_ac": ac_periodo,
        "dias_con_datos": dias_con_datos,
        "dias_ventana_reciente": DIAS_VENTANA_RECIENTE,
        "nota": _NOTA,
    }
