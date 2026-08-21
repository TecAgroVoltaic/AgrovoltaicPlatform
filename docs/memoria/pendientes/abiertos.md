---
name: abiertos
description: Trabajo pendiente que depende de NOSOTROS (no de terceros): ofrecido y no autorizado, deuda conocida y decisiones sin tomar
categoria: pendiente
actualizado: 2026-08-21
tags: [pendientes, deuda, decisiones]
---

# Pendientes abiertos

Distinto de [bloqueantes](bloqueantes.md), que son cosas que dependen de **terceros**. Esto
depende de nosotros: está ofrecido, medido o identificado, y falta decidir o hacer.

## Ofrecido al usuario y NO autorizado

- **Darle un volumen al contenedor del pronóstico.** Hoy no tiene ninguno (`Mounts: []`) y
  `forecast-refresh.timer` lo recrea **cada 6 horas** (00, 06, 12, 18 UTC). Consecuencia medida:
  el primer pronóstico real después de cada recreación **vuelve a bajarse ~885.000 filas** de
  Supabase. `data.rango_datos()` con agregado SQL arregló la vista de arquitectura (246 ms en
  frío), pero **no** el camino del pronóstico. Ofrecido dos veces, sin respuesta.
- **Encender el addon NWP en producción.** Está desplegado y **apagado**; se activa con
  `NWP_HABILITADO=1` en `forecast.env`. Ganancia medida fuera de muestra: **−8 % de MAE a 6 h**.
  El costo es que el sistema pasa a depender de un servicio externo (Open-Meteo), que hoy no.
  Es decisión de producto, no técnica.

## Deuda conocida

- **El arnés de verificación sin navegador vive en un scratchpad** y se pierde al cerrar la
  sesión. Promoverlo a `mvp-debugger/scripts/` — ver [verificacion-consola](../proyecto/verificacion-consola.md).
- **La vista «Base de datos» muestra un corte fechado, no una lectura viva.** Es deliberado y está
  declarado en pantalla: el servicio del pronóstico solo lee `lecturas_ambientales_sc`, así que
  ningún endpoint puede reportar las tablas fotovoltaicas. Si algún día se quiere en vivo, hay que
  exponerlo desde el analizador, que sí las lee. Consultas para re-verificar a mano en
  [verificacion-numeros](../datos/verificacion-numeros.md).
- **Separación fina de filas mezcladas (Paso 2).** Hoy esas filas se saltan y se acepta el hueco,
  en vez de recuperar el dato remapeando columnas. Spec y ground-truth en
  [correccion-filas-mezcladas](../datos/correccion-filas-mezcladas.md).
- **Nada pusheado.** La rama `feat/agente-pronostico-humedad-etl-store` acumula **32 commits**
  por delante de `origin/master` al 21-ago. No se pushea sin pedirlo.

## Vale la pena investigar

- **NSRDB (NREL PSM v4, GOES Full Disc)**: 4 km / 30 min, cubre Costa Rica, gratis con registro.
  Solo histórico, pero arreglaría la limitación de fondo de la climatología del pronóstico, que
  hoy se calcula sobre **78 días** de serie. No se evaluó todavía.

Relacionado: [[bloqueantes]], [[agente-pronostico]], [[mvp-debugger]].
