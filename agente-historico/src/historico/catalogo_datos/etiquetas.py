"""Nombres legibles para los `type` de sensor de AgroDash (texto curado, no deducible).

AgroDash no guarda unidad ni nombre humano: el `type` es lo que cada equipo escribio
al dar de alta el sensor ("humedadAire", "Air Temperature (°C)", "VWC"). Aca se
traduce lo conocido; lo desconocido se humaniza (camelCase -> palabras) y la unidad
entre parentesis, si viene, se separa. Nunca se muestra el `type` crudo como etiqueta.
"""
from __future__ import annotations

import re

AIRE, SUELO, RADIACION, EQUIPO, OTROS = "aire", "suelo", "radiacion", "equipo", "otros"
GRUPOS = {AIRE: "Aire", SUELO: "Suelo", RADIACION: "Radiación", EQUIPO: "Estado del equipo",
          OTROS: "Otras señales"}

# Tipos que no son una medicion (marcas de tiempo, puertos): no se ofrecen.
NO_MEDICION = frozenset({"Datetime", "timestamp", "Port"})

# base del tipo (sin la unidad entre parentesis) -> (etiqueta, unidad, grupo)
_CONOCIDOS: dict[str, tuple[str, str | None, str]] = {
    "humedadAire": ("Humedad del aire", "%", AIRE),
    "humedadSuelo": ("Humedad del suelo", None, SUELO),
    "humedad": ("Humedad (sensor de suelo)", None, SUELO),
    "temperatura": ("Temperatura", "°C", AIRE),
    "temperaturaAire": ("Temperatura del aire", "°C", AIRE),
    "tempaire": ("Temperatura del aire", "°C", AIRE),
    "temperaturaSuelo": ("Temperatura del suelo", "°C", SUELO),
    "tempsuelo": ("Temperatura del suelo", "°C", SUELO),
    "irradiancia": ("Irradiancia", None, RADIACION),
    "radiacionPar": ("Radiación PAR", None, RADIACION),
    "Solar Radiation": ("Radiación solar", "W/m2", RADIACION),
    "Air Temperature": ("Temperatura del aire", "°C", AIRE),
    "RH Sensor Temp": ("Temperatura del sensor de humedad", "°C", EQUIPO),
    "Atmospheric Pressure": ("Presión atmosférica", "kPa", AIRE),
    "Reference Pressure": ("Presión de referencia", "kPa", AIRE),
    "Vapor Pressure": ("Presión de vapor", "kPa", AIRE),
    "VPD": ("Déficit de presión de vapor", "kPa", AIRE),
    "Wind Speed": ("Velocidad del viento", "m/s", AIRE),
    "Gust Speed": ("Ráfaga de viento", "m/s", AIRE),
    "Wind Direction": ("Dirección del viento", "°", AIRE),
    "Precipitation": ("Precipitación", "mm", AIRE),
    "Max Precip Rate": ("Intensidad máxima de lluvia", "mm/h", AIRE),
    "Lightning Activity": ("Actividad de rayos", None, AIRE),
    "Lightning Distance": ("Distancia de rayos", "km", AIRE),
    "VWC": ("Contenido volumétrico de agua del suelo", None, SUELO),
    "EC": ("Conductividad eléctrica del suelo", None, SUELO),
    "ec": ("Conductividad eléctrica del suelo", None, SUELO),
    "humedadSueloCalibrada": ("Humedad del suelo calibrada", None, SUELO),
    "humedadSueloRAW": ("Humedad del suelo (cruda)", None, SUELO),
    "humedadSueloReal": ("Humedad del suelo (real)", None, SUELO),
    "Battery Percent": ("Batería", "%", EQUIPO),
    "Battery Voltage": ("Voltaje de batería", "V", EQUIPO),
    "Logger Temperature": ("Temperatura del registrador", "°C", EQUIPO),
    "X-axis Level": ("Nivel eje X", "°", EQUIPO),
    "X-axis level": ("Nivel eje X", "°", EQUIPO),
    "Y-axis Level": ("Nivel eje Y", "°", EQUIPO),
    "Y-axis level": ("Nivel eje Y", "°", EQUIPO),
}
_UNIDAD_ENTRE_PARENTESIS = re.compile(r"^(.*?)\s*\(([^)]*)\)\s*$")
_CAMEL = re.compile(r"(?<=[a-z])(?=[A-Z0-9])|(?<=[A-Z])(?=[A-Z][a-z])")


def humanizar(texto: str) -> str:
    """'humedadSueloRAW' -> 'Humedad suelo RAW'; 'humedad_suelo' -> 'Humedad suelo'."""
    palabras = _CAMEL.sub(" ", texto.replace("_", " ")).split()
    if not palabras:
        return texto
    primera = palabras[0][0].upper() + palabras[0][1:]
    resto = [p if p.isupper() else p.lower() for p in palabras[1:]]
    return " ".join([primera, *resto])


def describir(tipo: str) -> tuple[str, str | None, str]:
    """(etiqueta, unidad, grupo) de un `type` de AgroDash."""
    m = _UNIDAD_ENTRE_PARENTESIS.match(tipo)
    base, unidad_tipo = (m.group(1), m.group(2) or None) if m else (tipo, None)
    if base in _CONOCIDOS:
        etiqueta, unidad, grupo = _CONOCIDOS[base]
        return etiqueta, unidad_tipo or unidad, grupo
    return humanizar(base), unidad_tipo, OTROS
