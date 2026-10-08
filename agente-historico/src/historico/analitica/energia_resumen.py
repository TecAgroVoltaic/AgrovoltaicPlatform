"""Las dos energias AC del periodo (registrada y de planta), con su significado. Puro.

Se usa a traves de `energia`, que reexporta `resumir`.
"""
from __future__ import annotations

from historico.analitica import resultado
from historico.analitica.energia_contadores import UNIDAD, cierres_ac, reconstruir, tramos_vida
from historico.analitica.energia_dc import coherencia_ac_dc

_SIGNIFICADO = {
    "registrada_kwh":
        "lo que QUEDO REGISTRADO: suma de los cierres diarios de `energia_hoy_wh` "
        "sobre los dias que tenemos. No incluye los dias sin CSV",
    "planta_kwh":
        "lo que PRODUJO LA PLANTA: el contador de vida `energia_total_wh` "
        "reconstruido. Incluye los dias que no tenemos, porque el contador siguio "
        "corriendo mientras nadie anotaba",
    "no_registrada_kwh":
        "la diferencia entre las dos: energia generada en dias que no tenemos. Es "
        "el UNICO numero del sistema que ve los huecos, y por eso no se esconde",
}


def resumir(dias: list[dict]) -> dict:
    """Las dos energias AC del periodo, con su nombre y su significado. Puro.

    Las dos van juntas y ninguna se esconde: son preguntas distintas y la
    diferencia entre ellas es lo unico que mide los huecos del registro.
    """
    cierres = cierres_ac(dias)
    lecturas_ac = sum(d.get("n_ac") or 0 for d in dias)
    vida = reconstruir(tramos_vida(dias))
    lecturas_vida = sum(d.get("n_vida") or 0 for d in dias)
    hay_filas = any(d.get("filas") for d in dias)
    # Con filas pero sin lecturas, la columna vino vacia (nov-2025 a feb-2026 es
    # exactamente eso para `energia_total_wh`). Sin filas, no hubo dato ninguno.
    motivo = resultado.COLUMNA_AUSENTE if hay_filas else resultado.SIN_LECTURAS
    no_registrada = vida["total"] - vida["en_dias_registrados"]
    return {
        "registrada_kwh": resultado.metrica(
            round(sum(cierres), 2) if cierres else None, lecturas_ac, UNIDAD, motivo),
        "planta_kwh": resultado.metrica(
            round(vida["total"], 2) if lecturas_vida else None,
            lecturas_vida, UNIDAD, motivo),
        "no_registrada_kwh": resultado.metrica(
            round(no_registrada, 2) if lecturas_vida else None,
            lecturas_vida, UNIDAD, motivo),
        "dias_con_cierre_ac": len(cierres),
        "dias_con_contador_de_vida": vida["dias"],
        "reinicios_del_contador_de_vida": vida["reinicios"],
        "coherencia_ac_dc": coherencia_ac_dc(dias),
        "significado": _SIGNIFICADO,
    }
