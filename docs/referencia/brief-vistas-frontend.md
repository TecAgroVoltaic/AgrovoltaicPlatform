# Brief: las vistas del sistema de evaluacion de datos

Para los equipos que construyen `/`, `/series`, `/estadistica`, `/calidad` y
`/comparativa` en `mvp-debugger`. Complementa
`docs/referencia/brief-evaluacion-datos.md` (leelo: secciones 2, 3, 6 y 8), no lo
reemplaza.

## 1. Que ya existe (usalo, no lo reinventes)

Las fundaciones estan construidas y probadas. Lo que falta es CONECTAR.

**Primitivas de grafico** en `app/components/charts/`, todas exportadas por el
barril `@/app/components/charts`:
`TimeSeriesChart`, `BarsChart`, `BoxPlotChart`, `CalendarHeatmapChart`,
`ScatterFitChart`, `RidgelineChart`, mas `ChartFrame`, `EChart` y `useChartTheme`.
**Importa siempre del barril**, nunca del archivo suelto.

**Capa de datos** en `app/lib/analitica/`:
- `client.ts`: `fetchAnalytics({ path, range, schema })`. Devuelve un
  `AnalyticsResult`, NO lanza. Es `"use client"`.
- `contracts/`: `envelope.ts` y `metric.ts`, los esquemas Zod del sobre que manda
  el backend. Reusalos.
- `useDateRange.ts`, `urlRange.ts`, `dateRange.ts`, `granularity.ts`, `coverage.ts`.

**Cascaron** en `app/(analisis)/layout.tsx`: barra lateral y selector de rango.
Ya funciona. **El rango vive en la URL** y lo lee el cascaron: tu pagina lo recibe
por `searchParams` (servidor) o por `useDateRange()` (cliente). No montes otro.

## 2. Los cuatro estados NO son opcionales

`app/components/charts/state.ts` define `ChartState<T>` como union discriminada:
`loading | error | empty | ready`. **Con `status` distinto de `"ready"` el campo
`data` ni siquiera existe en el tipo**, asi que no se puede pintar un grafico sin
datos por descuido.

**`empty` EXIGE un motivo.** Los codigos son `NO_ROWS`, `ALL_NULL`,
`OUT_OF_COVERAGE`, `NO_SOURCE`, `FILTERED_OUT`. Si el backend manda `motivo`, ese
texto va tal cual.

Esto no es ceremonia: **295 de 569 dias del calendario no tienen ni una fila**, hay
**cuatro meses con la potencia AC en NULL al 100%**, el SP722 corrio 18 dias y el
albedo tiene 7 meses de ventana, no 19. En este producto el vacio es el caso comun.
Un grafico en blanco sin explicacion se lee como aplicacion rota, y uno que dibuja
una linea en cero donde no hubo medicion MIENTE.

## 3. El navegador NO calcula

Todo numero sale del backend. Un mismo numero tiene que dar igual en la consola, en
la tool del agente y en el CLI; si el navegador hiciera su propia cuenta, el experto
humano y el agente podrian discrepar sobre el mismo dato.

El frontend puede: dar forma a lo que ya vino (mapear a la forma del grafico),
formatear, ordenar y paginar. **No puede**: promediar, integrar, interpolar,
recalcular un ratio ni rellenar huecos.

## 4. Endpoints

Base `/api/historico/<ruta>` (el proxy inyecta la key del lado servidor; el browser
nunca la ve). En local el servicio esta en `http://127.0.0.1:8010` **sin key**, asi
que podes inspeccionar la forma real de cualquier respuesta con `curl`. Hacelo:
**deriva tus esquemas Zod del payload real, no de lo que supongas.**

Ya existen: `analitica/resumen`, `analitica/completitud`, `analitica/series`,
`analitica/distribucion`, `analitica/irradiacion`, `analitica/carpeta`,
`analitica/correlacion`, `analitica/crestas`, `analitica/comparativa`,
`calidad/resumen`, `calidad/dias`, `calidad/hallazgos`.

