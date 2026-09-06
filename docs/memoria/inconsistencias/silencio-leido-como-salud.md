---
name: silencio-leido-como-salud
description: Fallos con la misma forma: la ausencia de señal leída como señal de que todo está bien. Empezaron siendo cuatro el 2026-08-28 y ya son varios más; los que fallan hacia el lado tranquilizador son CINCO desde el 2026-09-01, cuando el veredicto siguió informando 274 días con datos porque su calendario salía de una tabla de apoyo que terminaba tres meses antes
categoria: inconsistencia
actualizado: 2026-09-01
tags: [calidad, qc, fallos-silenciosos, diseno, agente-historico, evaluacion-datos]
---

# La ausencia de señal leída como señal de salud

Al implementar la capa de algoritmos ([[algoritmos-antes-que-agente]]) aparecieron cuatro fallos
distintos que resultaron ser **el mismo error de diseño**: en los cuatro, **no encontrar un
problema se reportaba como "no hay problema"**, cuando lo correcto era "no lo busqué / no lo
podía ver". Los tres primeros estaban **vivos en producción**; el cuarto sigue siendo el estado
actual del barrido.

Todo lo que sigue está **verificado por consulta directa a la Supabase de producción el
2026-08-28**, no derivado de los CSV ni supuesto.

> Por qué se registran juntos y no como tres bugs sueltos: los tres fallan **en la dirección
> peligrosa**. Un falso positivo hace ruido y alguien lo mira; un falso negativo de calidad de
> datos se lee como "el dato está impecable" y nadie vuelve. Sobre esa lectura se toman
> decisiones.

## 1. `contexto.confianza` no encontraba los hallazgos de irradiancia

`historico.calidad.contexto.confianza` buscaba los hallazgos por el nombre **calibrado** de la
variable (`irradiancia_incidente_wm2`), mientras `hallazgos_calidad` los guarda con el nombre
**crudo** (`irradiancia_incidente`). Nunca cruzaban.

- **321 hallazgos invisibles** solo en irradiancia.
- Las **tres temperaturas** perdían **837** por lo mismo.

Cero hallazgos se lee como dato impecable, así que **la confianza salía perfecta justo cuando la
irradiancia estaba rota**. Y como el bloque de confianza se incrusta en toda métrica agregada
([[algoritmos-antes-que-agente]]), el error no se quedaba en un reporte: firmaba todos los
números del período.

**Lección:** cuando dos capas nombran la misma variable distinto (crudo contra derivado), el
`JOIN` que no matchea no devuelve error: devuelve vacío, y vacío es indistinguible de sano. El
mapeo entre nombres crudos y calibrados tiene que ser explícito y tener quien lo verifique.

## 2. La familia de validez física se aprobaba a sí misma

Las pruebas de validez física ([[pruebas-calidad-umbrales]], familia 2) se estaban leyendo contra
las **vistas corregidas** (`v_sc_electrico_corregido`, `v_sc_radiacion_corregida`). Esas vistas
**anulan por diseño** lo que cae fuera de rango físico.

Resultado: **siempre cero valores imposibles**. No porque el sensor estuviera bien, sino porque
la vista ya los había borrado. La prueba medía el trabajo de la vista, no el del sensor.

**Lección:** una prueba de calidad se corre contra el **crudo**. Si se corre contra la capa que
ya aplicó la corrección, lo único que se está verificando es que la corrección corrió. Esto es
consecuencia directa de la regla rectora del proyecto (crudo en la base, corrección en la capa de
análisis, ver [[decisiones]]): la regla salva el dato, pero obliga a decir **contra qué capa** se
evalúa cada cosa.

## 3. Un hallazgo sobre una fuente sin filas contadas invalidaba el día

El criterio de materialidad del barrido es `n_afectadas >= 0,20 × n_dia`: un día no deja de servir
porque 3 de 144 lecturas de una de trece columnas se salieran de rango
([[agente-historico-calidad]]).

Pero **con `n_dia = 0` la condición es cierta siempre**. Cualquier hallazgo sobre una fuente cuyas
filas nadie estaba contando invalidaba el día entero. El criterio pensado para *evitar* condenar
un día se daba vuelta y lo condenaba por defecto.

**Lección:** todo umbral relativo necesita su denominador **verificado antes de aplicarse**.
`n = 0` no es un caso raro: es exactamente el caso de las fuentes que no se están midiendo, o sea
justo donde el criterio no debería opinar.

## 4. El barrido vigila 14 de las 26 variables

Verificado contra `hallazgos_calidad`: de las **26 variables** del diccionario, el barrido mira
**14**. No mira `albedo`, las **cuatro** del SP722, `cs_ghi_wm2`, `kt_star` ni las **dos POA**.

