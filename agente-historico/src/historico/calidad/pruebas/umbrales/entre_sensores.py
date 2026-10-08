"""Familia 6: consistencia ENTRE sensores. Ver la cabecera de `umbrales`."""
from __future__ import annotations

# ══ Familia 6: consistencia ENTRE sensores ═══════════════════════════════════
# Regla inicial del contrato (docs/referencia/contratos-asistente-alertas.md, 4.4).
# ORIGEN: POLITICA. Ninguno de estos cortes salio de medir la serie todavia, y
# todos operan sobre una irradiancia SIN CALIBRAR (ver IRRADIANCIA_QUE_EXIGE_...).
# Cada uno lleva la marca para que nadie los lea como validados.

# Las temperaturas de MODULO. `temperatura_inversor_c` queda fuera a proposito:
# el inversor esta a la sombra y su temperatura no tiene por que seguir al sol.
VARIABLES_DE_TEMPERATURA_DE_MODULO = ("temp_inclinado", "temp_vertical")

# Un dia solo se juzga con suficiente sol: con poco, temperatura e irradiancia
# no tienen por que moverse juntas y la prueba mediria nubes, no sensores.
GHI_DE_DIA_EVALUABLE_WM2 = 300.0              # pendiente de validacion por Hugo
MINUTOS_CON_SOL_PARA_EVALUAR = 120.0          # pendiente de validacion por Hugo

# Motivo 1: el sensor no sigue al sol.
CORRELACION_MINIMA_TEMP_GHI = 0.3             # pendiente de validacion por Hugo
# Motivo 2: modulo frio a pleno sol.
TEMP_MAXIMA_DE_MODULO_FRIO_C = 25.0           # pendiente de validacion por Hugo
GHI_DE_SOL_PLENO_WM2 = 700.0                  # pendiente de validacion por Hugo
# Motivo 3: modulo caliente sin sol, sostenido.
TEMP_DE_MODULO_CALIENTE_C = 60.0              # pendiente de validacion por Hugo
GHI_SIN_SOL_WM2 = 150.0                       # pendiente de validacion por Hugo
MINUTOS_CALIENTE_SIN_SOL = 30.0               # pendiente de validacion por Hugo

MOTIVO_NO_SIGUE_AL_SOL = 1
MOTIVO_FRIO_A_PLENO_SOL = 2
MOTIVO_CALIENTE_SIN_SOL = 3
# Los dos motivos por los que un dia NO se pudo juzgar. Se anotan como hallazgo
# `info` (no tocan el veredicto) para que el hueco se lea como hueco.
MOTIVO_SIN_VENTANA_SOLAR = "sin_ventana_solar"
