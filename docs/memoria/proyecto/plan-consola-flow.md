---
name: plan-consola-flow
description: Plan aprobado (2026-10-20) para que la consola de AgroVoltaic consuma el agente de Visione Flow — interruptor de motor con vuelta atrás, historial desde la consola (opción A), las 32 herramientas con resultados para la UI que no pasan por el modelo; fases en Agent-Runtime, backend, Flow y consola. Sin implementar
categoria: proyecto
actualizado: 2026-10-20
tags: [visione-flow, asistente, consola, plan, agent-runtime]
---

# Plan: la consola consume el agente de Visione Flow

**Estado al 2026-10-21: fases 1 a 4 en producción; falta la fase 5 (pruebas reales y cambio de motor).** Decisiones suyas: **opción A**
de memoria (la consola manda el historial) y **las 32 herramientas** (también las pesadas).
Cada deploy a producción se le pide antes. Contexto: [[agente-visione-flow]], [[asistente-plataforma]].

## Avance (2026-10-21): fases 1-4 en producción; fase 5 (pruebas) pendiente

- **Runtime:** Agent-Runtime #62 (+ #63, test que dependía de la fecha y saltó el Deploy) desplegado
  en `https://api.flow.visione-edge.com`. Detalles de herramienta en los eventos solo con `clientKeys`.
- **Backend:** #27 desplegado en VisioneMetrics. `/tool` con `falla`/`_falla`, límite 120/min
  (`RATE_LIMIT_TOOL_POR_MIN`), canal por `x-origen`, `preparar_informe` con copia `_informe`.
- **Agente Flow "Consola":** `cmvi3asrc0004l81nd717qy3w`, desplegado. 32 tools con `clientKeys: "_"`,
  `x-origen: flow`, sin caché; prompt `CHAT_SYSTEM` + nota de Flow; webhook streaming con `x-api-key`
  (clave puesta por Isaac en Flow y en Vercel `FLOW_WEBHOOK_KEY`). Prueba `cmvi41iwa0001l81njo3u9ft5`:
  `rangos_con_datos` + `graficar`, 9 s, USD 0,15; el `_grafico` no llegó al modelo.
- **Consola:** #28 desplegado (`agrovoltaic-consola-aqgw3phko-…`, `ddf3a31`). `FLOW_WEBHOOK_URL` en
  Vercel; `ASISTENTE_MOTOR` sin definir = `plataforma`. Flow solo con la cookie `av_motor=flow`.
- **Abierto:** sin prompt caching en Flow (`cachedPromptTokens` 0, ~24k tokens por llamada al modelo);
  `maxExecutionTime` 120 s fijo en el canal web; `usage` sin tokens in/out; `clientKeys` sin documentar
  en el editor de Visione-Flow; `FLOW_WEBHOOK_KEY` quedó `encrypted`, no `sensitive`.

## Lo que encontró el relevamiento (y cambia el diseño)

1. **Flow corta cada resultado de herramienta a 8.000 caracteres** (`MAX_TOOL_RESULT_CHARS`,
   `ai-agent.react.tools.ts:14`) y el JSON llega **doblemente codificado** (`{status,ok,data}` como
   string). Ya afecta al agente actual: `hallazgos_calidad` sin tope (26 KB) llegaba cortado.
2. **Flow no acepta historial del cliente:** el canal web (`POST /api/webhooks/:agentId/web[/stream]`,
   body `{message ≤10000, sessionId?, userId?, metadata?}`) usa su memoria Redis por `sessionId`
   (ventana 5 por defecto, vence a las 24 h). La consola, en cambio, manda el hilo entero en cada
   mensaje (`/chat/stream`, `{mensajes, contexto}`) y guarda los hilos en `localStorage`.
3. **`agent:tool_result` no trae el resultado** (solo `nodeId`, `toolName`), aunque la `observation`
   está a mano donde se emite (`ai-agent.react.step.ts:98-108`; tipo en `executor.interface.ts:98-106`).
   Es el único cambio de fondo del runtime.
4. **El webhook es público:** CORS abierto y sin límite de llamadas en las rutas web. Clave obligatoria
   y llamada solo desde el servidor de la consola.
5. **`/tool/<nombre>` no da contexto de falla ni reporta a Alertas**; eso hoy solo pasa en el loop de
   la plataforma (`lazo.py:51-56`). Las claves `_` (gráficos, tarjetas) se le ocultan al modelo en
   `lazo.py:24-31`.

## Principio

Cambiar de motor sin que se note y volver atrás al instante. Los dos motores conviven detrás de un
interruptor del lado del servidor; la consola recibe **los mismos eventos de hoy** (`inicio`, `texto`,
`tool_inicio`, `paso`, `fin`, `error`) y no se toca ningún componente de UI.

```
Navegador ─► /api/asistente/chat (Vercel, servidor)
               │ MOTOR=plataforma ─► backend /chat/stream                     (hoy)
               │ MOTOR=flow ───────► runtime /api/webhooks/<id>/web/stream
               │                        └► AI Agent + 32 tools ─► backend /tool/<n>
               └─ adaptador Flow → eventos de la consola
```

## Fase 0 — datos que faltan