Para esas variables, **"cero hallazgos" no significa que estén limpias: significa que nadie las
miró**. Es la misma confusión que los tres casos anteriores, pero de alcance en vez de bug: la
salida no distinguía "sin problemas" de "sin cobertura", así que la distinción no se podía hacer.
Ahora sí.

## Las reglas que salen de esto

1. **Cero hallazgos nunca se reporta solo.** Va siempre acompañado del **alcance**: qué variables
   se miraron, contra qué capa (crudo o corregida) y en qué ventana.
2. **Distinguir `sin_hallazgos` de `sin_cobertura`** en el modelo de salida, no en la prosa del
   reporte. Si son el mismo valor, la distinción se pierde en el primer consumidor.
3. **Las pruebas de validez física se leen contra el crudo.** Contra la vista corregida no miden
   nada.
4. **Ningún umbral relativo se aplica sin comprobar su denominador.**
5. **El nombre de una variable cambia entre capas**: el cruce crudo ↔ calibrado es explícito, y
   tiene un test que falla si deja de matchear.
6. Corolario de cobertura, no de código: antes de consultar hay que preguntar si las variables
   pedidas **coexistieron** en el rango. El SP722 tiene 18 días y el albedo empieza el 2025-10-25
   ([[fuentes-fisicas]]); una nube de cero puntos se lee como "no hay correlación" y no es lo
   mismo que "estas dos variables nunca convivieron".

## Un quinto caso, de la misma familia pero al revés (2026-08-28, más tarde)

El mismo día apareció **[[emparejamiento-por-timestamp]]**, que comparte la raíz y cambia la
forma: ahí **el `JOIN` sí devolvía filas**, así que nada parecía roto. Un `INNER JOIN` entre dos
series de cadencia distinta no falla ni avisa: devuelve el subconjunto en que los relojes
coincidieron, y ese subconjunto **no es una muestra aleatoria del período**. Conservaba el 15 %
de las lecturas, concentrado en dos meses, y con eso invertía la conclusión de qué arreglo rinde
más.

**Regla que se suma a las seis de arriba:** ningún cruce entre tablas de cadencia distinta se
hace por igualdad de timestamp, y **todo cruce reporta qué fracción de filas conservó**. Un
resultado que no dice sobre cuántas filas se calculó no se puede evaluar.

## Un sexto caso, y este está vivo en producción (2026-08-31)

`v_sc_electrico_corregido` aplica `CASE WHEN voltaje_vac < 100.0 OR voltaje_vac > 280.0 THEN NULL`,
o sea que **anula los 7.873 ceros** que Leo declaró dato válido el 2026-08-30. Cualquier análisis
que lea la vista corregida **es incapaz de ver un inversor caído a mediodía**, que es exactamente
lo que Leo pidió detectar.

Es literalmente el caso 2 de arriba (la validez física aprobándose a sí misma) aplicado a otra
variable: **la vista ya borró lo que la prueba busca**, y la salida sale tranquilizadora y falsa.
La diferencia es que allá el resultado era "cero valores imposibles" y acá es "cero inversores
caídos". Junto con el otro bug de la misma vista, en [[vista-corregida-no-corrige]].

**Confirma la regla 5** sin necesidad de agregar ninguna nueva: toda prueba declara **contra qué
relación se leyó**, y si esa relación corrige la variable que la prueba mira, la prueba no vale.

## Dos casos más de la misma familia, del 2026-08-31

Los dos salieron de medir la prueba de inversor caído ([[inversor-sin-acoplar]]), y ninguno es
código escrito: son formas de equivocarse que estuvieron a punto de entrar.

**La irradiancia usada como filtro se apaga sola y no lo dice.** `GHI >= 300` con GHI en NULL es
falso, así que la lectura no se marca y nadie se entera. Medido: perdería **8 días**, **3 de ellos
apagones de día entero** (2025-05-07, 2025-05-26, 2026-01-05). Un detector de averías que se apaga
solo en los 46 días sin irradiancia y no lo dice **es peor que no tenerlo**. De ahí la regla
adoptada: la irradiancia **gradúa la severidad**, no filtra, y cuando falta se marca igual con
motivo `sin_irradiancia` ([[decisiones]]).

**`NOT (...)` contra `IS NOT TRUE` al descartar filas contaminadas.** Con NULLs de por medio
`NOT(NULL)` descarta la fila, así que escribir `NOT (firma)` reduce la base de **35.979 filas en
274 días a 18.005 en 132**: **se pierde la mitad del histórico sin un solo aviso**. Es el mismo modo
de fallo en su versión más barata de cometer, y no hay nada en la salida que lo delate.

