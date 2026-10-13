# Contratos: asistente de plataforma (exportación compuesta, selector de variables, navegación y documentación)

Fijado el 2026-10-12, antes de abrir los worktrees. Es la única fuente de verdad
entre backend (`agente-historico`) y frontend (`mvp-debugger`). Lo que no está
acá no se asume: se pregunta al líder y se agrega aquí.

Convenciones que siguen valiendo de `contratos-asistente-alertas.md`:
- las claves que empiezan con `_` en la salida de una tool viajan al frontend en
  `paso.salida` y **no** llegan al LLM;
- fechas en hora local de Costa Rica, ISO **sin** `Z`;
- `hasta` en las URL es **inclusivo** (día completo); en las tools, exclusivo.

Diseño aprobado: artifact «Asistente chat-first AgroVoltaic». Decisiones del
usuario (2026-10-12):
- `/` es el chat en modo simple; el tablero pasa a `/tablero` (modo avanzado).
- Sin intervalo dicho, el agente **siempre pregunta** y **propone** uno según el rango.
- Formatos: `csv`, `dat`, `mat`, y `zip` para varios archivos. Sin xlsx.
- Más de **100.000 filas** en total: el agente pide confirmación antes de generar.

## 1. Fuentes

`SourceId` = `supabase_pv | supabase_ambiental | agrodash_sc | agrodash_cartago`
(igual que `mvp-debugger/app/lib/fuentes/registry.ts` y `/fuentes`). Toda
variable, columna, archivo y gráfico declara su `SourceId`.

## 2. Catálogo unificado de variables

Identificador estable: `"<SourceId>:<clave>"`.
- `supabase_pv:<clave>`: la clave del catálogo analítico existente
  (p. ej. `supabase_pv:irradiancia_incidente_wm2`).
- `supabase_ambiental:<variable>`, `agrodash_sc:<sensor_tipo>`,
  `agrodash_cartago:<sensor_tipo>` (el `type` del sensor en AgroDash, tal cual).

Para AgroDash una variable es el **promedio de todas las cajas del sitio** que
tienen ese tipo de sensor (en formato largo, cada caja sale aparte; ver §3).

`GET /datos/catalogo` (nuevo; `/analitica/variables` no se toca):

```jsonc
{
  "version": 1,
  "grupos": [
    {
      "fuente": "supabase_pv",          // SourceId
      "grupo": "inversor",              // slug estable
      "etiqueta": "Inversor",           // lo que lee una persona
      "variables": [
        {
          "id": "supabase_pv:potencia_pv1_w",
          "etiqueta": "Potencia PV1",   // nombre legible, nunca el de la columna
          "unidad": "W",
          "desde": "2025-11-01",        // YYYY-MM-DD o null
          "hasta": "2026-08-31",
          "cadencia_s": 300,            // cadencia nativa aproximada, o null
          "nota": null                  // hueco o advertencia, texto corto
        }
      ]
    }
  ]
}
```

Variables no disponibles (`fuente_ausente`) **no** se listan.

## 3. PlanExportacion v1

Describe uno o varios archivos. Viaja **sin estado** en la URL como
`p=<base64url(JSON compacto)>` (sin relleno `=`). Tope: 4 KB codificado.

```jsonc
{
  "version": 1,
  "desde": "2026-08-01",                // inclusivo
  "hasta": "2026-08-15",                // inclusivo
  "paso_s": 900,                        // 0 = crudo | 60 | 300 | 900 | 3600 | 86400
  "archivos": [
    {
      "nombre": "sancarlos_ago01-15_15min",   // sin extensión; opcional
      "formato": "csv",                       // csv | dat | mat
      "forma": "ancho",                       // ancho | largo
      "columnas": [
        { "variable": "supabase_pv:irradiancia_incidente_wm2",
          "agregacion": "promedio",           // promedio | min | max | suma | ultimo
          "alias": null }                     // nombre de columna opcional
      ]
    }
  ]
}
```

Reglas:
- El orden de `columnas` es el orden pedido por el usuario y se respeta.
- `forma: "ancho"` exige `paso_s > 0` (no hay rejilla común en crudo):
  error 400 `rejilla_requerida`.
- Ancho: primera columna `fecha_hora` (inicio del intervalo, hora CR), luego una
  por variable. Nombre por defecto: `alias` o la `<clave>` con prefijo corto de
  fuente (`sc_`, `amb_`, `adsc_`, `cart_`). Celda vacía si no hay dato. Nunca se
  rellena.
