---
name: remodelado-propuesto
description: Opción B (split por subsistema) implementada como VISTAS en Supabase (v_inversor, v_irradiancia, v_temperatura); catálogo de procedencia A VERIFICAR; EDA estructurado pendiente
categoria: datos
---

# Re-modelado de la tabla Supabase — Opción B vía vistas

**Problema (Aníbal + usuario):** en la Supabase de San Carlos (`monitoreo_agrovoltaic`, una tabla
ancha por timestamp) los datos **no decían de qué sensor provienen** — a diferencia de Cartago
([[agrodash-esquema]]). La procedencia estaba implícita en el nombre de columna + [[fuentes-fisicas]]
(+ procedencia de fila en `tipo_fila`/`fuente_archivo`); faltaba hacerla **explícita**.

## Decisión: Opción B (split por subsistema), implementada como VISTAS
Se descartó EAV (modelo Cartago, malo para análisis) y la over-normalización. El split se hizo
**aditivo, sin tocar el pipeline ni migrar datos**, usando **vistas** sobre la tabla ancha (que
queda intacta como fuente de verdad).

## Estado de implementación (2026-06-16)
- ✅ **Vistas creadas en Supabase** (el usuario corrió el script tal cual):
  - `v_inversor` — PV1/PV2, salida AC, energías, temp inversor, codigo_error.
  - `v_irradiancia` — irradiancia incidente/reflejada/albedo + bloque SP722 (filtra filas vacías).
  - `v_temperatura` — temp_vertical, temp_inclinado (filtra filas vacías).
  - La tabla ancha sigue intacta → los cálculos cruzados (PR = potencia/irradiancia) salen sin joins.
- ⚠️ **`catalogo_columnas` (procedencia): A VERIFICAR.** En el script de vistas iba como **comentario**,
  no como SQL; si no se corrió el bloque del catálogo aparte, **falta crearlo**. Es la pieza que
  realmente resuelve la procedencia (1 fila por columna → magnitud, unidad, fuente física, canal, modelo).

## Pendiente
- Confirmar/crear `catalogo_columnas` (script idempotente disponible).
- "Que el EDA inserte ya estructurado" = paso más profundo (cambiar dónde escribe el pipeline);
  con vistas NO hace falta. Solo si se decide tablas físicas.
- Producción: cambios siempre **aditivos**, **no dropear** `monitoreo_agrovoltaic` sin OK.

Relacionado: [[capa-agentes]], [[arquitectura-regiones]], [[fuentes-fisicas]], [[implementacion]], [[agrodash-esquema]].
