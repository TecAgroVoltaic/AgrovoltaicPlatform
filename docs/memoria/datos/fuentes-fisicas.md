---
name: fuentes-fisicas
description: Los datos vienen de 3 fuentes físicas (inversor, piranómetros, DS18B20) que muestrean a intervalos distintos
categoria: datos
---

# Fuentes físicas de datos

Los CSV combinan lecturas de **3 fuentes** que muestrean a intervalos distintos y a veces
se intercalan mal en un mismo archivo (ver [[filas-mezcladas]]):

1. **Inversor solar** — 2 strings (PV1 y PV2): voltajes, corrientes, potencias, frecuencia,
   voltaje/corriente AC, energía acumulada, temperatura del inversor, código de error.
2. **Piranómetro(s)** — irradiancia incidente, reflejada, albedo. Inicialmente 1 sensor;
   desde may-2026 se agrega un segundo de referencia modelo **SP722** (5 columnas).
3. **Sensores de temperatura DS18B20** — `temp1`/`temp2` (luego `temp_vertical`/
   `temp_inclinado`): temperatura del panel en dos orientaciones.

Relacionado: [[irradiancia-sin-calibrar]], [[temperatura-85]], [[schemas-multiples]].
