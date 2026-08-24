# Comparador

Control de calidad **determinista** del histórico fotovoltaico de San Carlos, más la
caracterización estadística del cielo. Sin LLM: los números salen de acá y la narración
en lenguaje natural es una capa de arriba que se enchufa después, tal como decidió
`docs/memoria/proyecto/capa-agentes.md`.

Responde cuatro preguntas del equipo:

1. **¿Están todos los datos del día? ¿Son válidos? ¿Hay duplicados?** → `calidad.py`
2. **Alertas de inconsistencia** → la tabla `hallazgos_calidad` + `reporte.py`
3. **Criterios estadísticos de nubes respecto a la irradiancia** → `cielo.py`
4. Variables que afectan la irradiancia → pendiente, ver «Lo que falta»

## Uso

```bash
python -m comparador sol       # amanecer/atardecer por día (una vez, o al extender el rango)
python -m comparador barrido   # calidad por día y por sensor -> hallazgos_calidad
python -m comparador cielo     # kt + variabilidad por día    -> cielo_diario
python -m comparador reporte   # el informe legible
python -m comparador todo      # los cuatro, en orden
```

Sin `--desde/--hasta` usa todo el rango de la base. `--hasta` es **exclusivo**, como en el
resto del proyecto. Todo es idempotente: re-correr actualiza, no duplica.

Necesita `DATABASE_URL` (la Supabase PV) en `agente-comparador/.env` o en la raíz del repo.

## Las tres decisiones que no son obvias

**«Día completo» se mide contra las horas de sol, no contra 24 h.** El logger de San Carlos
solo graba de día: los días sanos cubren entre 11,5 y 12,7 horas. Medir contra 24 h daría un
50 % permanente que no dice nada. De ahí la tabla `ventana_solar`, calculada con pvlib.

**Dos métricas de completitud, no una.** La *cobertura* es cuánto de las horas de sol alcanzó
a grabar; la *densidad* es cuántas de las lecturas esperadas hay dentro de lo que sí grabó.
Un día puede tener cobertura 1,0 y densidad 0,4: grabó de punta a punta perdiendo la mitad de
las muestras. Con una sola métrica eso no se ve.

**La cadencia esperada se infiere de cada día.** El histórico tiene 33 cadencias distintas
(2 s en diciembre 2024, 1 min en mayo 2025, ~5 min desde noviembre 2025). Cualquier constante
mentiría.

## Sobre el índice de variabilidad

El VI está definido para un intervalo de muestreo **fijo**, y acá hay 33. Calculado sobre las
muestras crudas daba VI 4,2 con cadencia de 315 s y VI 23,8 con cadencia de 42 s *para el
mismo kt*: medía la cadencia del logger, no el cielo. Por eso se calcula sobre una rejilla
uniforme de 5 minutos, que es el régimen dominante (196 de 274 días). Después del arreglo los
tres regímenes dan 4,4 / 4,2 / 3,5, que ya es comparable.

El umbral `VI_VARIABLE` está **calibrado sobre esta serie**, no tomado de la literatura: con
el 3,0 que suele citarse (para datos de 1 minuto) el 77 % de los días caía en «variable», o
sea que la etiqueta no distinguía nada.

## Los tres falsos positivos que se corrigieron

Una serie sin variación puede ser tres cosas, y llamarlas a todas «sensor plano» fue el primer
error del detector:

| Valor constante | Qué es | Tipo |
|---|---|---|
| 85 | DS18B20 desconectado | `saturado_85` (no se reporta dos veces) |
| 0 | el inversor no generó ese día | `constante_en_cero`, aviso |
| otro | ahora sí, sensor trabado | `sensor_plano`, grave |

Y una columna con **todas** las filas en NULL no es «faltan datos»: es que la columna no vino
en el CSV de ese día. Es el problema de los 13 esquemas y se arregla en el mapeo del ETL, así
que lleva su propio nombre (`columna_ausente`).

En el histórico actual `sensor_plano` no aparece ni una vez: todas las series planas eran 85
o cero.

## kt > 1,2 es un detector de datos malos, no de nubes

Es más energía que la que manda el sol con cielo despejado: físicamente imposible. No depende
de ningún umbral inventado, sale de la física, y por eso es el detector de calidad más sólido
que tenemos. Aparece en 82 de los 228 días caracterizados, lo cual dice algo incómodo sobre la
calibración de la irradiancia.

## Lo que falta

- **Punto 4: qué variables afectan la irradiancia.** Los 4 dispositivos `fliwer` de Joshua
  (temperatura, humedad de aire, lux, humedad de suelo, EC) solapan 1.938 de las 3.302 horas
  con radiación. Es el estudio que decide qué covariables entran al monitoreo diario.
- **Programarlo.** Hoy se corre a mano. Cuando la ingesta de San Carlos se restaure, va a
  cron/systemd como el ETL del pronóstico.
- **La capa de lenguaje natural.** El store de hallazgos ya está listo para que un LLM lo
  narre; deliberadamente no está en el camino de detección.
