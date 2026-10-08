"""Los nombres de variable que el barrido de calidad REALMENTE vigila."""
from __future__ import annotations

# Los nombres de variable con que el barrido REALMENTE deja hallazgos. Existe para
# que `clave_calidad` no pueda apuntar a un nombre que la tabla no conoce.
#
# ── EL CRITERIO DE ENTRADA, porque los dos errores no cuestan lo mismo ────────
# Una clave entra aca solo si cumple LAS DOS condiciones:
#
#   1. **Algun detector escribe hallazgos bajo ESE string exacto.** En
#      `hallazgos_calidad` conviven dos convenciones de nombre: el barrido por
#      columna (`calidad/barrido.py`, que recorre `config.RANGOS`) guarda el nombre
#      de la columna CRUDA, y las familias de `calidad/pruebas` guardan la CLAVE del
#      catalogo. Para casi todo son el mismo string; para la irradiancia no
#      (`irradiancia_incidente` contra `irradiancia_incidente_wm2`), y ese desfase
#      es el que hacia invisibles 321 hallazgos de irradiancia y 837 de temperatura.
#   2. **Su tabla cruda es una de las dos que `calidad.contexto` sabe contar**
#      (`monitoreo_sc_electrico` o `radiacion_sc_15s`). El veredicto declara MATERIAL
#      un hallazgo grave cuando toca el 20 % de las lecturas del dia, y ese
#      denominador sale del CTE `filas_dia`, que solo conoce esas dos tablas. Un
#      hallazgo con fuente `radiacion_sc_poa` o `radiacion_sc_clearsky` no tiene
#      denominador y NUNCA puede ser material: declararlo vigilado diria "revisado"
#      sobre algo que el veredicto es estructuralmente incapaz de castigar.
#
# Los dos errores posibles NO son simetricos, y por eso el criterio es este y no uno
# mas suelto. Una clave de mas hace que `confianza` responda "cero hallazgos", y eso
# se lee como dato impecable: SILENCIO LEIDO COMO SALUD, el fallo que ya nos mordio
# tres veces. Una clave de menos hace que `sin_vigilancia()` la anuncie en el
# payload ("nadie la miro"): conservador y RUIDOSO. Ante la duda se deja fuera,
# porque el fallo ruidoso se corrige y el silencioso no se ve.
#
# ── Las cuatro de energia entraron el 2026-08-31, y por que ───────────────────
# Cumplen (1): su clave de catalogo ES su nombre de columna cruda, asi que las dos
# convenciones colapsan en el mismo string y el desfase de la irradiancia no se
# puede repetir aca. Cumplen (2): viven en `monitoreo_sc_electrico`. Y registrarlas
# en este catalogo es JUSTAMENTE lo que las mete en el barrido, porque
# `barrido._series_del_rango` recorre `CATALOGO`: la vigilancia es consecuencia
# estructural de la entrada, no una apuesta sobre una corrida pasada. Sin ellas,
# `confianza` no podia castigar nunca ni la energia AC del tablero (`energia.py`) ni
# el camino del CONTADOR del PR diario (`rendimiento.py`), que son las dos rutas de
# calculo mas usadas del sistema: respondia con un aviso a mano en vez de con un dato.
#
# ── Las POA (bifacial y frontal) siguen FUERA, y no por olvido ────────────────
# Fallan la condicion (2): sus hallazgos viajan con fuente `radiacion_sc_poa`, que
# no aparece en `filas_dia`. Meterlas aca convertiria un aviso honesto ("el barrido
# no revisa la POA") en un aprobado falso. Se quedan fuera hasta que `contexto` sepa
# contar las filas de esa tabla, y mientras tanto `sin_vigilancia()` las canta.
_VIGILADAS = frozenset({
    "potencia_pv1_w", "potencia_pv2_w", "potencia_total_wac",
    "voltaje_pv1_v", "voltaje_pv2_v", "voltaje_vac",
    "corriente_pv1_a", "corriente_pv2_a", "frecuencia_hz",
    "temp_inclinado", "temp_vertical", "temperatura_inversor_c",
    "irradiancia_incidente", "irradiancia_reflejada",
    "energia_hoy_wh", "energia_total_wh", "energia_pv1_wh", "energia_pv2_wh",
})
