---
name: arquitectura-regiones
description: Dos regiones (Cartago/AgroDash + San Carlos/Supabase), sin DB central; San Carlos está partido (PV→Supabase, ambiental/suelo→AgroDash)
categoria: proyecto
---

# Arquitectura de dos regiones

Proyecto AgroVoltaico del **TEC (Costa Rica)**. Dos regiones, cada una con su propia base, **sin DB central**:

- **Cartago** — recolección automática → **AgroDash** (PostgreSQL en `iot-mainserver`).
  Suelo/riego/experimentos. Ver [[agrodash]], [[agrodash-esquema]].
- **San Carlos** — recolección **semi-manual**: CSV crudos → EDA/pipeline → **Supabase**
  (`monitoreo_agrovoltaic`, datos fotovoltaicos). Ver [[objetivo]], [[implementacion]].

## Matiz clave (2026-06-16)
San Carlos está **partido en dos**:
1. **PV eléctrico** (voltaje, corriente, potencia, energía, irradiancia del inversor) → **Supabase** (los CSV).
2. **Ambiental/suelo** (humedad, irradiancia, PAR, temperatura) → **AgroDash** (cajas con sufijo `SC`).

Por eso "cada región su propia DB" es una simplificación: **San Carlos aparece en ambas**.
El **PV eléctrico no tiene contraparte en Cartago** (Cartago no mide PV) → no hay comparación
cruzada PV‑vs‑PV. Lo único común entre regiones son **variables ambientales**.

Relacionado: [[capa-agentes]], [[agrodash]], [[agrodash-esquema]], [[objetivo]].
