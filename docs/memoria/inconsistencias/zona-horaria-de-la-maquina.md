---
name: zona-horaria-de-la-maquina
description: Clase de bug que apareció dos veces — código que lee el reloj de la máquina en vez de la hora del sitio; regla estructural, módulo único y guards en el CI
categoria: inconsistencias
actualizado: 2026-10-05
tags: [zona-horaria, consola, tests, ci]
---

# El reloj de la máquina no es la hora del sitio

**El hecho.** El sitio está en Costa Rica (UTC−6, sin horario de verano). La consola se abre desde
cualquier zona y los servidores corren en UTC. Todo código que lee el reloj *de la máquina* da un
resultado distinto según dónde corra, y el error **no se ve desde Costa Rica**: solo aparece en CI, en
producción o cuando alguien abre la consola en otra zona.

## Las dos veces que pasó

1. **Tests del Predictivo (2026-10-05, al integrar a `master`).** Siete tests de la ingesta por API
   armaban `desde` con `datetime.now()` contra un tope calculado en hora de Costa Rica. Fuera de CR el
   rango salía vacío. En una máquina con el reloj en CR pasaban; en CI (UTC) fallaban.
2. **«Predicción vs Real» (2026-10-05).** Desde un navegador en Europa ningún día cargaba: «no hay
   datos para 2026-10-03: cae en un HUECO de la serie». `diaSiguiente` partía de la medianoche local y
   leía el resultado con `toISOString()` (UTC): al este de UTC devolvía **el mismo día**, el backtest
   se pedía con `desde` = `hasta` y el rango quedaba vacío. El mensaje del servicio además confundía,
   porque sugería como "día más cercano con datos" el mismo día pedido.

## La regla (estructural, no de cuidado)

- **Consola:** el único módulo que sabe de zonas es `mvp-debugger/app/lib/tiempo.ts`. Distingue tres
  cosas que no se mezclan: **fecha de calendario** (`moverDias`, `hoyEnSitio`), **reloj de pared del
  sitio** sin zona (`moverReloj`) e **instante real** (`instanteEnSitio`, `diaEnSitio`). Fuera de ese
  archivo no se usa el reloj local del navegador.
- **Agentes Python:** toda lectura del reloj lleva zona explícita (`datetime.now(ZoneInfo(config.TZ))`,
  `pd.Timestamp.now(tz=config.TZ)`).

## Lo que lo hace cumplir

- `mvp-debugger/scripts/smoke-zona-horaria.mjs`, en el CI: rechaza `getHours`/`getDate`/`setDate`…,
  `toLocaleString` de fecha sin `timeZone` y `new Date("…T00:00:00")` sin `Z`. Probado contra el código
  anterior: marca los seis usos que había. Una línea que de verdad necesite el reloj local se marca con
  `// zona-horaria: ok <motivo>`.
- `agente-historico/tests/test_zona_horaria.py` y `agente-predictivo/tests/test_zona_horaria.py`:
  ningún módulo usa `date.today()`, `datetime.now()` sin zona, `utcnow()` ni equivalentes.
- `app/lib/tiempo.test.ts` corre cada caso con `process.env.TZ` en cinco zonas. Vitest entró al CI con
  este cambio (antes no corría ahí).

## Puntos corregidos el 2026-10-05

Consola: día siguiente y día por defecto de «Predicción vs Real»; instante de corte que se manda al
agente; «hoy» en Descargas (era el día de UTC); fechas de Salud y del mapa de arquitectura (salían en
la zona de quien miraba). Histórico: «hoy» en `analitica/resumen.py` (`hoy_en_sitio`), que con
`date.today()` adelantaba un día desde las 18:00 de Costa Rica en un servidor UTC.

Verificado con las tres suites en UTC, Tokio y Costa Rica. **No se revisaron las pantallas en un
navegador.**

Relacionado: [[reloj-timestamps]] (las tres convenciones de reloj de las BASES, que es otro problema),
[[verificar-midiendo-el-dom]], [[mvp-debugger]].
