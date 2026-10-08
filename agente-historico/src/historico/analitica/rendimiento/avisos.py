"""Lo que el PR declara junto al numero: error del `5/60`, fuente de energia y aval de R2."""
from __future__ import annotations

from historico.analitica.rendimiento.constantes import CONTADOR, INSUMOS_PROVISIONALES, INTEGRAL, WH_POR_KWH


def error_formula_literal(dias: list[dict]) -> dict:
    """Cuanto se habria equivocado el `5/60` literal en ESTE periodo. PURA.

    Se mide sobre todos los dias con radiacion y no solo sobre los validos: el error
    es una propiedad de la CADENCIA del registrador, no del criterio de dia valido, y
    filtrarlo por dias validos daria un numero que depende de dos cosas a la vez.
    """
    real = sum(d["ghi_wh_m2"] for d in dias if d.get("ghi_wh_m2") is not None)
    literal = sum(d["ghi_wh_m2_literal"] for d in dias
                  if d.get("ghi_wh_m2_literal") is not None)
    if not real:
        return {"aplicable": False,
                "explicacion": "el periodo no tiene irradiacion con que comparar"}
    return {
        "aplicable": True,
        "dias_medidos": sum(1 for d in dias if d.get("ghi_wh_m2") is not None),
        "irradiacion_dt_real_kwh_m2": round(real / WH_POR_KWH, 2),
        "irradiacion_5_60_literal_kwh_m2": round(literal / WH_POR_KWH, 2),
        "factor": round(literal / real, 3),
        "error_pct": round((literal / real - 1.0) * 100.0, 1),
        "explicacion": (
            "el `5/60` de R1 supone que cada lectura cubre 5 minutos y la cadencia real "
            "de la radiacion va de 15 a 330 s. Sobre toda la ventana util el error es "
            "+83,6%, pero CAMBIA DE SIGNO por mes (+860% en octubre 2025, -6,6% en "
            "diciembre 2025), asi que no se descuenta con una constante: aplicado "
            "literal le inventa a la serie una estacionalidad de un orden de magnitud"),
    }


def fuente_energia(validos: list[dict]) -> dict:
    """Cual de los dos caminos de energia manda y sobre cuantos dias. PURA.

    El contador es el PRINCIPAL: es la formulacion literal de R1 y es una medida del
    inversor, no una reconstruccion nuestra. La integral es el RESPALDO DECLARADO, y
    hace falta, porque los acumuladores por arreglo faltan ENTEROS entre noviembre
    2025 y febrero 2026 (118 dias), justo los meses en que el inclinado se despega.
    Donde existen los dos coinciden dentro del 0,7-1,8%, pero un anual calculado solo
    con el contador tiene sesgo estacional de muestreo: por eso los dos numeros salen
    etiquetados y nunca fundidos en uno.
    """
    con_contador = sum(1 for d in validos
                       if d.get("e1_contador_kwh") is not None
                       or d.get("e2_contador_kwh") is not None)
    if not validos:
        aviso = "no hay ni un dia valido en la ventana: no hay de donde sacar energia"
    elif con_contador < len(validos):
        aviso = (f"el contador (camino principal) cubre {con_contador} de "
                 f"{len(validos)} dias validos y la integral de la potencia el resto. "
                 f"Los dos agregados se reportan por separado y NUNCA se mezclan en el "
                 f"mismo numero: el subconjunto con contador no representa el año y su "
                 f"PR tiene sesgo estacional de muestreo")
    else:
        aviso = None
    return {"principal": CONTADOR, "respaldo": INTEGRAL,
            "dias_validos": len(validos), "dias_con_contador": con_contador,
            "advertencia": aviso,
            "unidad_contador": ("`energia_pv1_wh`/`energia_pv2_wh` estan en kWh pese "
                                "al sufijo `_wh`, y son contadores DIARIOS que se "
                                "reinician a medianoche: el valor del dia es su maximo")}


def aval_pendiente() -> dict:
    """El estado abierto de R2: la ecuacion de transposicion la confirma Hugo."""
    return {
        "insumos_provisionales": list(INSUMOS_PROVISIONALES),
        "estado": "pendiente_de_aval_externo",
        "quien": "Hugo",
        "referencia": "R2 de Leo Cardinale, 2026-08-30",
        "detalle": ("R2 confirma el PRINCIPIO (una irradiancia por plano para cada "
                    "arreglo) pero deja abierta CUAL ecuacion de transposicion usar. "
                    "`radiacion_sc_poa` es una transposicion modelada con pvlib: es el "
                    "mejor insumo disponible hoy, no un resultado firme. El PR contra "
                    "GHI no depende de ningun modelo y por eso se reporta al lado."),
    }
