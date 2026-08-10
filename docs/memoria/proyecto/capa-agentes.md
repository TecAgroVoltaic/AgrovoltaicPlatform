---
name: capa-agentes
description: Capa de agentes (Comparador + Analizador) — infraestructura consolidada (servicio Python aparte, batch, lee ambas DBs y mapea al consultar); con alcance real y puntos abiertos
categoria: proyecto
---

# Capa de agentes — infraestructura (consolidada 2026-06-16)

Dos agentes sobre las regiones ([[arquitectura-regiones]]):
- **Comparador** — vigila si los datos se salen de su media/rango esperado. Es "el que revisa si está en la media".
- **Analizador** (deseable) — interpreta en lenguaje natural el impacto en el cultivo.

## Infraestructura (decidida)
- **Servicio aparte** (NO dentro de AgroDash), en **Python**, **batch/programado** (cron); **sin streaming** (delay aceptable, reporte diario sirve).
- **Lee ambas fuentes**: AgroDash (Postgres `control`) y la **Supabase** de San Carlos. **Mapea las variables comunes al consultar**; NO reestructura las DBs origen.
- **Detección determinista** (estadística/ML: media móvil, EWMA/control charts, **filtro de Kalman**, STL, z-score, residual vs irradiancia, change-point) → **store de hallazgos** propio.
- **LLM solo por encima**: (Comparador) traduce hallazgos → reporte/alerta en lenguaje natural; (Analizador) Q&A + impacto vía **capa semántica/tools sobre agregados (rollups)** + **RAG** de casos públicos. El LLM NO está en el camino de detección numérica.
- **Salidas**: reporte diario + alertas + respuestas NL.
- **Patrón de validación** (origen: nota de campo archivada en `../../_archivo/Need.md`): un modelo (ML o estadístico) **predice** el valor esperado; el agente lo contrasta con los datos **reales de los últimos X minutos** y, si divergen más de lo tolerable, **alerta**.

## Alcance real (por descubrimientos)
- Cartago **no tiene PV** ([[agrodash-esquema]]) → la comparación cruzada solo es viable en **variables ambientales** (irradiancia, temperatura). Los datos ambientales de San Carlos **ya están en AgroDash** (cajas `SC`).
- Señal de drift recomendada: **cada sitio vs su propia línea base**; el cruce inter-sitio como corroboración.

## Abierto (no cerrado)
- **Métrica**: relativa ahora vs **Performance Ratio** cuando lleguen kWp/calibración (bloqueado, [[bloqueantes]]).
- **Insertar San Carlos como caja en AgroDash**: a valorar; NO requerido por esta infra.
- **Re-modelado del almacenamiento** de San Carlos (catálogo de procedencia + posible split por subsistema) y mejora del EDA: dirección acordada, ver [[remodelado-propuesto]].
- Proveedor LLM / hosting: por definir.

Relacionado: [[arquitectura-regiones]], [[agrodash]], [[agrodash-esquema]], [[remodelado-propuesto]], [[bloqueantes]].
