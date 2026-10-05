---
name: evaluacion-datos
description: Plan de análisis/dashboard para los datos San Carlos (del EDA) — módulos DataViz/DataStats/DataMining, campos del dashboard, 7 objetivos de análisis energético, regresión Ridge; link al Colab. AMPLIADO y re-asignado por el PDF del 2026-08-28
categoria: proyecto
actualizado: 2026-08-28
---

# Plan de evaluación de datos (San Carlos)

> **⚠️ 2026-08-28: hay una versión nueva del documento y este archivo quedó como resumen.**
> El PDF `Evaluación de datos.pdf` (raíz del repo, Leonardo Cardinale Villalobos, 2026-08-28)
> reemplaza al `.docx` de junio y trae mucho más: los **9 KPIs con definiciones exactas**, las
> **4 familias de pruebas de calidad con umbrales**, la especificación de cada gráfico y las
> preguntas de investigación abiertas. El detalle vive ahora en
> [[catalogo-metricas-evaluacion]], [[pruebas-calidad-umbrales]] y [[graficos-evaluacion]].
>
> **Y este plan cambió de dueño.** Este archivo decía que era "NO para el Agente Histórico":
> eso **ya no es cierto**. Por decisión de Izack del 2026-08-28, todo lo que está en el PDF
> **son las métricas que evaluará el Agente Histórico**, y se implementan primero como
> algoritmos genéricos, con el agente después. Ver [[algoritmos-antes-que-agente]]. La
> distinción que este archivo quería marcar (San Carlos PV **no** es AgroDash/Cartago) sigue
> siendo correcta y está mejor explicada en [[alcance-agente-historico]].

Del doc del equipo `../../referencia/Evaluacion-de-datos.docx` (versión de junio 2026). Es el
**diseño del análisis y dashboard** sobre los datos PV de San Carlos (los que ya pasaron por
el EDA y están en Supabase).

Notebook de trabajo (Colab): https://colab.research.google.com/drive/1pvvlb1-og8nc04ffFB3F_VLT6w0ttuCa

## Estructura del sistema
Tres bloques: **DataViz** (Dashboard + Timeseries), **DataStats**, **DataMining**.
- **Dashboard:** resumen rápido. Campos propuestos: última actualización, energía total
  producida, energía últimos 7 días, energía total/7d por arreglo (inclinado/vertical),
  **Rendimiento Específico (kWh/kWp)** — requiere kWp (ver [[bloqueantes]]).
- **Timeseries:** series de tiempo sin filtros, con filtro de calendario y un gráfico de
  cantidad de puntos en el servidor (completitud).
- **DataStats:** resumen estadístico; comparación entre sensores/inversores por **regresión
  Ridge** sobre la distribución de frecuencias. Código de referencia:
  `../../referencia/temp_tail_ridge_plot.py` (ridge plot con gradiente de probabilidad de cola;
  ⚠️ hoy cableado a columnas de humedad de suelo, prefijo `SM_`). También: irradiación vs
  potencia y su regresión.

## 7 objetivos de análisis energético
1. **Rendimiento comparado** Vertical vs Inclinado — energía diaria/mensual/anual, curvas
   horarias, **Performance Ratio (kWh/kWp)**, relación energía/irradiancia, estacionalidad.
2. **Efecto de temperatura** sobre el rendimiento (vertical se calienta menos; coef. de temp.).
3. **Uso de la irradiancia** — irradiancia vs generación; GHI vs POA (el doc dice que no hay POA
   en el plano del arreglo; **sí la hay modelada** desde la v0.4 del ETL, verificado el
   2026-08-28 → [[catalogo-metricas-evaluacion]]).
4. **Estacional/angular** (opcional) — vertical mejor en invierno, inclinado en verano.
5. **Simetría bifacial** — **no se tiene** en ambos planos (estimar por modelo).
6. **Optimización** (más adelante) — modelado de generación anual, LCOE.
7. **Validación con modelos** (más adelante) — PVsyst, SAM, MATLAB.

Relacionado: [[catalogo-metricas-evaluacion]], [[pruebas-calidad-umbrales]],
[[graficos-evaluacion]], [[algoritmos-antes-que-agente]], [[metodologia]],
[[diccionario-variables]], [[bloqueantes]], [[pendientes-evaluacion-datos]],
[[irradiancia-sin-calibrar]].
