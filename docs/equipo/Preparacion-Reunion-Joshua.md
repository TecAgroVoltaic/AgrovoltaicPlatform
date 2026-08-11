# Preparación — Reunión con Joshua (datos de San Carlos)

> Objetivo: aprovechar que Joshua lleva mucho tiempo en el proyecto para recuperar
> el **conocimiento tácito** (decisiones, fórmulas, rangos de corte, "esto no lo hagan")
> que nunca quedó escrito, y confirmar que no se nos escapa nada.
> Base: escaneo fresco de los **285 CSV** de `Monitoreo-AgroVoltaic-SC-NEW` (hasta 2026-06-01),
> reutilizando el mismo pipeline que carga Supabase.

---

## 1. Reencuadre crítico: ¿"nuestros datos son mejores" que su `.db`?

Sí en **limpieza**, pero hay que matizar — no es una competencia, es qué tiene cada uno:

| | Nuestro (Supabase) | Su `agrovoltaic2025.db` |
|---|---|---|
| Filas | 36.630 (**5 min**, resampleado) | ~112.581 (**2 s / nativo**, sin resamplear) |
| Limpieza | 85→NULL, negativos→0, offset→0, typos normalizados | crudo (negativos, 85, albedo 176, 26 MW) |
| Resolución fina | **se pierde** (resampleo a 5 min) | **se conserva** |
| Calibración irradiancia | no | no |
| Cobertura | 2024-11-10 → 2026-06-01 | hasta 2026-05-28 |

**Conclusión honesta:** lo nuestro es más limpio y listo para análisis; lo suyo conserva la
resolución nativa que nosotros descartamos (para un sitio muy nuboso, esa variabilidad
sub-minuto puede importar). El valor real de la reunión **no** es ganar la comparación, es
sacarle las decisiones tácitas y los datos que destraban todo (calibración, kWp, geometría).

---

## 2. Estado actual de los datos (escaneo fresco)

- **Cobertura:** 2024-11-10 → 2026-06-01, **274 días con datos** (de ~568 → gaps grandes siguen).
- **Cadencia hoy:** 5 min (últimos archivos, 155 filas/día). Histórico: 204 archivos ~5 min,
  62 ~1 min, 8 ~6-10 s, 2 ~2 s.
- **Schemas:** ~12 conviviendo; el pipeline los cubre todos (0 headers desconocidos).
- **Filas crudas:** 113.868 (111.609 inversor / 2.259 sensor) → 36.630 tras limpiar+resamplear.

### Tres hallazgos críticos (nuevos / cuantificados)

1. **Pérdida silenciosa de 56.063 filas** en 6 archivos (sobre todo Dic 2024) por el formato de
   **filas mezcladas** (piranómetro intercalado con el inversor). Hoy **NO entran a Supabase**
   — el pipeline las salta (Paso 2 pendiente). Es la mayor fuga de datos actual.
2. **Nuestra limpieza NO topa los outliers altos.** Zanjamos negativos, 85 y offset, y clippeamos
   temperaturas/frecuencia/voltaje AC fuera de rango — pero **dejamos pasar valores altos imposibles**
   en potencia, energía e irradiancia. En Supabase sobreviven: `potencia_pv1_w` hasta **26,5 MW**,
   `potencia_total_wac` hasta **119 kW**, `energia_total_wh` hasta **39 MWh**, `irradiancia_incidente`
   hasta **11.300**. (Gap de NUESTRO pipeline, no solo del de Joshua.)
3. **Irradiancia sin calibrar:** 17,4% de valores negativos (mín −15.500), `albedo` hasta **176**
   (debería ser 0–1). Bloqueado por modelo de piranómetro + factor mV→W/m².

### Rangos crudos por variable (para "¿en qué rango cortaron?")

| variable | mín | p50 | p99 | máx | nota |
|---|--:|--:|--:|--:|---|
| irradiancia_incidente | −15.500 | 155 | 6.600 | 11.300 | 17,4% negativa |
| irradiancia_reflejada | −38 | 74 | 5.190 | 16.200 | solo 40% poblada |
| albedo | −0,3 | 0,13 | 81 | **176** | 9,2% fuera de [0,1] |
| potencia_pv1_w | 0 | 201 | 1.300 | **26,5 M** | spike solo en PV1 |
| potencia_pv2_w | 0 | 143 | 1.010 | 1.380 | PV2 limpia |
| temp_vertical | −85,6 | 29 | 85 | 128 | 5,7% en 85,0 |
| temp_inclinado | 0 | 30 | 85 | 128 | **15,9%** en 85,0 |
| temperatura_inversor_c | 0 | 34 | 48 | **291** | (limpieza la corrige) |
| energia_total_wh | 182 | 1.140 | 2.680 | **39,3 M** | acumulador roto por spike |
| codigo_error | 0 | 0 | 302 | 302 | hay errores no-cero |
| SP722 (5 cols) | — | — | — | — | solo **0,3% poblado** |