- **Host público del runtime de producción:** no está claro en el código; sacarlo de la config del
  runtime (`DOMAIN`) o del panel del webhook en Flow.
- Medir latencia y costo en la fase 5 antes de cambiar el motor por defecto.

## Fase 1 — Agent-Runtime (genérico, repo Visione)

1. **`httpRequestTool.clientKeys`** (prefijo, p. ej. `"_"`): esas claves se sacan de lo que ve el
   modelo **antes** del corte de 8.000 y viajan en `ToolExecutionResult.data`. Se quita el doble encoding.
2. **Resultado al cliente:** `observe`/`runPreparedToolCall` devuelven `data`; `StreamChunkInfo` suma
   `payload`; `agent:tool_result` envía `{nodeId, toolName, input, payload, ok, ms}` con tope
   configurable (p. ej. 2 MB) y `warn` si lo supera.
3. **`agent:tool_call`** también manda el `input` (etiquetas de progreso).
4. **Opción A:** el canal web acepta `history` opcional (máx. N mensajes, validado con zod) que tiene
   prioridad sobre la memoria guardada.
5. Límite de llamadas por clave en el canal web.

*Aceptación:* un `_grafico` de 50 KB nunca llega al modelo y sí al cliente; sin `clientKeys` el
comportamiento es idéntico (todos los agentes actuales).

## Fase 2 — backend de AgroVoltaic

1. `POST /tool/<nombre>` responde con el mismo `falla` que el loop (`fallas.describir`) y reporta con
   `notificar.reportar` (misma regla: una alerta por causa cada 10 min).
2. `_frenar_consumo` también en `/tool`.
3. Header `x-origen: flow` para distinguir esas llamadas en el registro de uso.

*Aceptación:* una falla provocada crea o incrementa `falla_sistema`. Escribe en Alertas de
producción: **solo con autorización de Isaac**.

## Fase 3 — agente nuevo en Flow: "Agente Histórico AgroVoltaic · Consola"

El de la práctica (`cmvgrvosz0004i51n68bmuvlr`) **no se toca** (y en Flow no se borra nada).

1. **Las 32 herramientas**, incluidas las 9 pesadas, con `clientKeys: "_"`: gráficos, calendario y
   tarjetas van directo a la consola; el tope de 8.000 aplica solo a lo que lee el modelo.
2. Prompt: el `CHAT_SYSTEM` completo de la plataforma + contexto de la vista con
   `promptSource: "{{$input.metadata.contexto}}\n\n{{$input.message}}"`.
3. Webhook con `apiKey`; la clave vive en Vercel como variable *sensitive*.
4. `maxIterations` de 10 a 16 (el loop actual permite más pasos). Revisar `maxExecutionTime` 120 s
   contra herramientas largas (`calendario_datos` hasta 60 s).

## Fase 4 — consola (Next, Vercel)

1. `app/api/asistente/chat/route.ts`: motor por `ASISTENTE_MOTOR` (`plataforma` | `flow`) y, para
   probar, por cookie.
2. `lib/asistente/flow/adaptador.ts` (parser SSE + mapeo, módulos chicos por la regla de 150 líneas):

   | Flow | Consola |
   |---|---|
   | `llm:token` | `texto {delta}` |
   | `agent:tool_call` | `tool_inicio {nombre, input}` |
   | `agent:tool_result` | `paso {tipo:"tool", nombre, input, salida: payload, ms, falla}` |
   | `flow:complete` | `fin {respuesta, modelo, pasos, usage}` |
   | `node:error` / `flow:complete` con error | `error {mensaje, codigo}` |

   Con eso `buildBlocks` y `MARKER_EXTRACTORS` funcionan sin cambios.
3. Historial: el hilo completo, igual que hoy (opción A).
4. De paso: el contexto de la vista se congela al crear el hilo (`threads.ts:14-17`); es el bug
   "3 may–1 jun" de las pruebas E2E (pendiente 1 de [[asistente-plataforma]]).
5. Sin tests unitarios nuevos.

## Fase 5 — verificación y salida

1. Pruebas reales de interfaz (Playwright) con los dos motores y las mismas preguntas: selector,
   archivo a medida y zip, botón "Ir", calendario, gráfico, documentación, falla provocada, cancelación.
2. Comparar tiempo a la primera palabra, tiempo total y costo.
3. Salida escalonada: primero Isaac por cookie → `ASISTENTE_MOTOR=flow` por defecto → `plataforma`
   queda al menos 2 semanas como vuelta atrás con una sola variable.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Latencia por dos saltos más | Medir; si sube más de 30 %, no se cambia el motor por defecto |
| Memoria de Flow distinta a la del hilo | Opción A (historial desde la consola) |
| Webhook público sin límite | Clave obligatoria, solo desde el servidor, límite en el runtime |
| Payload enorme por SSE | Tope en el runtime con `warn` |
| Cambios del runtime afectan a otros agentes | Todo opcional; sin `clientKeys` igual que hoy, con tests |

## Orden

En paralelo (worktrees): fase 1, fase 2 y fase 4 contra un mock. Después la fase 3 (necesita la 1 en
producción). Al final la 5.

Ver [[agente-visione-flow]], [[asistente-plataforma]], [[mvp-debugger]], [[integracion-visioneflow]].
