"""Severidad comun y familia 2 (validez fisica). Ver la cabecera de `umbrales`."""
from __future__ import annotations

# ══ Severidad: cuando un hallazgo pasa de anecdota a problema ═══════════════
# ORIGEN: POLITICA. El documento cuenta ocurrencias pero no gradua. El corte de
# 0,20 es el mismo que ya usa `calidad.contexto.FRACCION_MATERIAL` para decidir
# si un dia es utilizable: si aca se usara otro, un hallazgo podria salir "grave"
# y aun asi no invalidar el dia, que es justo la incoherencia que nadie detecta.
FRACCION_AFECTADA_PARA_AVISO = 0.05
FRACCION_AFECTADA_PARA_GRAVE = 0.20

# ══ Familia 2: validez fisica ═══════════════════════════════════════════════
LADO_MINIMO, LADO_MAXIMO = "minimo", "maximo"

# Trazabilidad PDF -> catalogo. Cada tupla es (clave de catalogo, lado, texto del
# documento). La prueba generica lee el numero de `catalogo.obtener(clave)`.
# ORIGEN: DOCUMENTO (la lista de pruebas de validez fisica, sin los numeros).
LIMITES_DEL_DOCUMENTO: tuple[tuple[str, str, str], ...] = (
    ("irradiancia_incidente_wm2", LADO_MINIMO, "irradiancia < 0"),
    ("irradiancia_incidente_wm2", LADO_MAXIMO, "irradiancia > 1500 W/m2"),
    ("humedad_relativa_pct", LADO_MAXIMO, "RH > 100 %"),
    ("humedad_relativa_pct", LADO_MINIMO, "RH < 0 %"),
    ("temperatura_ambiente_c", LADO_MINIMO, "temperatura ambiente < -5 C"),
    ("temperatura_ambiente_c", LADO_MAXIMO, "temperatura ambiente > 50 C"),
    ("velocidad_viento_ms", LADO_MINIMO, "viento < 0"),
    ("precipitacion_mm", LADO_MINIMO, "precipitacion < 0"),
)

# Irradiancia de noche. El documento dice "contrastar contra la altura solar";
# la altura solar del sitio ya esta resuelta dia por dia en `ventana_solar`
# (amanecer y atardecer, calculados con pvlib por `calidad/sol.py`), asi que la
# prueba compara la marca contra esa ventana en vez de recalcular geometria.
#
# El margen de crepusculo NO es una concesion: entre el amanecer geometrico y el
# civil hay luz difusa real y medible en el tropico, y sin margen todo dia sano
# generaria hallazgos en sus dos bordes. ORIGEN: POLITICA.
MARGEN_CREPUSCULO_MINUTOS = 30.0
# Por debajo de esto, de noche, es el suelo de ruido del piranometro sin
# calibrar, no radiacion. ORIGEN: POLITICA (el offset nocturno conocido de la
# serie es -38,845 W/m2 y la vista corregida lo lleva a 0).
IRRADIANCIA_NOCTURNA_TOLERADA_WM2 = 5.0
