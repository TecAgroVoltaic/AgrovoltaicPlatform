---
name: agente-visione-flow
description: Caso de uso de práctica (2026-10-20) — el Agente Histórico corriendo en Visione Flow de producción como agente con su flujo — webhook + AI Agent (Claude Sonnet 5.5) + 23 herramientas HTTP al backend; qué herramientas entraron y cuáles no (medido), cómo se armó sin exponer claves, las pruebas con ids de ejecución y el bug del runtime que hubo que arreglar
categoria: proyecto
actualizado: 2026-10-20
tags: [visione-flow, agente, practica, caso-de-uso, anthropic]
---

# Agente Histórico en Visione Flow (caso de uso de práctica)

**Estado al 2026-10-20: en producción y probado.** Agente "Agente Histórico AgroVoltaic"
(`cmvgrvosz0004i51n68bmuvlr`) en `https://flow.visione-edge.com`, desplegado y activo.
Es la realización de lo planteado en julio en [[integracion-visioneflow]].

## Para qué

Isaac lo usa como **caso de uso de su práctica profesional**: demostrar que el agente vive en
Visione Flow, con su flujo y sus herramientas. Alcance acordado: **acotado**. La consola de la
plataforma sigue usando el agente propio del backend ([[asistente-plataforma]]).

## Arquitectura

```
Webhook ─► AI Agent (Claude Sonnet 5.5, prompt de AgroVoltaic) ─► Respuesta
             │ tools                                  │ memory
             ▼                                        ▼
  23 × httpRequestTool ─► https://agro.visione-edge.com/historico/tool/<nombre>
  + dateTimeTool (fechas relativas, America/Costa_Rica)
```

- **Flow es el cerebro; el backend son las manos.** Cada herramienta del Agente Histórico ya era
  un endpoint `POST /tool/<nombre>` (`rutas/salud.py`, pensado desde el inicio para esto). No se
  reescribió lógica: se cablearon nodos genéricos `httpRequestTool` con el esquema de `/tools`.
- Los datos no se mueven: siguen en Supabase y AgroDash, y el backend en VisioneMetrics.
- Las descargas que arma `plan_exportacion` se entregan como enlace a la consola
  (`https://agrovoltaic-consola.vercel.app/api/historico/...`); se abren con sesión iniciada.

## Qué herramientas entraron (y por qué no todas)

Isaac pidió solo las **livianas**: nada de renderizado, extracción ni volumen grande. Se decidió
**midiendo**, no por el nombre: cada herramienta se llamó en el servidor con un mes (agosto 2026).

- **Entraron 23** (0,3–5 KB por llamada): `catalogo_datos`, `origen_dato`, `rangos_con_datos`,
  `energia_por_arreglo`, `performance_ratio`, `plan_exportacion`, `irradiancia_resumen`,
  `temperatura_por_arreglo`, `tendencia`, `irradiacion_mensual`, `distribucion_mensual`,
  `comparativa_arreglos`, `resumen_dashboard`, `cielo_periodo`, `cobertura_datos`,
  `completitud_datos`, `calidad_periodo`, `pruebas_calidad`, `hallazgos_calidad`,
  `catalogo_variables`, `correlacion_variables`, `navegar_consola`, `buscar_documentacion`.
- **Acotadas en Flow** (el `toolSchema` es nuestro): `comparativa_arreglos` y `completitud_datos`
  solo semana o mes; `hallazgos_calidad` máximo 15 (sin tope devolvía 26 KB).
- **Quedaron fuera 9:** `graficar`, `carpeta_dia_hora`, `crestas_distribucion` (renderizado);
  `exportar_datos`, `serie_variable`, `preparar_informe` (extracción e informe, crecen con el rango);
  `calendario_datos` (hasta 60 s), `diagnostico_dia` (39 KB por un día), `arquitectura_agente`
  (23 KB de metadatos). Si los piden, el agente usa `navegar_consola` y da el enlace a la consola.

## Cómo se armó sin exponer secretos

- **Credencial de Anthropic:** la cargó Isaac por el enlace de un solo uso de Flow
  (`/api/v1/credential-intakes`); nunca pasó por la conversación.