- Largo: columnas `fecha_hora, fuente, variable, caja, valor, unidad`.
- Se valida todo antes de emitir: variable desconocida, rango fuera de
  cobertura, más de 12 columnas por archivo o más de 8 archivos → 400 con
  `codigo` legible.

Endpoints:
- `GET /datos/exportar/plan/estimar?p=…` →
  `{ "archivos": [{ "indice", "nombre", "formato", "filas", "columnas" }],
     "total_filas", "requiere_confirmacion", "tope_duro" }`.
  `requiere_confirmacion = total_filas > 100000`. `tope_duro` = 2.000.000 filas
  en total: por encima, 400 `plan_demasiado_grande`.
- `GET /datos/exportar/plan?p=…&archivo=<indice>` → un archivo en streaming.
- `GET /datos/exportar/plan?p=…&zip=1` → todos los archivos + `LEEME.txt`
  (por columna: fuente, variable, unidad, agregación, paso, rango).
- Comparten el semáforo de descargas simultáneas de `/datos/exportar`.

## 4. Marcadores nuevos en la salida de las tools

Se agregan a `_grafico` y `_descarga` (v1, sin cambios). El frontend los
registra en un mapa marcador → extractor → bloque → renderer.

### 4.1 `_descargas` (DescargasSpec v1)

```jsonc
{
  "version": 1,
  "plan": { /* PlanExportacion */ },
  "archivos": [
    { "indice": 0, "nombre": "sancarlos_ago01-15_15min.csv", "formato": "csv",
      "filas_estimadas": 1440,
      "columnas": [{ "nombre": "sc_irradiancia_incidente_wm2",
                     "variable": "supabase_pv:irradiancia_incidente_wm2",
                     "etiqueta": "Irradiancia", "fuente": "supabase_pv",
                     "unidad": "W/m2" }],
      "fuentes": ["supabase_pv"],
      "url": "/datos/exportar/plan?p=…&archivo=0" }
  ],
  "zip_url": "/datos/exportar/plan?p=…&zip=1",   // null si hay un solo archivo
  "total_filas": 1440,
  "requiere_confirmacion": false
}
```

El frontend acepta una `url` solo si empieza con `/datos/exportar/plan?`.
Con `requiere_confirmacion: true` la tarjeta muestra el total y un botón
«Confirmar y descargar»; nada se descarga solo.

### 4.2 `_selector_variables` (SelectorVariablesSpec v1)

```jsonc
{
  "version": 1,
  "titulo": "Datos de humedad",          // opcional
  "preseleccion": ["agrodash_sc:humedadAire"],
  "grupos": [ /* mismos grupos que GET /datos/catalogo, quizá filtrados */ ]
}
```

La interacción es del frontend: chips que se marcan, numerados por orden de
selección, búsqueda local, y un conmutador «Junto» / «Por fuente». «Armar
archivo» envía un **mensaje de texto** del usuario (no una llamada directa), así
el backend tiene un solo camino:

```
Armá un archivo junto con estas variables, en este orden:
1. Temp. aire [agrodash_sc:temperatura]
2. Potencia PV1 [supabase_pv:potencia_pv1_w]
```

(«un archivo por fuente» en vez de «un archivo junto» si se eligió así.) Rango
e intervalo los negocia el agente en el turno siguiente.

### 4.3 `_navegacion` (NavegacionSpec v1)

```jsonc
{ "version": 1, "seccion": "comparativa", "etiqueta": "Comparativa · PR por día",
  "detalle": "ago 2026 · San Carlos", "params": { "desde": "2026-08-01", "hasta": "2026-09-01" } }
```

`seccion` es un `id` de `secciones.json`. El frontend arma el href con lista
blanca: solo la ruta de esa sección y solo los `params` que esa sección declara;
lo demás se descarta. Sección desconocida: la tarjeta no se dibuja.

### 4.4 `_documentos` (DocumentosSpec v1)

```jsonc
{ "version": 1, "documentos": [ { "titulo": "Respuestas LCV agosto", "ruta": "docs/memoria/decisiones/respuestas-lcv-consultas-agosto.md", "seccion": "Performance Ratio" } ] }
```

Se muestran como referencias (chips no navegables): la documentación no se
sirve en la consola.

### 4.6 `_calendario` (CalendarioSpec v1)

Calendario de actividad tipo GitHub: una fila por fuente, una celda por día.