### Lo que nuestra limpieza filtra (el "delta")

- Temp 85,0 → NULL: **24.541 filas**. Temp/inversor fuera de [−10,70] → NULL.
- Irradiancia negativa/offset −38,845 → 0: **~23.500 filas**.
- Frecuencia fuera de [59,61] y voltaje AC fuera de [100,280] → NULL (casi todo ceros nocturnos).
- **NO** calibra irradiancia · **NO** topa outliers altos · **NO** separa las filas mezcladas.

---

## 3. Preguntas para Joshua

### A. Rangos y filtros aplicados  ⭐ prioridad
1. ¿En qué **rango consideraron válida** cada variable? ¿Cortaron por rango/percentil, o dejaron crudo?
2. Los **outliers altos** (potencia 26,5 MW en PV1, energía 39 MWh, irradiancia 11.300) — ¿los
   toparon o eliminaron en algún lado? ¿A qué valor? ¿O son reales que no vieron?
3. El **offset −38,845** de irradiancia: ¿de dónde sale ese número exacto? ¿Es el "cero" del
   piranómetro? ¿Lo restaban a mano?
4. ¿Filtraban las **horas nocturnas** (irradiancia≈0) para algún cálculo? ¿Con qué umbral?
5. Las **56.063 filas mezcladas** que hoy descartamos (Dic 2024) — ¿ustedes las recuperaban?
   ¿hay un export ya separado? ¿cómo las separaban (qué columna va a qué)?
6. ¿Descartaron algún **período o archivo completo** por malo? ¿Cuáles y por qué?

### B. Qué NO hacer / supuestos  ⭐ prioridad
7. ¿Hay algo que les dijeron **explícitamente que NO hicieran** con estos datos? (¿no calibrar?,
   ¿no resamplear?, ¿no mezclar sitios/regiones?)
8. ¿Qué **supuestos del sitio** están dando por sentados y no están escritos? En especial:
   ¿**PV1 = arreglo vertical** y **PV2 = inclinado**? ¿un solo inversor de 2 strings?
9. El cambio **"Potencia total [Wac]" ↔ "[VA]"** — ¿es intencional? ¿es potencia activa o aparente?
10. La **irradiancia anterior a Oct 2025**: ¿es cruda (mV) o ya calibrada? ¿Se puede usar o se tira?
11. ¿Por qué **desaparece PV2** (voltaje/corriente) entre Dic 2024 y May 2025? ¿cambio físico o firmware?
12. ¿Hay decisiones **habladas con el profesor/equipo** sobre cómo reportar (energía, PR) que
    deberíamos respetar sí o sí?

### C. Columnas / métricas a calcular
13. ¿Qué **columnas derivadas** esperan que calculemos (PR, specific yield, albedo calibrado, CSI)?
    ¿Con qué **fórmula acordada**?
14. **kWp por string** (vertical / inclinado): sin esto, PR y yield son placeholders (hoy = 1,0).
    ¿Lo tienen medido?
15. `codigo_error` llega a 302 — ¿tienen la **tabla de significados** de los códigos?

### D. Origen físico / calibración
16. **Modelo del piranómetro** pre-SP722 y su **factor mV→W/m²** (y el del SP722).
17. **Lat/lon** exactos, **tilt** y **azimut** de cada arreglo.
18. **Timezone** de los timestamps (nosotros confirmamos UTC-6; validar con él).
19. **SP722 casi vacío** (0,3% poblado) — ¿está bien instalado? ¿desde cuándo es confiable?

### E. Sobre su `.db` (colaborativo, sin confrontar)
20. Su `.db` conserva la **resolución nativa (2 s)** que nosotros resampleamos — ¿hay análisis
    que necesiten esa resolución fina? ¿por qué eligió no resamplear?
21. ¿La tabla `monitoreo_agrovoltaico` de su `.db` es su "fuente buena"? ¿la sigue actualizando,
    o migramos todos a la Supabase limpia?

---

*Duplicados detectados (para limpieza aparte): MD5 idénticos 2024-12-23 y 2025-10-01; 6 fragmentos
diminutos 2024-12-24 (86–87 b).*
