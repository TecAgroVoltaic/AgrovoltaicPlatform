---
name: remodelado-propuesto
description: HISTÓRICO — Opción B (vistas v_inversor/v_irradiancia/v_temperatura sobre monitoreo_agrovoltaic) SUPERADA y dropeada el 2026-08-10 por el modelo crudo+vistas (v0.2); split por subsistema ahora es nativo
categoria: datos
---

> **⚠️ SUPERADO (2026-08-10).** La tabla `monitoreo_agrovoltaic` y sus 3 vistas
> (`v_inversor`/`v_irradiancia`/`v_temperatura`) se **DROPEARON**. El split por subsistema ahora
> es **nativo** del modelo nuevo: tablas crudas separadas `monitoreo_sc_electrico` /
> `radiacion_sc_15s` + vistas de corrección/calibración/PR. Ver [[implementacion]] y
> [[respuestas-leo-cardinale]]. Este archivo queda como historia del enfoque anterior.

# Re-modelado de la tabla Supabase — Opción B vía vistas (HISTÓRICO)

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