```jsonc
{
  "version": 1,
  "titulo": "Días con datos",
  "desde": "2025-01-01",                 // inclusivo
  "hasta": "2026-10-12",                 // inclusivo
  "filas": [
    {
      "fuente": "supabase_pv",           // SourceId (color del punto y de las celdas)
      "etiqueta": "Inversor · San Carlos",
      "dias": [["2025-05-03", 3, 412]],  // [fecha, nivel 1..4, lecturas]; solo días CON datos
      "n_dias": 412,                     // días con datos en el rango
      "huecos": [{ "desde": "2025-06-27", "hasta": "2025-09-03", "dias": 69 }],  // ≥ 3 días, los más largos primero, máx. 5
      "completa": true,                  // false si alguna caja de AgroDash no respondió
      "fallas": []                       // [{ "caja", "motivo" }]; con fallas, `huecos` va vacío
    }
  ]
}
```

- Nivel = lecturas del día contra el percentil 90 de lecturas diarias de esa fila
  en el rango: 1 (< 25 %), 2 (< 50 %), 3 (< 90 %), 4 (≥ 90 %). Un día ausente es 0.
- Semanas en columnas y días de la semana en filas (lunes arriba), etiquetas de
  mes arriba, leyenda «Menos … Más», `title` por celda con fecha y lecturas.
- En pantallas angostas el calendario se desplaza en horizontal dentro de la
  tarjeta y arranca mostrando lo más reciente.

### 4.5 Fuente en `_grafico`

ChartSpec v1 gana un campo **opcional** `fuentes?: SourceId[]`. Sin él, el
frontend sigue mostrando `supabase_pv` (comportamiento actual).

## 4.7 Fallas

Todo error de una tool llega al modelo como `Error: {tipo, herramienta, detalle,
sugerencia, reportada}` (`agent/fallas.py`). `tipo` ∈ `parametro_invalido`,
`fuente_no_disponible`, `base_no_disponible`, `tiempo_agotado`, `error_interno`.
Salvo `parametro_invalido`, se reporta por `agent/notificar.py`, el único punto de
salida hacia el sistema de notificaciones. Un resultado parcial se marca
(`completa: false`) con su motivo; nunca se presenta como completo.

## 5. Catálogo de secciones

Fuente de verdad: `mvp-debugger/app/lib/navegacion/secciones.json`
(`{version, secciones: [{id, ruta, etiqueta, descripcion, muestra[], fuentes[], params[{nombre, tipo, descripcion}]}]}`).
- El frontend deriva de ahí `sections.ts` (agrega íconos y badges) y el armador
  de enlaces.
- El frontend lo lee tipado y validado desde `app/lib/navegacion/catalog.ts`.
- El backend lee una copia en `agente-historico/src/historico/conocimiento/datos/`
  (gitignored) que deja `scripts/sincronizar-conocimiento.py` junto con
  `docs/memoria`, `docs/referencia` y `docs/conceptos`. Se corre en local una vez
  y en el deploy **antes** del rsync (el contexto de build es `agente-historico/`).
  Si falta la copia, las tools responden «documentación no disponible», nunca 500.

## 6. Tools nuevas (las registra el líder en la integración)

| Tool | Devuelve | Para qué |
|---|---|---|
| `catalogo_datos(consulta?, fuentes?)` | resumen corto + `_selector_variables` | «¿qué datos hay?» |
| `plan_exportacion(plan)` | resumen + estimación + `_descargas` | archivos combinados o separados |
| `buscar_documentacion(consulta, max=5)` | extractos ≤ 600 caracteres + `_documentos` | preguntas sobre el proyecto |
| `navegar_consola(objetivo, params?)` | sección elegida + `_navegacion` | «¿dónde veo…?» |
| `origen_dato(variable)` | fuente, tabla, cadencia, cobertura | «¿de dónde sale…?» |
| `calendario_datos(desde?, hasta?, fuentes?)` | días con datos y huecos por fuente + `_calendario` | «¿dónde hay huecos?», «qué se registró» |

`exportar_datos` (v1) sigue existiendo para el caso de una tabla cruda.

## 7. Modo simple / avanzado (frontend)

- Cookie `av_modo=simple|avanzado` (legible en el servidor: sin parpadeo).
- `/` dibuja el chat a pantalla completa, sin barra lateral. Con `av_modo=avanzado`
  redirige a `/tablero`.
- `/tablero` es el tablero actual. `/?clima=…`, `/?desde=…` (enlaces viejos)
  redirigen a `/tablero` con la misma query.
- Conmutador Simple / Avanzado en la cabecera de ambos modos; botón flotante
  «Preguntar» en avanzado que abre el chat.