**Y una tercera, que es de lectura y no de código:** confundir "esta prueba marca 238 días" con
"esta prueba es la causa de que 238 días estén en rojo". Medido: quitar el rango 100-280 deja el
veredicto **igual** (206 y 206), porque esos días ya estaban graves por otra cosa
([[store-hallazgos-calidad]]). La atribución causal **hay que medirla aparte**, quitando la prueba
y volviendo a correr el veredicto, no deducirla del conteo.

## Un cuarto caso vivo en producción, y cierra el grupo (2026-08-31)

Hallado al implementar las decisiones de Leo ([[implementacion-decisiones-lcv]]).
`tools/calidad_periodo.py` llamaba `confianza(d, h, fuente)` **de forma posicional**, y la fuente
caía en el parámetro `variables`. Medido contra producción:

| Consulta | Reportaba | Real |
|---|---|---|
| Acotando a lo eléctrico | 258 días utilizables | **68** |
| Acotando a radiación | 258 | 196 |
| **Sin acotar (la llamada por defecto)** | **274** | **45** |

Con lo eléctrico, **190 días cambiaban de veredicto**. Y siempre en la misma dirección: **reportaba
más días utilizables de los que hay**.

### La trampa de diseño que lo hizo posible, que es lo que hay que arreglar

`confianza` **acepta que no le pasen variables**. En ese caso informa "sin acotar" y **no cuenta
nada**. O sea que **la forma de llamarla mal es también la más cómoda**: no falla, no avisa, y
devuelve el número más grande de todos.

Un parámetro opcional cuyo valor por omisión produce una respuesta plausible y falsa es una trampa
puesta, no un descuido de quien la pisó. **Hacer `variables` obligatorio** queda pendiente en
[[abiertos]].

### Los cinco que fallan hacia el mismo lado

De todo lo registrado en este archivo, hay **cinco** que comparten algo más fuerte que la forma:
**los cinco declaran sano lo que no lo es**, y todos estuvieron o están vivos en producción.

1. El **`CASE` que borraba los ceros** de las variables AC ([[vista-corregida-no-corrige]]).
2. La **prueba de validez leyendo la capa que borra justo lo que busca** (caso 2 de arriba).
3. La **irradiancia usada como filtro**, que se apaga sola en los días sin dato y no lo dice
   ([[inversor-sin-acoplar]]).
4. La **llamada posicional** que desactiva el acotado (justo arriba).
5. El **veredicto contando sobre un calendario de tres meses atrás** (2026-09-01, abajo).

Ninguno de los cinco produce un error, un log ni un valor raro. Los cinco producen **un número
más optimista**, que es exactamente el que nadie va a cuestionar.

## El quinto que falla hacia el lado tranquilizador: el veredicto contando sobre un calendario viejo (2026-09-01)

Hallado al cargar los 57 CSVs nuevos ([[dataset-actual]]). Se corrió **solo el barrido**, y **el
veredicto siguió informando 274 días con datos cuando la base ya tenía 331**.

La causa no está en el veredicto ni en el barrido, está entre los dos: **el calendario del veredicto
no sale de la tabla de datos, sale de la tabla de apoyo `ventana_solar`**, que terminaba el
**2026-06-01**. El barrido escribió los hallazgos de los días nuevos y **el veredicto no los podía
ver, porque para él esos días no existían**.

**No hubo error ni advertencia.** Devolvió un número plausible y viejo, del mismo orden de magnitud
que el correcto.

Lo que lo distingue de los cuatro anteriores, y lo hace más incómodo: los otros cuatro eran **bugs
en una expresión** (un `CASE`, un `NOT`, un argumento posicional, una tabla mal leída). Este es una
**dependencia entre pasos de un proceso**, donde cada paso estaba bien escrito y el orden no estaba
escrito en ningún lado. La forma de arreglarlo no es corregir una línea sino **hacer que el barrido
declare, o exija, la cobertura de su calendario**, que es la regla 1 de este archivo aplicada a una
tabla de apoyo.

La regla operativa que salió de acá (correr `historico todo` y nunca solo `barrido`) vive en
[[regla-post-carga]], con las cifras del arreglo.

Relacionado: [[regla-post-carga]], [[dataset-actual]], [[correccion-al-equipo]],
[[vista-corregida-no-corrige]], [[inversor-sin-acoplar]], [[energia-ac-tablero]],
[[implementacion-decisiones-lcv]], [[rango-fisico-en-cinco-sitios]],
[[unidades-energia-kwh]],
[[respuestas-lcv-consultas-agosto]],
[[agente-historico-calidad]], [[pruebas-calidad-umbrales]],
[[algoritmos-antes-que-agente]], [[fuentes-fisicas]], [[muestreo-variable]],
[[catalogo-metricas-evaluacion]], [[decisiones]], [[verificacion-numeros]],
[[emparejamiento-por-timestamp]], [[store-hallazgos-calidad]], [[capa-analitica]].
