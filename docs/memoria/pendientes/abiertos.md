---
name: abiertos
description: Trabajo pendiente que depende de NOSOTROS (no de terceros): ofrecido y no autorizado, deuda conocida y decisiones sin tomar
categoria: pendiente
actualizado: 2026-08-25
tags: [pendientes, deuda, decisiones]
---

# Pendientes abiertos

Distinto de [bloqueantes](bloqueantes.md), que son cosas que dependen de **terceros**. Esto
depende de nosotros: está ofrecido, medido o identificado, y falta decidir o hacer.

## Ofrecido al usuario y NO autorizado

- **Darle un volumen al contenedor del pronóstico.** Hoy no tiene ninguno (`Mounts: []`) y
  `forecast-refresh.timer` lo recrea **cada 6 horas** (00, 06, 12, 18 UTC). Ofrecido dos veces,
  sin respuesta. **Dejó de ser urgente el 2026-08-24**: la descarga por arranque en frío pasó de
  56 MB a 4,7 MB, así que ya no revienta la cuota. Sigue siendo trabajo tirado cada 6 h.
- **Encender el addon NWP en producción.** Está desplegado y **apagado**; se activa con
  `NWP_HABILITADO=1` en `forecast.env`. Ganancia medida fuera de muestra: **−8 % de MAE a 6 h**.
  El costo es que el sistema pasa a depender de un servicio externo (Open-Meteo), que hoy no.
  Es decisión de producto, no técnica.

## Deuda conocida

- ~~El arnés de verificación sin navegador vive en un scratchpad.~~ **HECHO el 2026-08-24:**
  promovido a `mvp-debugger/scripts/verificar-vistas.mjs` + `tsconfig.verify.json`, con
  `npm run verificar` (28 chequeos). Ver [verificacion-consola](../proyecto/verificacion-consola.md).
- **La vista «Base de datos» muestra un corte fechado, no una lectura viva.** Es deliberado y está
  declarado en pantalla: el servicio del pronóstico solo lee `lecturas_ambientales_sc`, así que
  ningún endpoint puede reportar las tablas fotovoltaicas. Si algún día se quiere en vivo, hay que
  exponerlo desde el analizador, que sí las lee. Consultas para re-verificar a mano en
  [verificacion-numeros](../datos/verificacion-numeros.md).
- **Separación fina de filas mezcladas (Paso 2).** Hoy esas filas se saltan y se acepta el hueco,
  en vez de recuperar el dato remapeando columnas. Spec y ground-truth en
  [correccion-filas-mezcladas](../datos/correccion-filas-mezcladas.md).
- **Nada pusheado.** La rama `feat/agente-predictivo-humedad-etl-store` acumula **32 commits**
  por delante de `origin/master` al 21-ago. No se pushea sin pedirlo.

## Decidido, pero deliberadamente pospuesto

- **Unificar la orquestación en VisioneFlow.** Hoy hay **dos cerebros sobre el mismo par de
  manos**: el nodo `aiAgent` del canvas y un lazo propio en Python (`agent/agent.py`) que es el
  que usa la consola por `/preguntar` y `/chat`. La consola **no pasa por VisioneFlow**: le pega
  directo a los servicios. Eso son dos juegos de prompts, dos facturas de modelo y dos lugares
  donde el comportamiento puede derivar. **La decisión es dejar VisioneFlow como único
  orquestador** y que los servicios Python conserven solo las tools deterministas.
  **Se hace DESPUÉS de terminar el Agente Histórico**, no antes: no se mueven dos cosas a la vez.
  Evidencia de que hoy no se usa lo que se cree que se usa: en todo el log del loadbalancer hay
  **cero** llamadas a `/analizador/`, y los únicos golpes a `/webhook` son de un escáner de
  vulnerabilidades. Lo único vivo en VisioneFlow es el disparo horario del Predictivo.

## Vale la pena investigar

- **NSRDB (NREL PSM v4, GOES Full Disc)**: 4 km / 30 min, cubre Costa Rica, gratis con registro.
  Solo histórico, pero arreglaría la limitación de fondo de la climatología del pronóstico, que
  hoy se calcula sobre **78 días** de serie. No se evaluó todavía.

Relacionado: [[bloqueantes]], [[agente-predictivo]], [[mvp-debugger]], [[servidor-propio]].