- **Clave del backend (`x-api-key`):** un script lee `HISTORICO_API_KEY` del servidor por SSH y la
  escribe en las herramientas del agente vía `/api/v1/agents/<id>/actions`, sin imprimirla. Detecta
  solas todas las `httpRequestTool` que apuntan a `agro.visione-edge.com/historico/tool/`.
  **Ojo:** queda guardada en la config de cada herramienta, visible para quien tenga acceso al agente.
- **API key de Flow de producción:** en `~/.flow-prod-key` (chmod 600), creada por Isaac en
  Settings → API keys. **Pendiente revocarla** cuando no haga falta.
- Primero se armó y probó en el **Flow local** (`localhost:3000`, agente `cmvgp4ers0063s1d5q9x50lo0`)
  y después se llevó a producción. La conexión MCP de Claude apunta al Flow **local**.

## Pruebas en producción (historial de ejecuciones de Flow)

| Ejecución | Pregunta | Resultado |
|---|---|---|
| `cmvgsqnnw0007jw1nyqr5551o` | Datos de humedad y su fuente | 17 variables por fuente, San Carlos y Cartago separados |
| `cmvgsr3if0009jw1nvl9vpjqa` | Energía y PR de agosto 2026 | PV1 25,55 kWh, PV2 15,64 kWh; avisa la planta parada 9 de 11 días |
| `cmvgsrc3j000bjw1n54dnje1h` | CSV potencia AC + irradiancia, 1–3 ago, 5 min | 864 filas con enlace de descarga |
| `cmvgt2esb0003k11n4dk8w6li` | Calidad de potencia en agosto, 3 problemas | Cobertura 11/31 días, inversor sin acoplar (537 lecturas), flatline (653) |
| `cmvgt2r770005k11noo0awvvy` | Gráfico PV1 vs PV2 sep-2025 | No grafica: da el enlace a `/comparativa?desde=…` y ofrece un CSV |

Falsa alarma documentada: en local parecía que `plan_exportacion` dejaba fuera el último día
(el enlace traía `hasta = 2026-08-03`). No: la herramienta convierte el `hasta` exclusivo en
inclusivo dentro del plan (`_hasta_inclusivo`), así que el enlace y las 864 filas estaban bien.

## Bug que hubo que arreglar en Visione Flow (ya en producción)

Con Sonnet 5.5 todo nodo fallaba con `400 "temperature is deprecated for this model"`: el plugin
de Anthropic del runtime mandaba siempre `temperature` (0,7 por defecto). Según la documentación,
**Claude 4.7 y posteriores rechazan `temperature`, `top_p` y `top_k`** (los 5.5, con cualquier
valor). Arreglos, todos mergeados y desplegados el 2026-10-20:

- **Agent-Runtime #60:** `anthropic-sampling.ts` omite esos parámetros en los modelos documentados,
  y ante un modelo desconocido que rechace uno reintenta una vez sin él y lo recuerda (logs `info`
  una vez por modelo, `warn` con modelo, parámetro y request id). Además: modelos actuales, Claude
  3.x retirados fuera, modelo por defecto `claude-sonnet-5-5` (el anterior, Claude 3.5, estaba
  retirado), Sonnet 5 a $2/$10 (se cobraba $3/$15) y Haiku 5.5 con precio por tramos. También se
  congeló el reloj de un test que vencía con la fecha y bloqueaba el CI.
- **Agent-Runtime #61:** lista de OpenRouter solo con ids que OpenRouter sigue listando; tabla de
  costos de estadísticas alineada con el plugin.
- **Visione-Flow #46:** selector de modelos del editor actualizado (sin retirados ni ids muertos);
  el asistente de edición pasa de Sonnet 4.5 (se retira el 2026-11-30) a Sonnet 5.5 sin `temperature`.

## Pendiente

- Revocar la API key de `~/.flow-prod-key`.
- **Consola consumiendo un agente de Flow:** plan aprobado el 2026-10-20 (opción A, 32 herramientas),
  sin implementar → [[plan-consola-flow]]. Será un agente nuevo; este no se toca.

Ver [[asistente-plataforma]], [[integracion-visioneflow]], [[agente-historico]], [[servidor-propio]].
