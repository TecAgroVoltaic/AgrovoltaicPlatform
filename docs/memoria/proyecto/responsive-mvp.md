---
name: responsive-mvp
description: El responsive de las siete pantallas del MVP, rehecho el 2026-09-03 y desplegado. La barra de navegación pasó de comerse el 25 % de la pantalla del teléfono (60 % en la consola) al 6 %, y 768 px dejó de recibir la maqueta de escritorio
categoria: proyecto
actualizado: 2026-09-03
tags: [frontend, responsive, mvp-debugger, navegacion, css]
---

# El responsive del MVP, rehecho

Trabajo del 2026-09-03 sobre `mvp-debugger`, desplegado en producción
(`agrovoltaic-consola.vercel.app`). Alcance: las cinco vistas de análisis
([[vistas-frontend]]) más `/consola` y `/docs`. Método y trampas de la verificación:
[[verificar-midiendo-el-dom]].

## Lo que estaba roto, medido

| pantalla | antes | después |
|---|---|---|
| Banda pegajosa a 390 px | `.side` 226 px = **25 %** de pantalla | 52 px = **6 %** |
| `/consola` a 390 px | `.side` 543 px = **60 %** | 52 px = **6 %** |
| A 768 px | barra lateral de escritorio, 100 % | 52 px = **6 %** |
| Contenido útil a 768 px | 538 px | **736 px** |
| Desplazamiento lateral del cuerpo | en `/calidad`, `/series` y `/docs` | **0 de 35 casos** |

## Los tres hallazgos que no se veían leyendo el CSS

**768 px caía del lado equivocado del corte por 8 píxeles.** Había un único
`@media (max-width:760px)`, así que **el ancho de tablet más común que existe** (iPad vertical)
recibía la barra lateral de escritorio entera: 230 px de ancho fijos más una barra de rango
pegajosa de 229 px de alto. Un cuarto de pantalla perdido antes del primer dato. El corte correcto
resultó ser **900 px**, y lo comparten hoy los tres cascarones.

**`.app { align-items: flex-start }` estiraba la página entera.** Al pasar a columna en pantallas
angostas, ese `align-items` dejaba a `.content` en *shrink-to-fit*: cualquier hijo con ancho mínimo
de contenido mayor que la ventana **ensanchaba el documento**. Ni `flex:1` ni `min-width:0` lo
evitan, porque los dos actúan sobre el eje principal y en columna el ancho es el transversal. Era
el mecanismo detrás del desplazamiento lateral de tres pantallas. Hoy lo cubre `display:block`.

**Una media query no aporta especificidad.** Un override escrito dentro de `@media` **antes** que
su regla base, en el mismo archivo, está muerto: las dos valen (0,1,0) y gana la que aparece
después. Así quedó inerte el "la barra de rango deja de estar pegada", y la barra siguió pegajosa
ocupando **342 px = 38 %** a 360 px, o sea peor que el defecto original. Se corrigió y **se escribió
un auditor que recorre las 627 reglas de `globals.css`** buscando el mismo patrón: era la única.

## Decisiones de diseño

**Cajón con hamburguesa, no riel horizontal.** Hay 7 destinos y la etiqueta es lo que distingue
"Calidad" de "Comparativa": en un riel a 390 px entran tres y las otras cuatro quedan fuera sin nada
que lo anuncie. Además `/docs` ya había resuelto el patrón, y dos gramáticas de navegación en la
misma aplicación obligan a aprender dos veces lo mismo.

**La barra de rango deja de ser pegajosa por debajo de 1280 px**, que es donde su formulario colapsa
a un solo renglón (medido, no elegido redondo). El criterio es una razón, así que la consulta mira
los dos términos: `@media (max-width:1279px), (max-height:879px)`.

**El plegado de `/consola` vivía mitad en CSS y mitad en JS** (`.side.compacta` contra
`ancha ? nombre : inicial`), y en móvil se contradecían: nav con nombres completos y selector de
agente en "H"/"P". Se unificó forzando `ancha` cuando la barra va en cajón. Hay una prueba que
compara el umbral de JS contra la media query **leyendo el archivo CSS**, porque el defecto nació
justamente de que esos dos números se separaran en silencio.

**Container queries sobre media queries** donde el ancho que manda es el del contenedor: con la
barra lateral comiéndose 230 px, a 1024 px de ventana el contenido tiene ~700 px, y una media query
de ventana no lo sabe.

**El alto de los gráficos pasó de 320 px fijos a `clamp(240px, 60cqw, 340px)`.** Se descartó
`aspect-ratio`: deduce un ancho mínimo a partir del alto mínimo e inflaba la página a 458 px de
ancho (medido).

## Decisión pendiente del usuario

En un **portátil de 13 pulgadas a pantalla completa** la barra de rango ya **no** se queda pegada
arriba, porque ahí cuesta el 16,5 % de la pantalla. Es una pérdida real del "siempre a la vista" a
cambio de cumplir el criterio del 15 %. Si se prefiere pegada, es cambiar el `879` de la consulta.

## Deuda que quedó anotada

- `bars.ts` reserva **96 px fijos** a la derecha para las etiquetas de barra horizontal, que en un
  lienzo de 286 px es un tercio del ancho. Hoy ninguna vista usa esa ruta; si Calidad la cablea, hay
  que hacerla proporcional.
- La leyenda de ECharts **pagina** en lienzos angostos: a 286 px se ven 2 de 4 ítems y hay que usar
  las flechas. Es mejor que recortada y encima de la trama, pero es un cambio de comportamiento
  visible en Series y Comparativa.
- `tablero.module.css` (300 líneas) y `Console.tsx` (245) siguen por encima de la guía de 150.
