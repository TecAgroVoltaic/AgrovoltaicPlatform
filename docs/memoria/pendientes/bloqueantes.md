---
name: bloqueantes
description: 4 datos que faltan (lat/lon, kWp, timezone, modelo piranómetro) y bloquean calibración y Performance Ratio
categoria: pendiente
---

# Información pendiente (BLOQUEANTE)

Bloquea la **calibración de irradiancia** y el cálculo de **Performance Ratio**. El PDF de
AgroDash **NO** la resuelve (ver [[agrodash]]).

1. **Lat/lon** del sitio.
2. **kWp instalados** (total y por string PV1/PV2).
3. **Timezone** de los timestamps del inversor — **sin confirmar**. AgroDash usa UTC−6
   (Costa Rica), pero es otro sistema; el `CLAUDE.md` asumía UTC−4 Bolivia. Conflicto abierto.
4. **Modelo del piranómetro pre-2025** (el reciente es SP722).

Detalle de las 17 preguntas: `../../DUDAS-Pendientes.md`.

Relacionado: [[irradiancia-sin-calibrar]], [[agrodash]].
