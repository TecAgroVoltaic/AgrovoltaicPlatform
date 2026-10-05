"""El sobre en que viaja TODA metrica de `analitica`. Contrato compartido.

Existe para cerrar una sola grieta, y es la mas cara de este dataset: **un cero y
un "no hay dato" se ven igual cuando salen desnudos.** El historico PV tiene 274
dias de un calendario de 569, y `potencia_total_wac` y `energia_total_wh` son NULL
al 100% entre noviembre 2025 y febrero 2026 porque esa columna no vino en el CSV.
Un dashboard que en ese tramo escribe "0 kWh generados" no esta redondeando: esta
afirmando que el sistema no genero, que es falso y ademas indistinguible de la
verdad si el numero viaja solo.

Por eso `metrica()` obliga a pasar `n`, la cantidad de lecturas que sostienen el
valor. Con n = 0 el valor sale como `None` y con motivo, nunca como cero.

Ademas todo sobre lleva `confianza` (ver `historico.calidad.contexto`), que dice
sobre cuantos dias UTILIZABLES del periodo se calculo. Va DENTRO de la respuesta y
no al lado: el que lee el numero no puede no ver su fiabilidad porque viajan juntos,
y esa garantia es estructural, no una nota que el prompt o la UI puedan olvidar.
"""
from __future__ import annotations

from typing import Any

from historico.analitica.ventana import Ventana

# Motivos por los que una metrica no tiene valor. Codigos, no frases sueltas: la UI
# decide como mostrar cada caso y el agente puede explicarlo sin parsear texto.
SIN_LECTURAS = "sin_lecturas"
COLUMNA_AUSENTE = "columna_ausente"
FUERA_DE_COBERTURA = "fuera_de_cobertura"

_EXPLICACION = {
    SIN_LECTURAS: "no hay ni una lectura de esta variable en la ventana pedida",
    COLUMNA_AUSENTE: "la columna existe pero esta vacia en todo el periodo "
                     "(el CSV de origen no la traia)",
    FUERA_DE_COBERTURA: "la ventana cae fuera del tramo en que esta variable es valida",
}


def metrica(valor: float | None, n: int, unidad: str,
            motivo: str = SIN_LECTURAS) -> dict:
    """Una metrica escalar con su respaldo. Con n = 0 el valor es None, no cero.

    `n` es cuantas lecturas sostienen el valor. `motivo` solo se usa cuando n = 0.
    """
    if n <= 0 or valor is None:
        return {"valor": None, "n": 0, "unidad": unidad,
                "motivo": motivo, "explicacion": _EXPLICACION.get(motivo, motivo)}
    return {"valor": valor, "n": n, "unidad": unidad}


def sobre(ventana: Ventana, confianza: dict, **payload: Any) -> dict:
    """Envuelve el resultado de un algoritmo con su ventana y su confianza."""
    return {"ventana": ventana.como_dict(), "confianza": confianza, **payload}
