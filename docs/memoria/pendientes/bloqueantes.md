---
name: bloqueantes
description: Bloqueantes de calibración/Performance Ratio; 2026-08-10 Leo resolvió kWp, tilt/azimut, PV1↔inclinado/PV2↔vertical y constante de calibración; solo queda el mapeo caja→sitio fino (Comparador)
categoria: pendiente
---

# Información pendiente (BLOQUEANTE)

Bloquea la **calibración de irradiancia** y el cálculo de **Performance Ratio**.

> **⚠️ 2026-08-10 — Leo Cardinale cerró casi todos los bloqueantes de geometría/calibración**
> (doc rev LCV, [[respuestas-leo-cardinale]]). Detalle físico en [[geometria-sistema]].

1. ~~Lat/lon~~ **RESUELTO (2026-07-03; valor registrado 2026-08-10):** San Carlos
   **lat `10.33`, lon `-84.42`, altitud `600 m`**, tz `America/Costa_Rica` (nivel ciudad,
   overrideable por `SITE_LAT`/`SITE_LON`/`SITE_ALT`). Fuente: `agente-pronostico/src/pronostico/config.py`.
   Desbloquea el ajuste clear-sky. Ver [[geometria-sistema]].
2. ~~kWp instalados~~ **RESUELTO (2026-08-10):** **1420 Wp por arreglo** (4 × 355 Wp),
   **2840 Wp total**, bifaciales (factor de bifacialidad para análisis avanzado). Ver [[geometria-sistema]].
3. ~~Tilt/azimut y mapeo PV1/PV2~~ **RESUELTO (2026-08-10):** **PV1 = Inclinado** (tilt 20°,
   azimut 150°) · **PV2 = Vertical** (tilt 90°, azimut 50°); Norte=0°, horario+. Ver [[geometria-sistema]].
4. ~~Constante de calibración de la celda~~ **RESUELTO (2026-08-10):** **no existe / no se aplicó
   ajuste**; "celda calibrada" es el nombre comercial. → calibrar por **clear-sky (pvlib)**, no por
   constante. Además, irradiancia **pre-mediados-2025 inválida**; **SP722 desde mayo 2026**. Ver [[respuestas-leo-cardinale]].
5. ~~Timezone~~ **RESUELTO (2026-06-16; almacenamiento confirmado 2026-06-30):** ambos sitios en
   **Costa Rica → UTC−6**. Cae el supuesto UTC−4 Bolivia. **AgroDash guarda en HORA LOCAL** (no UTC):
   verificado con física — el pico medio de irradiancia (`Caja Irradiancia SC`) cae a las 11–12h,
   no a las 17–18h. `readings` usa timestamp **sin** timezone → manejar UTC−6 explícito en el pipeline.
6. ~~Paneles bifaciales~~ **RESUELTO (2026-07-03):** SÍ son bifaciales (confirmado por Izack).
   Considerar aporte de la cara trasera en el modelo de producción esperada.

## Único bloqueante que queda

7. **Mapeo caja→sitio en AgroDash** — qué cajas son Cartago y cuáles San Carlos (sufijo `SC` = San
   Carlos). **Confirmado en parte 2026-06-30 (Andrés, asistente de Aníbal): la humedad está en
   Cartago y la irradiancia en San Carlos.** Queda el mapeo caja-por-caja fino para el Comparador
   ([[capa-agentes]]). *No bloquea San Carlos PV; solo la capa de comparación entre regiones.*

Detalle de las preguntas para el equipo: `../../equipo/DUDAS-Pendientes.md` y `../../equipo/Preguntas-Profesor-CapaAgentes.pdf`.

Relacionado: [[irradiancia-sin-calibrar]], [[agrodash]], [[capa-agentes]].
