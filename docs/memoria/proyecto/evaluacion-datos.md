---
name: evaluacion-datos
description: Plan de análisis/dashboard para los datos San Carlos (del EDA) — módulos DataViz/DataStats/DataMining, campos del dashboard, 7 objetivos de análisis energético, regresión Ridge; link al Colab
categoria: proyecto
---

# Plan de evaluación de datos (San Carlos)

Del doc del equipo `../../referencia/Evaluacion-de-datos.docx`. Es el **diseño del análisis y
dashboard** sobre los datos PV de San Carlos (los que ya pasaron por el EDA y están en Supabase).
⚠️ Es para **el análisis/agente que usa los datos de San Carlos**, NO para el Comparador de
AgroDash/Cartago — mantener los dos tracks separados.

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
3. **Uso de la irradiancia** — irradiancia vs generación; GHI vs POA (**no hay POA** en plano
   del arreglo).
4. **Estacional/angular** (opcional) — vertical mejor en invierno, inclinado en verano.
5. **Simetría bifacial** — **no se tiene** en ambos planos (estimar por modelo).
6. **Optimización** (más adelante) — modelado de generación anual, LCOE.
7. **Validación con modelos** (más adelante) — PVsyst, SAM, MATLAB.

Relacionado: [[metodologia]], [[diccionario-variables]], [[bloqueantes]], [[irradiancia-sin-calibrar]].
