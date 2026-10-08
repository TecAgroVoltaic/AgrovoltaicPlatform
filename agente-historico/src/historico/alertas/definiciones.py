"""Lo fijo de cada tipo de alerta: nombre, severidad, significado y que graficar.

Datos, no logica: las reglas que producen los candidatos viven en `reglas`, que
reexporta todo lo de aca.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from historico.calidad.pruebas import entre_sensores
from historico.calidad.pruebas.contrato import AVISO, GRAVE

DIA_ENTERO = "*"
_CLAVE_DE_LA_RADIACION = "irradiancia_incidente_wm2"
_VARIABLES_AC = ("voltaje_vac", "potencia_total_wac")

INVERSOR_PARADO_CON_SOL = "inversor_parado_con_sol"
SENSOR_TEMPERATURA_SATURADO = "sensor_temperatura_saturado"
IRRADIANCIA_IMPOSIBLE = "irradiancia_imposible"
INCONGRUENCIA_TEMP_IRRADIANCIA = entre_sensores.TIPO


@dataclass(frozen=True)
class Definicion:
    """Lo fijo de un tipo de alerta: como se llama, cuanto pesa y que significa."""

    severidad: str
    titulo: str
    que_es: str
    tipos_de_hallazgo: tuple[str, ...]
    # Campos numericos del `detalle` del hallazgo cuyo maximo vale la pena guardar.
    cifras: tuple[str, ...]
    variables_de_series: Callable[[str], list[str]]


DEFINICIONES: dict[str, Definicion] = {
    INVERSOR_PARADO_CON_SOL: Definicion(
        GRAVE, "Inversor sin generar con sol pleno",
        "El inversor no se acopló a la red entre las 07:00 y las 17:00 con irradiancia "
        "de sol pleno. El dato es correcto: lo que falla es el equipo, hay que ir a "
        "revisar la planta.",
        ("inversor_sin_acoplar",), ("ghi_max_wm2", "lecturas_con_sol"),
        lambda _: [*_VARIABLES_AC, _CLAVE_DE_LA_RADIACION]),
    SENSOR_TEMPERATURA_SATURADO: Definicion(
        AVISO, "Sensor DS18B20 saturado en 85 °C",
        "La temperatura marca 85 °C constantes, el valor que entrega un DS18B20 "
        "desconectado. Esas lecturas no son temperatura.",
        ("saturado_85",), ("lecturas_en_85",),
        lambda variable: [variable]),
    IRRADIANCIA_IMPOSIBLE: Definicion(
        AVISO, "Irradiancia físicamente imposible",
        "La irradiancia supera el máximo físico o la de cielo despejado. Es un problema "
        "del piranómetro o de su calibración, no una nube.",
        ("kt_imposible", "sobre_maximo_fisico"), ("kt_max", "peor"),
        lambda variable: [variable]),
    INCONGRUENCIA_TEMP_IRRADIANCIA: Definicion(
        GRAVE, "Temperatura de módulo no responde a la irradiancia",
        "La temperatura del módulo no sigue al sol: no se correlaciona con la "
        "irradiancia, se queda fría a pleno sol o sigue caliente sin sol. El sensor "
        "puede estar despegado del módulo. Umbrales pendientes de validación por Hugo.",
        (entre_sensores.TIPO,), ("temp_max", "ghi_max", "minutos_caliente_sin_sol"),
        lambda variable: [variable, _CLAVE_DE_LA_RADIACION]),
}

TIPOS_DE_HALLAZGO: tuple[str, ...] = tuple(sorted(
    {t for d in DEFINICIONES.values() for t in d.tipos_de_hallazgo}))
