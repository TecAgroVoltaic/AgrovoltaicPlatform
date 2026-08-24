"""Configuracion del Comparador — unica fuente de verdad.

Solo configuracion (SRP): a que DB conectar, la geometria del sitio y los umbrales
que deciden si algo es un hallazgo. Los umbrales viven ACA y no repartidos por el
codigo, porque son politica (se discuten con el equipo) y no fisica.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]   # agente-comparador/
REPO = Path(__file__).resolve().parents[3]   # raiz del repo

load_dotenv(ROOT / ".env")
load_dotenv(REPO / ".env")                    # fallback: DATABASE_URL de la Supabase PV


def database_url() -> str:
    """Conexion a la Supabase PV. Perezosa: no exige nada al importar (tests)."""
    url = os.environ.get("COMPARADOR_DB_URL") or os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "Falta DATABASE_URL (o COMPARADOR_DB_URL): la Supabase PV de AgroVoltaic. "
            "Definila en agente-comparador/.env o en la raiz del repo."
        )
    return url


# ── Sitio (San Carlos). Mismos valores que src/agrovoltaic/config.py ────────────
SITE_LAT = float(os.environ.get("SITE_LAT", "10.33"))
SITE_LON = float(os.environ.get("SITE_LON", "-84.42"))
SITE_ALT = float(os.environ.get("SITE_ALT", "600.0"))
TZ = os.environ.get("SITE_TZ", "America/Costa_Rica")   # UTC-6 fijo, sin horario de verano

# ── Rangos fisicos plausibles (min, max) ───────────────────────────────────────
# Mismos que ya aplica la capa de correccion (`v_sc_electrico_corregido`), aca en
# un solo lugar para que el detector y la correccion no se desincronicen.
# El de temperatura es el 10-80 C que fijo Leo Cardinale, no el -10..60 de AgroDash.
RANGOS = {
    "radiacion_sc_15s": {
        "irradiancia_incidente": (-50.0, 1500.0),
        "irradiancia_reflejada": (-50.0, 1500.0),
    },
    "monitoreo_sc_electrico": {
        "voltaje_pv1_v": (0.0, 600.0),
        "voltaje_pv2_v": (0.0, 600.0),
        "corriente_pv1_a": (0.0, 20.0),
        "corriente_pv2_a": (0.0, 20.0),
        "potencia_pv1_w": (0.0, 5000.0),
        "potencia_pv2_w": (0.0, 5000.0),
        "potencia_total_wac": (0.0, 5000.0),
        "frecuencia_hz": (55.0, 65.0),
        "voltaje_vac": (100.0, 280.0),
        "temperatura_inversor_c": (10.0, 80.0),
        "temp_vertical": (10.0, 80.0),
        "temp_inclinado": (10.0, 80.0),
    },
}

# Columnas de temperatura: sufren el 85.0 del DS18B20 desconectado, que es un
# valor DENTRO de ningun rango util pero que el sensor emite como si fuera real.
COLUMNAS_TEMPERATURA = ("temperatura_inversor_c", "temp_vertical", "temp_inclinado")
VALOR_SATURACION_DS18B20 = 85.0

# El offset nocturno constante del piranometro sin calibrar. Aparece en 210 de los
# 274 dias; su presencia no invalida el dia, pero hay que contarla.
OFFSET_NOCTURNO = -38.845008416418494

# ── Umbrales de deteccion (politica, no fisica) ────────────────────────────────
# Cobertura solar: que fraccion de las horas de sol alcanzo a grabar el logger.
# Debajo de esto el dia se marca incompleto. 0.80 sale de que los dias sanos del
# regimen de 5 min cubren 11,5-12,7 h contra ~11,8 h de sol.
COBERTURA_MINIMA = float(os.environ.get("COBERTURA_MINIMA", "0.80"))
# Densidad: presentes / esperadas dentro de la ventana que SI grabo.
DENSIDAD_MINIMA = float(os.environ.get("DENSIDAD_MINIMA", "0.90"))
# Un salto entre lecturas de mas de N veces la cadencia del dia es un hueco.
FACTOR_HUECO = float(os.environ.get("FACTOR_HUECO", "3.0"))
# Un dia con menos de esto no da para juzgarlo: se reporta y no se analiza.
MIN_MUESTRAS_DIA = int(os.environ.get("MIN_MUESTRAS_DIA", "12"))

# ── Cielo ──────────────────────────────────────────────────────────────────────
# Solo se mira donde el sol pega de verdad: por debajo el kt es ruido dividido por
# casi cero.
CS_MINIMO_WM2 = float(os.environ.get("CS_MINIMO_WM2", "50.0"))
# Bandas de kt (indice de cielo despejado). Convencionales; ajustables.
KT_DESPEJADO = float(os.environ.get("KT_DESPEJADO", "0.70"))
KT_CUBIERTO = float(os.environ.get("KT_CUBIERTO", "0.35"))
# Por encima de esto el dato es fisicamente imposible: mas energia que la que manda
# el sol con cielo despejado. No es una nube, es un dato malo (o la calibracion).
# El 1.2 deja pasar el realce por reflexion en bordes de nube, que si es real.
KT_IMPOSIBLE = float(os.environ.get("KT_IMPOSIBLE", "1.20"))
# Indice de variabilidad (VI) por encima del cual el dia se llama intermitente.
#
# CALIBRADO SOBRE ESTA SERIE, no tomado de la literatura. Medido sobre los 228
# dias caracterizados (rejilla de 5 min): minimo 0,76 · p25 3,09 · mediana 4,29 ·
# p75 5,62 · p95 7,29 · maximo 9,33. Un corte en 3,0 (el numero que suele citarse,
# pero para datos de 1 minuto) etiquetaba al 77 % de los dias como variables, o sea
# que no distinguia nada. En 6,0 marca el ~20 % mas intermitente, que es lo que la
# etiqueta tiene que servir para encontrar.
#
# Si cambia la cadencia del logger hay que volver a medir esta distribucion: el VI
# se suaviza al agregar, y por eso mismo todo se calcula sobre rejilla fija.
VI_VARIABLE = float(os.environ.get("VI_VARIABLE", "6.0"))
