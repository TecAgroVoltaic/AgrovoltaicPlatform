---
name: asistente-plataforma
description: El asistente chat-first de la consola (2026-10-12/20) — archivos a medida en csv/dat/mat/zip, selector de variables, navegación, documentación, calendario de datos y fallas reportadas en Alertas; desplegado a producción el 2026-10-20 en cc2e99b
categoria: proyecto
actualizado: 2026-10-20
tags: [asistente, chat, descargas, alertas, deploy]
---

# Asistente de la plataforma (chat-first)

**Estado al 2026-10-20:** integrado a `master`, pusheado (`c9b6e31`) y **desplegado** (backend y
consola, ver abajo). Contrato de referencia: `docs/referencia/contratos-asistente-plataforma.md`.

## Qué pidió Isaac

1. Que el agente arme **archivos combinados o separados** (csv, dat, mat, o un zip) con las
   variables que se pidan, ordenadas como se pidieron.
2. Que razone **un paso adelante**: sepa de qué fuente sale cada dato (San Carlos/Supabase o
   AgroDash/Cartago), conteste sobre la documentación y la plataforma, y diga dónde está cada cosa
   o lleve ahí.
3. Que liste **qué datos hay** de forma organizada, para marcarlos sin conocer los nombres de columna.

## Decisiones (de Isaac)

- `/` es el **chat (modo simple)**; el tablero pasó a `/tablero`. El modo vive en la cookie `av_modo`.
- **Intervalo:** el agente siempre lo pregunta, pero propone uno (≤3 días 5 min, ≤1 mes 15 min,
  ≤1 año 1 h, más 1 día).
- **Formatos:** csv, dat, mat y zip. **Más de 100.000 filas pide confirmación**; más de 2.000.000 no se genera.
- **Las fallas se reportan dentro de Alertas** (tipo `falla_sistema`).
- La estética del rediseño quedó **aprobada** y se quiere en todas las vistas (pendiente, abajo).

## Cómo quedó

- **Cuatro fuentes con id estable:** `supabase_pv`, `supabase_ambiental`, `agrodash_sc`,
  `agrodash_cartago`. Una variable es `"<fuente>:<clave>"`. Catálogo unificado en `GET /datos/catalogo`.
- **Archivos a medida:** el plan (`PlanExportacion` v1) viaja en base64url en `p=`; se estima en
  `/datos/exportar/plan/estimar` y se genera recién al apretar el botón (`/datos/exportar/plan`).
  `hasta` es exclusivo. Las celdas sin dato quedan vacías, nunca se rellenan.
- **Herramientas nuevas del Agente Histórico:** `catalogo_datos`, `origen_dato`, `plan_exportacion`,
  `navegar_consola`, `buscar_documentacion`, `calendario_datos`.
- **Navegación:** `navegar_consola` lee el mismo `secciones.json` que la barra lateral
  (`mvp-debugger/app/lib/navegacion/`), así que no puede mandar a una sección que no existe.
- **Documentación:** búsqueda léxica sobre `docs/memoria`, `docs/referencia` y `docs/conceptos`.
  La imagen no ve `docs/`: **antes de cada deploy** hay que correr
  `python3 scripts/sincronizar-conocimiento.py`, que copia los docs (gitignored) dentro del paquete.
- **Calendario estilo GitHub** (`calendario_datos`, se pide en lenguaje natural: "quiero ver toda la
  data desde el año pasado y dónde hay huecos"). Nivel del día contra el P90 de su propia fuente;
  huecos de 3 días o más. Plazo de 60 s y caché por caja: la primera versión tardó **50 minutos** por los
  reintentos de AgroDash. Si una fuente no alcanza, la fila sale `completa: false` con el motivo, en vez
  de pintar huecos falsos.
- **Fallas con contexto:** toda falla de herramienta le llega al agente con `tipo`, `detalle`,
  `sugerencia` y `reportada`, y se reporta a Alertas como `falla_sistema`, una por causa (clave
  `falla_sistema:<origen>:<tipo>`, como mucho una escritura cada 10 min).
  **Ojo:** la `.env` local del backend apunta a la Supabase de **producción**. Por eso el reporte se
  apaga bajo pytest o con `FALLAS_A_ALERTAS=0`. Correr el backend local con el chat **escribe alertas
  reales**.

## Verificado con pruebas reales de interfaz (Playwright, 2026-10-13/14)

Funcionan: selector de variables numerado en orden de marcado; "Armar archivo" y la pregunta del
intervalo con propuesta; tarjeta con varios archivos y descarga en zip; botón "Ir" a
`/comparativa?desde=…&hasta=…`; cambio de modo, botón "Preguntar" y redirección por cookie; teléfono
sin scroll horizontal; respuesta honesta sobre la documentación; calendario.

## Pendiente (identificado en esas pruebas, sin arreglar)

1. El modo simple manda el rango de la vista avanzada como contexto (el agente cita "3 may–1 jun").
2. `catalogo_datos` pinta selectores cuando solo buscaba ids.
3. "Cruda sin promediar" sale de la vista calibrada de 5 min; la confirmación de 100.000 filas nunca
   se ejercitó de verdad.
4. Respuestas y lista de huecos del calendario demasiado largas.
5. Chips de documentos desordenados y repetidos.
6. Hydration mismatch en el título de `ClimatologySection` en `/tablero`.
7. Unidades "C" en vez de "°C".
8. El gráfico de un solo día se ve ruidoso (anterior a esto).

Además: la ola estética en todas las vistas y el rediseño de mobile; una prueba real de escritura de
`falla_sistema` en Alertas de producción (no autorizada todavía).

## Hallazgo externo: el disco de AgroDash Cartago está lleno

Durante las pruebas el servidor de AgroDash devolvió **500 "No space left on device"**. Es del lado de
AgroDash, no nuestro: **hay que avisarle a su equipo**. Mientras dure, Cartago puede faltar en el
calendario y en los archivos (sale como falla con contexto, no como hueco).

## También en Visione Flow

Una versión acotada de este agente (23 herramientas livianas, sin bloques visuales) corre en
Visione Flow de producción como caso de uso de práctica → [[agente-visione-flow]]. La consola
sigue usando este agente.

## Deploy del 2026-10-20

- **Backend** (VisioneMetrics, solo el Agente Histórico; el Predictivo no tenía cambios): sincronizar
  docs → `rsync` → `docker compose -f docker-compose.historico.yml up -d --build`. Contenedor
  *healthy*, `/health` 200, `/datos/catalogo` y `/fuentes` responden con datos.
- **Consola** (Vercel, mismo procedimiento con token de [[mvp-debugger]]): deploy
  `agrovoltaic-consola-4olero299-…` **READY** en producción. Sin sesión: `/login` 200 y las páginas
  redirigen al login. **No se verificó nada detrás del login.**
- **Para volver atrás:** consola `agrovoltaic-consola-8xg8y80h5-…` (`b47ead1`, 2026-10-08). El backend
  no guarda la imagen anterior: volver es re-subir `b47ead1` y reconstruir.
- **Orden obligatorio:** primero el backend, después la consola. Con la consola nueva contra el backend
  viejo se rompen selector, archivos a medida, climatología y calendario.

Ver [[mvp-debugger]], [[agente-historico]], [[servidor-propio]], [[consultas-cruzadas]], [[abiertos]].
