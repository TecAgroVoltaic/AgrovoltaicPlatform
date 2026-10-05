---
name: verificacion-consola
description: Cómo verificar la consola sin navegador (tsc + react-dom/server) porque la extensión de Chrome no conecta, y las trampas de la operativa local
categoria: proyecto
actualizado: 2026-08-21
tags: [consola, verificacion, nextjs, gotchas]
---

# Verificar la consola sin navegador

**El problema de fondo:** la extensión de Chrome que da control del navegador **no conecta**
(`Browser extension is not connected`). Sin ella no hay forma de mirar una vista renderizada, y
todo el trabajo de UI se hace a ciegas sobre el resultado visual. Esto ya costó defectos que
llegaron hasta la pantalla del usuario (ver abajo).

## La técnica: renderizar de verdad y afirmar sobre el HTML

Los componentes se compilan con `tsc` a un árbol aparte y se renderizan con `react-dom/server`.
No es un mock: es el mismo componente con los mismos datos. Lo que se verifica no es "compila",
sino **propiedades del resultado**.

Los tres pasos:

1. Un `tsconfig` aparte que apunte al repo, con `"jsx": "react-jsx"` (con `"react"` a secas
   fallan todos los archivos por el `import React` que Next no necesita), `"module": "commonjs"`
   y `"strict": false`.
2. Un script que **redirija la resolución de módulos**: `Module._resolveFilename` traduce los
   alias `@/...` al árbol compilado, y `react`/`react-dom` al `node_modules` real.
3. Aserciones sobre el string de `renderToStaticMarkup`.

En la sesión del 21-ago esto dio **44 chequeos**, y encontró defectos reales que ninguna prueba
de tipos habría visto.

## Qué vale la pena afirmar (y qué no)

Lo que sirve son **invariantes de diseño**, no snapshots:

- **Que no vuelva el vocabulario viejo.** Regex sobre el HTML buscando los nombres superados.
  Es lo que evita que un renombre quede a medias.
- **Que no queden coordenadas absolutas** (`style="left:`, `top:`, el ancho `1140`): es la
  aserción que convierte "hice el layout fluido" en algo verificable.
- **Presupuesto de contenido**: ningún texto pasa de N caracteres. Cuando el pedido es "que sea
  breve", la brevedad tiene que ser una prueba, no una intención.
- **Relaciones estructurales**: que ninguna flecha cruce la línea divisoria, que cada zona cubra
  exactamente sus pasos, que las secciones del modal sigan estando.

Lo que NO sirve: comparar el HTML entero contra un snapshot. Se rompe con cada cambio de estilo
y no dice nada.

## Trampas de la operativa local (todas costaron tiempo real)

- **`npm run build` con `next dev` vivo destruye el `.next` compartido** y **rompe el dev server
  del usuario** (`MODULE_NOT_FOUND` sobre `webpack-runtime.js`, `PageNotFoundError` en
  `/api/login`). Pasó **dos veces**. El orden correcto es siempre: parar dev → `rm -rf .next` →
  `build` → `rm -rf .next` → relanzar dev.
- **`#tip` tenía `white-space:nowrap` junto con `max-width`.** Esa combinación **no envuelve:
  recorta**. Afectaba a toda la consola (gráficas y grafo de arquitectura), no a una vista.
  Arreglado con `width:max-content`.
- **`renderMd` siempre envuelve en `<p>`**, así que su salida **no puede ir dentro de un
  `<span>`**: es anidado inválido, el parser expulsa el párrafo y la regla CSS que lo apuntaba
  deja de alcanzarlo. Va en un `<div>`.
- **Colisión de clases CSS.** `.arq-ayuda` ya existía para el texto de la leyenda del lienzo
  cuando se agregó una sección homónima al modal. Antes de nombrar una clase, `grep`.
- **`overflow:hidden` en una caja de alto fijo recorta el texto en silencio**, que en una vista
  hecha para explicar es el peor defecto posible. Alto fijo → `min-height`.

## Dónde vive

El arnés se armó en el scratchpad de la sesión, **no está en el repo**. Reconstruirlo cuesta unos
minutos siguiendo los tres pasos de arriba. Promoverlo a `mvp-debugger/scripts/` está en
[abiertos](../pendientes/abiertos.md).

Relacionado: [[mvp-debugger]].
