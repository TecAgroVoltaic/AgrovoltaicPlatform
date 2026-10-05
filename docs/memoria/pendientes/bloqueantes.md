---
name: bloqueantes
description: Bloqueantes de calibración/Performance Ratio + operativos (cuota del store al 79 %, password de la consola); 2026-08-10 Leo resolvió kWp, tilt/azimut, PV1↔inclinado/PV2↔vertical y constante de calibración; 2026-08-30 cerró el emparejamiento del PR, el voltaje AC en cero y la energía del tablero, y dejó una sola pregunta abierta: la ecuación de transposición, que la confirma Hugo. 2026-09-01: el punto 11 (por qué el sistema dejó de reportar) se CIERRA porque la premisa era nuestra y era falsa, y hay que avisarle a Leo antes de que alguien vaya a campo
categoria: pendiente
actualizado: 2026-09-01
---

# Información pendiente (BLOQUEANTE)

Bloquea la **calibración de irradiancia** y el cálculo de **Performance Ratio**.

> **⚠️ 2026-08-10 — Leo Cardinale cerró casi todos los bloqueantes de geometría/calibración**
> (doc rev LCV, [[respuestas-leo-cardinale]]). Detalle físico en [[geometria-sistema]].

1. ~~Lat/lon~~ **RESUELTO (2026-07-03; valor registrado 2026-08-10):** San Carlos
   **lat `10.33`, lon `-84.42`, altitud `600 m`**, tz `America/Costa_Rica` (nivel ciudad,
   overrideable por `SITE_LAT`/`SITE_LON`/`SITE_ALT`). Fuente: `agente-predictivo/src/predictivo/config.py`.
   Desbloquea el ajuste clear-sky. Ver [[geometria-sistema]].
2. ~~kWp instalados~~ **RESUELTO (2026-08-10):** **1420 Wp por arreglo** (4 × 355 Wp),
   **2840 Wp total**, bifaciales (factor de bifacialidad para análisis avanzado). Ver [[geometria-sistema]].
3. ~~Tilt/azimut y mapeo PV1/PV2~~ **RESUELTO (2026-08-10):** **PV1 = Inclinado** (tilt 20°,
   azimut 150°) · **PV2 = Vertical** (tilt 90°, azimut 50°); Norte=0°, horario+. Ver [[geometria-sistema]].
4. ~~Constante de calibración de la celda~~ **RESUELTO (2026-08-10):** **no existe / no se aplicó
   ajuste**; "celda calibrada" es el nombre comercial. → calibrar por **clear-sky (pvlib)**, no por
   constante. Además, irradiancia **pre-mediados-2025 inválida**. ~~SP722 solo del 2026-05-11 al
   2026-05-28 (360 lecturas en 18 días).~~ **Corregido el 2026-09-01: el SP722 corre hasta el
   2026-08-31 con 8.984 lecturas**, así que **vuelve a ser candidato a calibración** por una vía
   independiente del clear-sky ([[fuentes-fisicas]], [[irradiancia-sin-calibrar]], [[abiertos]]).
   Ver [[respuestas-leo-cardinale]].
5. ~~Timezone~~ **RESUELTO (2026-06-16; almacenamiento confirmado 2026-06-30):** ambos sitios en
   **Costa Rica → UTC−6**. Cae el supuesto UTC−4 Bolivia. **AgroDash guarda en HORA LOCAL** (no UTC):
   verificado con física — el pico medio de irradiancia (`Caja Irradiancia SC`) cae a las 11–12h,
   no a las 17–18h. `readings` usa timestamp **sin** timezone → manejar UTC−6 explícito en el pipeline.
6. ~~Paneles bifaciales~~ **RESUELTO (2026-07-03):** SÍ son bifaciales (confirmado por Izack).
   Considerar aporte de la cara trasera en el modelo de producción esperada.

## Abierto desde el 2026-08-30: la ecuación de transposición (la confirma Hugo)

> **2026-08-30: segunda ronda de respuestas de Leo Cardinale**
> ([[respuestas-lcv-consultas-agosto]]). Cerró tres consultas y abrió una sola pregunta.

