---
name: respuestas-leo-cardinale
description: Respuestas oficiales de Leo Cardinale (LCV) a las 12 preguntas de tratamiento de datos + los 4 datos pendientes; fuente de verdad verbatim (doc rev LCV, 2026-08-10)
categoria: decision
---

# Respuestas de Leo Cardinale — tratamiento de datos San Carlos

Fuente: PDF **«Decisiones-Datos Energía Agrovoltaic rev LCV»** (respuestas dentro de las
anotaciones del PDF, autor `lcardinale`). Extraídas el **2026-08-10**. El documento base es la
consulta P1–P12 ([[decisiones]], `../../equipo/Preguntas-Profesor-Tratamiento-Datos.pdf`).

**Hilo conductor de todas las respuestas:** *guardar el valor **crudo** en la base y hacer las
correcciones en una **capa de análisis/posproceso**, generando **variables corregidas nuevas**.*
No destruir el dato original. Esto **cambia** decisiones previas del pipeline (ver [[decisiones]]).

## Respuestas verbatim (P1–P12)

| # | Tema | Respuesta de Leo (verbatim) |
|---|------|------------------------------|
| **P1** | Nombres de columnas | *"De acuerdo con esto. Si los nombres de las variables son muy largos, se podría hacer abreviaciones y se describen en alguna tabla de definiciones."* (y *"Correcto"* sobre la interpretación de `energia_hoy`/`energia_total`/`energia_pv1`/`pv2`). |
| **P2** | Temp fija 85 °C | *"Excelente haber identificado esa condición. Creo que se podría dejar el valor crudo y al hacer un análisis de la temperatura se hace un paso de limpieza de los datos considerando este error. Vale la pena que esto quede anotado para no olvidarlo cuando se vaya a hacer la limpieza de datos."* |
| **P3** | ¿Bitácora del sensor? | *"Si existe pero recién se implementó entonces esto no está indicado ahí. Ese error se debió a que el pegamento utilizando por el sensor dejó de funcionar, entonces se reparaba y volvía a fallar; en otro casos hubo un fallo de falso contacto en la conexión eléctrica."* |
| **P4** | Origen del −38,845 | *"Es normal (esperado) en este tipo de equipos. Es un asunto de calibración (exactitud). Para los analógicos también afecta el ruido eléctrico."* |
| **P5** | ¿0 o sumar desfase? | *"Creo que lo más convenientes es dejar el valor crudo, se corregiría en una etapa de análisis de los datos, generando una nueva variable corregida. El valor crudo podría tener alguna utilidad en el futuro."* |
| **P6/P7** | Filas mezcladas (56.063) | *"Creo que se refieren a un error previamente detectado que Joshua ya había trabajado. Si mal no recuerdo, algunos datos se recuperaron, otros quedaron con huecos de información; esto sería lo recomendable."* |
| **P8** | Ritmo de muestreo | *"En el archivo que les compartí de la metodología se definen los tiempos de muestreo. Para todas estas variables relacionadas a las producción eléctrica deben ser cada 5 min. Las mediciones de radiación se definieron cada 10s para hacer análisis puntales en casos particulares. Finalmente estas de cada 10s se cambiaron a cada 15s porque se hicieron pruebas con Thingspeak y no permitió muestreos con tiempos menores a 15s. Estos datos de radiación a 15s habíamos mencionado que se pueden tener en una base de datos aparte para aprovecharlos en caso de ser necesario. Mediciones con tiempos de muestreo menores a 10s posiblemente fue en etapas de prueba, se podrían conservar o promediar a cada 15s como deberían estar los más recientes."* |
| **P9/P10** | Límites de validez | *"Me parecen bien esos límites, sin embargo, creo que como en los anteriores, dejaría los valores crudos y considerando estos límites se haría el posprocesamiento."* Sobre temperatura: *"Propondría entre 10°C y 80°C."* |
| **P11** | ¿Falta la constante de calibración? | *"No se ha hecho ajuste. El nombre de la celda es ese, porque comercialmente se conocen con ese nombre."* → **no hay constante guardada; "celda calibrada" es el nombre comercial**, no significa que el dato venga escalado. |
| **P12** | Camino + SP722 | *"Dejar tal cual, luego tendremos que desechar los primeros porque estaban incorrectos."* SP722: *"Hubo una serie de atrasos con esta implementación, hasta mayo se logró echar a andar."* Irradiancia temprana: *"Hubo momentos, principalmente en los primeros meses del proyecto en que había un error en esa medición y se corrigió creo que a mediados del 2025; entonces esas mediciones previas no serían válidas."* |

## Los 4 datos pendientes → RESUELTOS (verbatim)

1. **kWp por arreglo:** *"Sería 355Wp x 4 = 1420Wp cada [a]rreglo. Sin considerar factor de
   bifacialidad; esto lo veríamos luego en un análisis avanzado."* → **1420 Wp/arreglo, 2840 Wp total**.
2. **Inclinación y orientación** (Norte = 0°, positivo en sentido horario): *"Inclinado:
   Inclinación de 20°, orientación 150°... Vertical: Inclinación 90°, orientación 50°;
   considerando la cara [...] apunta al norte."*
3. **Correspondencia de strings** (resaltados sobre "PV1 = arreglo 1" → *Inclinado* y
   "PV2 = arreglo 2" → *Vertical*): **PV1 = arreglo 1 = Inclinado · PV2 = arreglo 2 = Vertical**.
4. **Constante de calibración de la celda:** ver P11 — *"No se ha hecho ajuste."*

Detalle de la geometría física en [[geometria-sistema]]. Decisiones accionables derivadas y qué
decisiones previas quedan superadas: [[decisiones]]. Bloqueantes que esto cierra: [[bloqueantes]].
