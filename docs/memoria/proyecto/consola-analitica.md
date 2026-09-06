---
name: consola-analitica
description: Fundaciones del frontend de análisis (2026-08-28); el sistema de análisis pasa a ser la sección principal del mvp-debugger y la consola de agentes se mueve a /consola. ECharts 6 tree-shakeable con wrapper propio, seis primitivas tipadas, el estado del gráfico como unión discriminada que exige un motivo para el vacío, y el rango de fechas en la URL. Las vistas que faltaban se construyeron el 2026-09-01: ver vistas-frontend
categoria: proyecto
actualizado: 2026-09-01
tags: [frontend, nextjs, echarts, tipos, mvp-debugger, evaluacion-datos]
---

# Consola de análisis: las fundaciones (2026-08-28)

Lo construido en el `mvp-debugger` para servir la capa de algoritmos ([[capa-analitica]]).
**Son fundaciones: las vistas todavía no están construidas**, y eso es lo que falta del encargo
original ([[graficos-evaluacion]]).

> **2026-09-01: las cinco vistas ya están construidas.** Esta nota se queda como el registro de las
> **fundaciones** y de por qué son como son (el wrapper de ECharts, la unión discriminada, el rango
> en la URL, el eje en UTC). Lo que se construyó encima vive en [[vistas-frontend]].

## El sistema de análisis es ahora la sección principal

| Ruta | Qué es |
|---|---|
| `/` | análisis (raíz) |
| `/series` | series de tiempo |
| `/estadistica` | análisis estadístico |
| `/calidad` | calidad de datos |
| `/comparativa` | comparativa entre arreglos |
| `/consola` | la consola de agentes, **entera y sin recortes** |

La consola de agentes ([[mvp-debugger]]) **se conserva completa**: se movió, no se reemplazó. La
razón del movimiento es de producto, no técnica: quien entra a la herramienta viene a mirar los
datos, y el depurador de agentes es una vista de trabajo interno.

## ECharts 6 con registro selectivo

Se usa la **API tree-shakeable** de ECharts 6 con **wrapper propio**, sin `echarts-for-react`.

Coste medido de First Load JS:

| Caso | Peso |
|---|---|
| Página sin gráfico | 88,9 kB |
| Página con una primitiva | 317 kB |
| Con el import completo de ECharts | 457 kB |

O sea que el registro selectivo **ahorra 140 kB gzip, un 38 %**. La medición es lo que justifica
el wrapper: sin ella, `echarts-for-react` era la opción obvia y más barata de escribir.

**Seis primitivas de gráfico tipadas:** serie temporal, barras, box plot, heatmap de carpeta,
dispersión con ajuste, gráfico de crestas. Cubren las figuras del doc de evaluación
([[graficos-evaluacion]]).

## El estado de un gráfico es una unión discriminada

La decisión de diseño más importante del frontend, y es de tipos, no de píxeles.

- **`data` solo existe con `status: "ready"`.** No hay forma de leer los datos de un gráfico que
  no los tiene.
- **El estado `empty` EXIGE un motivo**, de un conjunto cerrado: `NO_ROWS`, `ALL_NULL`,
  `OUT_OF_COVERAGE`, `NO_SOURCE`, `FILTERED_OUT`. **No se puede pintar un gráfico vacío sin decir
  por qué.**
- Lo mismo en las métricas: con `status: "missing"` **el campo `value` no existe**, así que un
  `?? 0` distraído **no compila**.

Es el contrato de Python llevado al sistema de tipos. En Python, `resultado.metrica` con `n = 0`
devuelve `None` y jamás cero, porque un cero y un "no hay dato" se ven igual cuando salen
desnudos. En TypeScript la misma regla se vuelve **imposible de saltar**: el compilador rechaza
el código que confunde las dos cosas.

Los cinco motivos de vacío no son decorativos: distinguen *no hay filas* de *todas nulas* de *la
variable no existía en ese rango*, que es exactamente la confusión que se pagó en
[[silencio-leido-como-salud]] y que `catalogo.fuera_de_cobertura` resuelve del lado del servidor.

## El rango de fechas vive en la URL

`?desde=&hasta=&granularidad=`, con **`hasta` exclusivo** (el mismo `[desde, hasta)` de
`analitica.ventana`).

Dos ganancias: el estado es **compartible** (un hallazgo se manda por enlace, no por captura de
pantalla) y **los Server Components lo leen** sin cliente de estado. Es la traducción a la web de
la regla de que el rango de fechas es parámetro de primera clase
([[algoritmos-antes-que-agente]]).

## Eje temporal con `useUTC: true`, a propósito

Los timestamps de la base son **hora local etiquetada UTC** ([[capa-analitica]], y la regla
completa en el brief). Poner el eje en UTC es lo que hace que el gráfico muestre la hora que el
dato dice. Dejar que ECharts convierta a la zona del navegador correría todos los perfiles
diarios seis horas, y el error sería silencioso porque el gráfico seguiría dibujándose bien.

## ESLint: no había, y lo que apareció al instalarlo

Se instaló ESLint (el proyecto **no tenía**). Encontró y se corrigió **una violación real de
`rules-of-hooks`**: una función llamada `usePreset` que **no era un hook**, y que por llamarse
`use…` quedaba sujeta a las reglas de los hooks.

La deuda preexistente quedó **medida y separada**, no arrastrada:

| Origen | Errores |
|---|---|
| `app/docs/content` (`react/jsx-key`) | 182 |
| Consola vieja (`react-hooks/exhaustive-deps`) | 5 |
| **Total** | **187** |

- **`npm run lint`** cubre el sistema nuevo y **debe estar en cero**.
- **`npm run lint:todo`** muestra la deuda vieja.

Separarlos es lo que evita el final habitual: un linter que siempre falla es un linter que nadie
mira.

## Verificación

`tsc` sin errores · `npm run build` con **13 rutas** · **30 tests** · **194 chequeos** del arnés
`npm run verificar`. El arnés sigue siendo la forma de verificar la UI sin navegador, porque la
extensión de Chrome no conecta ([[verificacion-consola]]).

## ~~Lo que falta~~ Hecho el 2026-09-01

~~**Las vistas no están construidas.** Existen las rutas, las primitivas, los tipos y los
endpoints; falta componer las pantallas del doc de evaluación. Es el pendiente principal del
frente.~~

**Construidas el 2026-09-01**: `/` Tablero, `/series`, `/estadistica`, `/calidad` y `/comparativa`,
con tres endpoints nuevos y la regla de que **ninguna vista calcula** → [[vistas-frontend]].

Lo que sigue abierto no es la construcción sino el **contraste figura por figura** contra las 8
visualizaciones que especifica el doc ([[graficos-evaluacion]]), con sus 7 ambigüedades sin
resolver con el autor.

Relacionado: [[vistas-frontend]], [[capa-analitica]], [[mvp-debugger]], [[graficos-evaluacion]],
[[verificacion-consola]], [[algoritmos-antes-que-agente]], [[silencio-leido-como-salud]],
[[catalogo-metricas-evaluacion]], [[abiertos]].