**En construccion ahora mismo** por otro equipo, contra el mismo servicio:
`analitica/rendimiento` (el PR diario y mensual) y `analitica/energia` (la energia
AC del tablero). Van a devolver **exactamente** lo que hoy devuelven las tools
`performance_ratio` y `energia_por_arreglo`, que ya podes consultar asi:

    curl -s -X POST http://127.0.0.1:8010/tool/performance_ratio \
      -H 'content-type: application/json' -d '{"desde":"2025-09-01","hasta":"2026-06-02"}'

## 5. Hechos del dato que cambian el diseño, no adornos

1. **El sistema dejo de reportar el 2026-06-01.** La casilla "ultima actualizacion"
   es una ALERTA de frescura, no un dato neutro.
2. **"Ultimos 7 dias" se cuenta contra el ultimo dia CON DATOS**, jamas contra hoy:
   contra hoy saldria todo en cero.
3. **Las columnas `energia_*_wh` estan en kWh pese al sufijo.** Si mostras "Wh"
   te equivocas por mil.
4. **PV1 = Inclinado** (20 grados, azimut 150). **PV2 = Vertical** (90, azimut 50).
   1.420 Wp por arreglo. Nunca los llames PV1/PV2 a secas en la UI.
5. **Un Performance Ratio mayor que 1 es fisicamente imposible** y el backend lo
   manda marcado (`supera_limite_fisico`, `dias_pr_mayor_a_uno`). Mostralo como
   advertencia visible, no lo pintes como un valor mas.
6. **Las variantes contra POA son PROVISIONALES**: el backend manda
   `aval_pendiente` diciendo que la ecuacion de transposicion la debe confirmar
   Hugo. Ese aviso tiene que llegar a la pantalla.
7. **La planta estuvo parada 96 de 274 dias con datos, 69 de ellos con sol pleno.**
   Eso NO es un problema de calidad de dato: es una averia. El backend ya lo manda
   separado, en el bloque `disponibilidad` de `confianza`. **No lo mezcles con la
   calidad**, esa separacion costo trabajo.
8. **El bloque `confianza` viene en casi toda respuesta agregada** y trae
   advertencias en castellano ya redactadas (por ejemplo "las variables NO van
   juntas: la peor tiene 25 dias utilizables y la mejor 241"). Mostralas.

## 6. Reglas de codigo

- Estandar completo: `/Users/izack/.claude/agents/frontend-code-architect.md`
  (secciones 1 a 18). Limite de referencia **150 lineas por archivo**.
- **Identificadores en ingles** en TypeScript nuevo. **Prosa, comentarios y textos
  de UI en español.**
- **Sin rayas em (`—`)**: dos puntos, coma o parentesis.
- Los comentarios explican el PORQUE de lo no obvio, nunca el QUE.
- **CSS: `app/globals.css` es de nadie y de todos, NO lo edites.** Reusa las clases
  del cascaron que ya existen (`.vista`, `.phead`, `.card`, `.grid`, `.kpi`,
  `.kpi-grid`, `.kpi-card`, `.kpi-k`, `.kpi-title`, `.kpi-nota`, `.chip`, `.btn`,
  `.muted`, `.mono`). Lo que necesites de nuevo va en un **CSS Module propio de tu
  vista** (`vista.module.css` en tu carpeta). Cinco equipos escribiendo en un CSS
  global de 912 lineas se pisan seguro.
- Tests con Vitest + Testing Library, `npm test`. Given-When-Then, y que prueben
  proposito real: **el caso vacio con motivo y el caso de error son obligatorios**,
  no opcionales.
- `npm run lint` tiene que pasar con `--max-warnings 0`.

## 7. Como verificar tu trabajo

El entorno esta levantado: Next en `http://localhost:3000` (pide contraseña),
Historico en `:8010`, Predictivo en `:8000`. El Historico corre con `--reload`.
Mira `mvp-debugger/.logs/next.log` para errores de compilacion.
