---
name: vistas-frontend
description: Las cinco vistas del frontend de análisis, construidas el 2026-09-01 sobre las fundaciones del 2026-08-28. Cierra lo que faltaba del encargo original. Regla dura: ninguna vista calcula, todo número sale del backend. Y lo que descubrió la vista de Calidad: 5.325 hallazgos de 28.509 no pueden pesar jamás en ningún veredicto, porque su fuente no tiene denominador contable
categoria: proyecto
actualizado: 2026-09-01
tags: [frontend, nextjs, echarts, mvp-debugger, evaluacion-datos, calidad]
---

# Las cinco vistas de análisis (2026-09-01)

Las fundaciones eran del 2026-08-28 ([[consola-analitica]]): rutas, seis primitivas de gráfico,
tipos y rango de fechas en la URL, **con las pantallas sin componer**. Eso era **lo que faltaba del
encargo original** y quedó cerrado el 2026-09-01.

## Qué hay

| Ruta | Vista |
|---|---|
| `/` | Tablero |
| `/series` | Series de tiempo |
| `/estadistica` | Análisis estadístico |
| `/calidad` | Calidad de datos |
| `/comparativa` | Comparativa entre arreglos |

Y del lado del servidor, para servirlas:

- **`analitica/rendimiento`**, **`analitica/energia`** y **`analitica/variables`**, tres endpoints
  nuevos.
- **Paginación en `calidad/hallazgos`**, que sin ella devolvía decenas de miles de filas de una vez.
- **Bloque `vigilancia` en `calidad/resumen`**, que es donde vive el hallazgo de más abajo.

## La regla dura: ninguna vista calcula

**Todo número que se pinta sale del backend.** No hay una sola operación aritmética en el cliente,
ni siquiera un promedio o un porcentaje.

No es purismo: el proyecto ya pagó por tener el mismo indicador definido dos veces. `comparativa.py`
calculaba **su propio Performance Ratio a 5 minutos** mientras `rendimiento.py` calculaba el diario,
así que convivían dos números con el mismo nombre y distinto valor ([[implementacion-decisiones-lcv]]).
Una vista que calcula es exactamente la tercera copia de esa definición, con la agravante de que
nadie la testea.

Es la continuación natural del contrato de [[capa-analitica]]: los algoritmos son funciones puras y
la misma función sirve a la API, a la tool y al CLI **para que los tres den el mismo número**. La
UI se suma a esa lista como consumidor, no como calculadora.

## Lo que descubrió la vista de Calidad: hallazgos que no pueden pesar nunca

Medido sobre los **28.509 hallazgos** que había en el store antes de la carga del 2026-09-01:

> **5.325 hallazgos (casi uno de cada cinco) no pueden pesar jamás en ningún veredicto.**

El motivo es el que ya tiene nombre en este proyecto: **su fuente no tiene denominador contable**.
Son los hallazgos sobre las **cuatro POA**, `kt_star` y `cs_ghi_wm2`, y `contexto.py` no sabe contar
filas de esas fuentes, así que la materialidad (`n_afectadas >= 0,20 × n_dia`) no se puede evaluar y
el hallazgo queda fuera del veredicto ([[abiertos]]).

Esto **no es un bug nuevo**: es la consecuencia visible de un pendiente ya anotado. Lo nuevo es que
antes era invisible. La vista los mostraba mezclados con el resto, o sea que un usuario podía leer
"28.509 hallazgos" y suponer que los 28.509 cuentan.

**Cómo quedó:** el backend publica dos campos separados, **`hallazgos_en_el_periodo`** y
**`cuentan_para_el_veredicto`**, y la vista muestra los dos. Es la regla 1 de
[[silencio-leido-como-salud]] aplicada al revés de lo habitual: no se trata de que un cero se lea
como salud, sino de que **un total grande se lea como cobertura**. Un número que no dice qué parte
de él es operante engaña igual.

## Verificación

| | |
|---|---|
| Tests de backend | **490** |
| Tests de frontend | **235** |
| `lint` | limpio |
| `tsc` | limpio |

La suite de backend venía de 462 al cierre del 2026-08-31 ([[implementacion-decisiones-lcv]]).

⚠️ La verificación de la UI sigue sin navegador (`tsc` + `react-dom/server` + el arnés
`npm run verificar`), porque la extensión de Chrome no conecta ([[verificacion-consola]]).

## Lo que estas vistas todavía no son

Las pantallas del doc de evaluación tienen **8 visualizaciones especificadas** con detalle
([[graficos-evaluacion]]) y **7 ambigüedades sin resolver con el autor**. Que las cinco vistas
existan no quiere decir que cubran las ocho figuras tal como el doc las pide: eso hay que
contrastarlo figura por figura antes de darlo por entregado.

Relacionado: [[consola-analitica]], [[capa-analitica]], [[graficos-evaluacion]],
[[mvp-debugger]], [[verificacion-consola]], [[store-hallazgos-calidad]],
[[silencio-leido-como-salud]], [[implementacion-decisiones-lcv]], [[abiertos]],
[[catalogo-metricas-evaluacion]].
