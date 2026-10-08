---
name: informe-excel
description: Informe en Excel de un periodo (2026-10-05, en la rama feat/informe-excel, sin fusionar). Tablas deterministas desde la capa analítica y una lectura redactada por el modelo, que solo puede citar hechos del propio libro. Endpoint /informe, tool preparar_informe, botón en Descargas y descarga desde el chat
categoria: proyecto
actualizado: 2026-10-05
tags: [informe, excel, agente-historico, descargas, lectura, verificacion]
---

# Informe del periodo en Excel

**Estado:** implementado el 2026-10-05 en la rama `feat/informe-excel` (worktree aparte). **Sin
fusionar ni desplegar.** 590 tests de backend y 359 de frontend en verde, `tsc` y `lint` limpios.

## De dónde sale

Del análisis de valor del 2026-10-05: nadie del equipo abre la consola por su cuenta. Lo que sí
usan son **los documentos** que se cruzan con Leo y **las descargas**, y con los datos crudos
rearman a mano en MATLAB la limpieza que la capa analítica ya hace. Decisión de Isaac: que el
agente genere un informe útil sobre la data, en Excel.

Decisiones de Isaac ese día: **rango libre**, se pide con **botón en Descargas y desde el chat**,
la lectura llega a **hechos + hipótesis** (sin recomendaciones), y el formato es **solo Excel**.

## Regla que sostiene todo: el modelo no escribe ningún número

- `historico/informe/` arma las hojas llamando a las **mismas funciones** que los endpoints
  (`rendimiento.consultar`, `energia.por_dia`, `contexto.dias`, `reporte.hallazgos_por_tipo`).
  No tiene SQL propio.
- El modelo recibe una **tabla de hechos** (H1, H2, ...), no las hojas, y escribe marcas
  (`[[H7]]`) que el código reemplaza por el valor con su unidad.
- `verificar.py` rechaza la lectura si aparece una cifra suelta que no esté en los hechos ni en
  las advertencias, o una cita a un hecho inexistente. Un rechazo se reintenta una vez; si vuelve
  a fallar, **el libro sale igual, sin lectura, y lo dice** en la hoja Resumen y en la cabecera
  `X-Informe-Lectura`.
- **Límite que hay que tener presente:** el verificador garantiza las **cifras**, no la
  **interpretación**. Con Haiku las cifras salían bien pero atribuidas al indicador equivocado
  ("57 días con el inversor operativo" citando los días con datos). Por eso la lectura usa por
  defecto `claude-opus-5-5` (variable `INFORME_MODEL`), no el modelo del chat.

## El libro

Hojas: **Resumen** (lectura, advertencias, tabla de hechos con su origen), **Diario** (un renglón
por día de calendario), **Mensual** (con fila Total), **Disponibilidad**, **Calidad**,
**Gráficos** (nativos de Excel) y **Método** (parámetros, trazabilidad y diccionario de columnas).

- Las hojas de datos llevan la **cabecera en la fila 1** y columnas en snake_case con la unidad en
  el nombre, para que `readtable` y `pandas.read_excel` las lean sin saltar filas.
- Celda vacía es sin dato, nunca cero; el motivo va en la columna `motivo`.
- El PR de un día que no pasa `rendimiento.evaluar_dia` **no se escribe**.
- `hasta` es **inclusivo**, igual que en Descargas y al revés que el resto de `/analitica`.

## Medido contra producción (2026-10-05)

| Periodo | Tiempo | Costo de la lectura |
|---|---|---|
| Un mes, sin lectura | 3,7 s | 0 |
| Jun a ago 2026, con lectura | 22 s | US$ 0,05 |
| Todo el histórico, sin lectura | 5,2 s | 0 |

Todo el histórico da **660 días de calendario, 331 con datos, 118 con la planta parada**, que
coincide con lo que ya estaba en memoria ([[inversor-sin-acoplar]]).

## Pendiente

- Fusionar la rama y desplegar (dependencia nueva: `openpyxl`).
- Que el equipo lo use y diga qué hoja falta o sobra. Sin eso es otra pieza sin usuario.
- No estima la **energía perdida** por las paradas: hace falta acordar el método con Leo.
- Con el corte de 60 s de nginx, un informe con lectura de todo el histórico queda justo. Si pasa
  de ahí, va como trabajo en segundo plano ([[consultas-cruzadas]] ya propone ese mecanismo).

Relacionado: [[capa-analitica]], [[agente-historico]], [[mvp-debugger]], [[performance-ratio-diario]].
