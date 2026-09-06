---
name: verificar-midiendo-el-dom
description: Cómo se verifica el responsive en este proyecto: recorriendo el DOM real y clasificando el desbordamiento, no mirando capturas. Incluye las cuatro trampas que hicieron mentir a la verificación, entre ellas que `--window-size` no produce un viewport real bajo 500 px en macOS
categoria: decision
actualizado: 2026-09-03
tags: [frontend, verificacion, responsive, metodo, chrome]
---

# Verificar el responsive midiendo el DOM, no mirando capturas

Decidido el 2026-09-03, trabajando el responsive del MVP ([[responsive-mvp]]).

## La decisión

Para afirmar que una pantalla "se ve bien" a cierto ancho **no vale una captura**. Se recorre el
DOM real en un navegador de verdad y se clasifica cada elemento. Una captura te dice que algo se ve
raro; no te dice cuál de los 450 elementos lo causa, y sobre todo **no te dice lo que falta**: el
contenido recortado sin barra de desplazamiento es invisible tanto en la pantalla como en la foto.

## La distinción que hace útil la medición

Contar "elementos que desbordan" no sirve, porque mezcla el defecto con el arreglo:

- **Desborda con `overflow-x` en `auto` o `scroll`** → *correcto*. Es lo que hace que haya algo que
  desplazar. Una tabla ancha dentro de su caja desplazable es exactamente la solución.
- **Desborda con `overflow-x` en `visible`, `hidden` o `clip`** → *defecto*. El dato existe, no se
  ve, y **nada indica que falte**. Es la misma familia de fallo que
  [[silencio-leido-como-salud]]: la ausencia se lee igual que la normalidad.

El indicador que resume todo es `documentElement.scrollWidth > clientWidth`: si el cuerpo de la
página se desplaza de lado, hay un defecto en alguna parte, sin excepción.

## Las cuatro trampas (todas costaron trabajo real)

**1. `--window-size` no produce un viewport real bajo ~500 px en macOS.** Chrome fija un ancho
mínimo de ventana y **solo recorta la imagen**: las media queries se evalúan con otro ancho. O sea
que capturás algo que creés de 390 px y está maquetado a 500. Dos agentes verificaron así y sus
primeras conclusiones eran falsas, justo en la franja donde vive el problema. **Hay que usar
`Emulation.setDeviceMetricsOverride` por CDP**, o medir dentro de un iframe con ancho CSS
explícito, que sí lo respeta. Comprobación barata de que el ancho se aplicó: que la misma pieza dé
alturas distintas a anchos distintos.

**2. Un informe limpio puede significar que no se midió nada.** La primera versión del instrumento
dio cero desbordamientos en el Tablero, y era cierto, pero habría dado exactamente lo mismo si la
página no hubiera cargado. **Todo informe lleva prueba de vida**: cuántos elementos hay, qué dice
el `h1`, cuántos lienzos, y si cayó en la pantalla de login. Sin eso, "todo bien" y "no medí" se
ven iguales.

**3. El que desborda casi nunca es el que hay que arreglar.** Cuando un hijo es más ancho que su
padre, quien reporta `scrollWidth > clientWidth` es el **padre**, y la cadena hacia arriba: `html`,
`body`, `.app`. La lista señala contenedores y esconde al culpable. Hay que buscarlo al revés: el
elemento **hoja** cuyo borde derecho se sale de la página.

**4. Tres falsos positivos que hacen desconfiar del instrumento.** Los tres se descubrieron
señalando como roto algo que estaba bien:
- un **cajón cerrado** sigue siendo `fixed` y midiendo el alto de la pantalla, pero está corrido
  hacia afuera y no tapa nada. Marcaba `/docs` como roto justo por tener el patrón bien resuelto;
- una **columna lateral de alto completo** en escritorio también es `sticky` al 100 %, pero le quita
  sitio al costado, que es para lo que existe. Solo cuentan las **bandas horizontales de ancho
  completo**;
- el **contenido dentro de una caja que desplaza** se sale del borde por diseño. Sin esa excepción
  el instrumento denunciaba el arreglo, y encima una vez por celda de la tabla.

## Qué medir, además del ancho

El ancho no captura la queja principal. Una barra puede caber perfecta a lo ancho y aun así
arruinar la pantalla: al envolverse en varias filas crece a lo **alto** y, si es pegajosa, se lleva
ese alto durante **todo** el desplazamiento. Por eso se mide también **el alto de cada banda
pegajosa como porcentaje de la pantalla**. Criterio adoptado: **ninguna banda horizontal por encima
del 15 %**.

## Cómo verificar, en la práctica

El instrumento vivió en `mvp-debugger/public/_medir.html` y **se borró al terminar**: no puede
viajar a producción. Si hace falta otra vez, se reconstruye con esta receta:

1. Página que carga la ruta objetivo en un `<iframe>` de ancho CSS fijo, un ancho por vez.
2. Espera después del `load`: las vistas piden datos al montar, y sin espera se mide el esqueleto
   de carga, que siempre entra y siempre sale limpio.
3. Recorrido del DOM clasificando según lo de arriba, con prueba de vida.
4. El informe se **publica por HTTP** a un sumidero local. Con `--dump-dom` no funciona: obliga a
   `--virtual-time-budget`, y el tiempo virtual **no avanza mientras haya animaciones pendientes**;
   ECharts anima al entrar y el navegador se cuelga sin volcar nada.
5. **Una ruta por instancia de Chrome, en serie.** Con varias pestañas a la vez el navegador
   estrangula los temporizadores de las que no están al frente y el informe se pierde entero, sin
   ningún error.

## Un pliegue del entorno que hay que conocer

El dev server tiene gate de acceso y **redirige todo a `/login`**, así que una verificación
automática mide la pantalla de login creyendo que mide la vista. Se abre solo para el proceso local
arrancando con `DEBUGGER_PASSWORD=` **en blanco**, sin tocar `.env.local`: `@next/env` no pisa una
variable que ya está presente en el entorno, y una cadena vacía cuenta como presente. En desarrollo
el middleware deja pasar cuando no hay password configurada. **Hay que devolverlo a su estado al
terminar.**
