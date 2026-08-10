---
name: metodologia
description: Metodología oficial del equipo (sitio San Carlos) — variables a medir (abióticas/eléctricas + cambios jun 2026), puntos de medición, arquitectura de hardware, frecuencias y preguntas de análisis
categoria: proyecto
---

# Metodología del proyecto (sitio San Carlos)

Del doc del equipo `../../referencia/Metodologia-Agrivoltaic.docx` (jun 2026). Describe **cómo y
qué se mide** en el agrivoltaico de San Carlos — es el marco de los datos que pasaron por el EDA
y viven en Supabase. **Aplica al análisis de San Carlos, NO al Comparador de AgroDash/Cartago.**

## Variables medidas
**Abióticas** (cada 15 min salvo nota): humedad del terreno (%), humedad ambiente (%),
temperatura ambiente (°C), luminosidad (lux — solo Fliwer, + cada 10 s), disponibilidad de
sales (Fliwer).
- *Cambios jun 2026 (solo nodos fabricados):* radiación PAR (μmol·m⁻²·s⁻¹, + corriente del
  fotodiodo), temperatura del terreno (°C), conductividad del terreno (µS/cm).

**Eléctricas** (cada 5 min): potencia (W), energía (Wh), corriente (A), voltaje (V) por arreglo;
irradiancia (W/m², celda calibrada + SP722, también señal cruda en mV); albedo (W/m²);
temperatura de celda (°C).
- *Cambios jun 2026:* frecuencia (Hz), temperatura del inversor, código de error, irradiancia
  reflejada (W/m²).
- Radiación/albedo: cada 5 min y 15 s.

## Puntos de medición
- **Arreglo vertical** — eléctricas del inversor + temperatura + abióticas a cada lado (nodos
  1S-2026 + Fliwer).
- **Arreglo inclinado** — eléctricas + temperatura + abióticas bajo el arreglo (centro).
- **Punto de control** — abióticas en zona no afectada por los paneles (huerta de control).

## Arquitectura de adquisición
- **Fliwer:** baterías (~2 semanas de autonomía → posibles huecos al cambiarlas); subida
  **manual** a Google Drive.
- **Nodos abióticos (ESP32):** WiFi → Google Drive; opción LoRa → Gateway en Raspberry Pi.
- **Raspberry Pi:** WiFi → Google Drive. Procesa inversor, SP722, termocuplas y celdas.
- **Inversor + SP722:** Modbus RS485. **Termocuplas:** serial I2C. **Celdas calibradas:** analógico.

## Periodos a analizar
- **Abiótico:** Fliwer 2024 (3 meses sin cultivo, 3 con caupí); desde 20-ene-2025 camote
  (ene–abr 2025, ya con el sensor de control movido). Siguiente cultivo pendiente.
- **Eléctrico:** 1-jul-2025 a 30-jun-2026 (1 año).
- Minuta 6-feb-2025: idealmente ≥2 ciclos (=2 años, no hay tanto tiempo) → usar cultivos de
  ciclo corto. Documentar suciedad y sombras (estudiante Maikol).

## Preguntas de análisis (resumen)
Comparar cada variable entre arreglos y vs. la huerta de control; efecto por cultivo, estación y
sombra; diferencias de crecimiento (biótico); comportamiento de la generación por tipo de
arreglo, mes y combinación; efecto de los cultivos sobre la generación. Plan detallado en
[[evaluacion-datos]].

Relacionado: [[fuentes-fisicas]], [[diccionario-variables]], [[evaluacion-datos]], [[muestreo-variable]].