10. **¿Qué ecuación de transposición se usa para llevar la irradiancia horizontal al plano de cada
    arreglo?** Leo confirmó el **principio** (*"idealmente debemos trabajar para la radiacion en el
    plano [...] debemos aplicar un modelo matematico que hace el ajuste, entonces tendremos una
    radiacion para cada uno en particular"*) y derivó la elección del modelo:
    *"Sobre esto podrias consultar a Hugo cual ecuacion utilizar."*

    **Quién:** Hugo. **Desde cuándo:** 2026-08-30. **Qué bloquea:** nada de forma dura. Ya tenemos
    POA modelada con `pvlib` en `radiacion_sc_poa` ([[implementacion]], [[geometria-sistema]]), así
    que se puede seguir trabajando; lo que falta es que Hugo confirme ese modelo o lo cambie antes
    de publicar números de Performance Ratio por arreglo.

11. ~~**Por qué el sistema dejó de reportar el 2026-06-01.**~~ **CERRADO el 2026-09-01, y no por
    Leo: la pregunta estaba mal hecha.** El sistema **nunca dejó de reportar**. Hay dato hasta el
    2026-08-31 y 55 de los 57 días nuevos generan. Lo que estaba detenido era **nuestra descarga**
    ([[dataset-actual]]).

    ⚠️ **Esto no se archiva sin más: hay que avisarle a Leo.** Él respondió *"Vamos a revisar
    esto"*, así que del otro lado puede haber alguien por ir a campo a diagnosticar un corte
    inexistente. Va en la corrección al equipo, que es lo más urgente de la lista
    ([[correccion-al-equipo]]).

12. **Qué significa el código de error `302` del inversor.** Aparece en **661 registros de agosto
    2026**, y los días que lo concentran son los dos días de **generación cero** del histórico
    (2026-08-26 y 2026-08-31, con sol pleno y los arreglos energizados). **No está documentado en
    ninguna parte del proyecto**: hay que pedir el manual del inversor o preguntarle al equipo.
    **Quién:** el equipo de campo. **Desde:** 2026-09-01. **Qué bloquea:** poder decir si el 302 es
    causa, síntoma o consecuencia del inversor sin acoplar ([[inversor-sin-acoplar]]).

13. **La planta está parada hoy, hasta donde llega el dato.** No es una pregunta, es un aviso que
    hay que dar: el **último día que tenemos (2026-08-31) la generación fue exactamente cero todo el
    día**, con 1.041 W/m² de irradiancia. Va con la corrección al equipo
    ([[correccion-al-equipo]], [[inversor-sin-acoplar]]).

## Cerrados el 2026-08-30 por Leo Cardinale

Estaban esperando respuesta del equipo desde el 2026-08-28 y ya no bloquean:

- ~~**¿Se cambia el emparejamiento del Performance Ratio?**~~ **CERRADO cambiando la pregunta:**
  el PR pasa a ser diario y mensual, con los acumuladores de energía contra la radiación integrada
  del día. La migración 002 deja de esperar a nadie ([[emparejamiento-por-timestamp]]).
- ~~**¿`voltaje_vac = 0` es dato válido?**~~ **CERRADO: sí lo es.** El rango 100-280 V se retira y
  entra una prueba de disponibilidad del equipo ([[store-hallazgos-calidad]],
  [[pruebas-calidad-umbrales]]).
- ~~**¿La energía del tablero es continua o alterna?**~~ **CERRADO: es AC**, de `energia_hoy_wh` o
  `energia_total_wh` ([[catalogo-metricas-evaluacion]]).
- ~~**¿El SP722 y el piranómetro de reflejada tienen ventanas tan cortas por un fallo?**~~
  **EXPLICADO:** son mediciones adicionales que se incorporaron después
  ([[fuentes-fisicas]]).

## Bloqueante anterior que sigue abierto

7. **Mapeo caja→sitio en AgroDash** — qué cajas son Cartago y cuáles San Carlos (sufijo `SC` = San
   Carlos). **Confirmado en parte 2026-06-30 (Andrés, asistente de Aníbal): la humedad está en
   Cartago y la irradiancia en San Carlos.** Queda el mapeo caja-por-caja fino para el Agente Histórico
   ([[capa-agentes]]). *No bloquea San Carlos PV; solo la capa de comparación entre regiones.*

## Bloqueantes operativos (no son de datos, pero frenan igual)

Detectados y medidos el **2026-08-18**:

8. **Cuota del store al 79 %** — 395 MB de los 500 del Free tier, y `lecturas_ambientales_sc` se
   lleva el 89 %. Quedan ~105 MB: el próximo backfill grande (la humedad son ~375 MB) deja el
   proyecto en **solo-lectura** y rompe la escritura del ETL, de `predicciones` y de
   `gasto_diario`. Decisión pendiente entre subir de plan, aplicar retención o mover la ingesta
   ambiental fuera. → [[cuota-store-supabase]]
9. **`DEBUGGER_PASSWORD` en el despliegue de la consola** — el gate falla cerrado, así que sin esa
   variable la consola responde 503 y parece caída. Verificar dónde esté publicada. →
   [[superficie-expuesta]]

Detalle de las preguntas para el equipo: `../../equipo/DUDAS-Pendientes.md` y `../../equipo/Preguntas-Profesor-CapaAgentes.pdf`.

Relacionado: [[correccion-al-equipo]], [[dataset-actual]], [[inversor-sin-acoplar]],
[[respuestas-lcv-consultas-agosto]], [[irradiancia-sin-calibrar]], [[agrodash]],
[[capa-agentes]], [[cuota-store-supabase]], [[superficie-expuesta]].

---

Esto son cosas que dependen de **terceros**. Lo que depende de nosotros (ofrecido y no
autorizado, deuda conocida, decisiones sin tomar) vive en [abiertos](abiertos.md).

**2026-08-28:** el doc de evaluación de datos abrió un frente propio de pendientes (sensores
bifaciales traseros, viento y precipitación, temperatura ambiente neutra, y dónde
viven los datos Fliwer y de los nodos ESP32; la **POA salió de esa lista**: existe modelada). Van aparte, en
[pendientes-evaluacion-datos](pendientes-evaluacion-datos.md), porque mezclan cosas de terceros
y cosas nuestras y todas vienen del mismo documento.
