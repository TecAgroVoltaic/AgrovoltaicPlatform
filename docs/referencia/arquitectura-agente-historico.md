# Arquitectura del agente Histórico

**Estado:** propuesta de diseño, 2026-08-24. Nada de esto está construido todavía salvo la
capa determinista de calidad, que existe suelta en `agente-historico/` y hay que absorber.

**Para qué este documento:** el Agente Histórico se construyó sin diseño previo y el resultado no
es un agente, es un script con endpoints. Este documento define qué es el Histórico antes de
escribir código, para que se pueda discutir la arquitectura y no el diff.

---

## 1. Qué es

**El agente que responde qué pasó.** Dos preguntas, no una:

- **¿Sirve el dato?** completitud, validez, duplicados, y cómo estuvo el cielo.
- **¿Qué pasó?** energía generada, performance ratio, irradiancia, temperatura, tendencias.

Su par es el **Predictivo** (`agente-predictivo`), que responde qué va a pasar. Entre los dos
cubren pasado y futuro, y son **los dos únicos agentes**. El Agente Histórico queda absorbido:
sus 8 herramientas se mudan acá, que es su dominio natural.

### Qué NO es

- **No es un dashboard.** No dibuja pantallas; devuelve datos que la consola dibuja.
- **No decide con el LLM.** El modelo orquesta y redacta. Ningún número sale de él.
- **No detecta al vuelo.** La detección es un barrido por lotes (sección 6). Las herramientas
  leen el store de hallazgos, no lo recalculan.

---

## 2. La idea central: la calidad condiciona el análisis

Esto es lo que hace que el Histórico sea más que "el Agente Histórico con tres funciones nuevas".

Hoy `energia_por_arreglo` responde *"PV1 generó 47.300 Wh en enero"* sin decir que 15 de esos
31 días son inservibles. El número es correcto y la respuesta es engañosa.

**Toda herramienta de análisis que agregue sobre un período devuelve, en el mismo payload, un
bloque `confianza`:**

```json
{
  "energia_pv1_wh": 47300,
  "confianza": {
    "dias_en_rango": 31,
    "dias_con_datos": 22,
    "dias_utilizables": 16,
    "cobertura": 0.52,
    "advertencia": "la mitad del período no tiene datos utilizables"
  }
}
```

El agente **no puede** reportar el número sin ver su fiabilidad, porque viene pegado. No
depende de que el prompt se lo recuerde.

Es el mismo principio que ya usa el Predictivo con sus modos, y conviene citarlo textual
porque es la regla de diseño de la casa:

> *"Restringir el juego es la única garantía real: un prompt se puede ignorar, una herramienta
> que no está en la lista no se puede llamar."*
> — `agente-predictivo/src/predictivo/agent/agent.py`

Acá la traducción es: un dato de calidad que viaja dentro de la respuesta no se puede omitir.

---

## 3. El paquete

Un agente = un paquete = un servicio = un nombre. `agente-historico` se convierte en
`agente-historico` y absorbe la capa de calidad.

```
agente-historico/
  pyproject.toml                name = "historico"
  sql/001_calidad.sql           DDL del store de hallazgos
  src/historico/
    config.py                   DB, geometría del sitio, UMBRALES
    db.py                       pool (lectura + escritura de hallazgos)
    domain.py                   vocabulario: Fuente, Severidad, TipoHallazgo, Veredicto
    periodo.py                  parseo de rangos (heredado)
    calidad/                    ── capa determinista, sin LLM ──
      sol.py                    ventana solar por día (pvlib)
      barrido.py                el barrido: completitud, validez, duplicados
      cielo.py                  kt, índice de variabilidad, clasificación
      contexto.py               arma el bloque `confianza` de la sección 2
    tools/                      ── una herramienta por archivo, SCHEMA + run() ──
      energia.py  performance.py  irradiancia.py  temperatura.py
      tendencia.py  cobertura.py  catalogo.py  graficar.py
      calidad_periodo.py  hallazgos.py  cielo_periodo.py
    agent/
      agent.py                  lazo LLM (Haiku) + PERFIL de herramientas
      prompts.py
    arquitectura.py             DERIVA el mapa (sección 5)
    api.py                      transporte HTTP
    cli.py                      barrido | cielo | sol | reporte
```

`agente-historico/` desaparece. Sus cuatro módulos de dominio se mudan a `calidad/`.

---

## 4. Las herramientas

Once, en dos familias. Cada una en su archivo, con su `SCHEMA` y su `run()`, igual que hoy.

### Análisis: qué pasó (8, heredadas del Agente Histórico)

| Herramienta | Responde | `confianza` |
|---|---|:--:|
| `energia_por_arreglo` | Wh generados por arreglo en un período | sí |
| `performance_ratio` | PR por arreglo (adimensional, ~0-1) | sí |
| `irradiancia_resumen` | GHI media y máxima | sí |
| `temperatura_por_arreglo` | temperatura de PV1 y PV2 | sí |
| `tendencia` | evolución de una métrica en el tiempo | sí |
| `cobertura_datos` | rango disponible y conteos | no aplica |
| `catalogo_variables` | diccionario de variables medidas | no aplica |
| `graficar` | gráfico de tendencia para mostrar | sí |

Se mudan **tal cual**, con un solo cambio: las cinco que agregan sobre un período incorporan
el bloque `confianza`. Las dos que ya hablan de disponibilidad no lo necesitan.

### Calidad: sirve el dato (3, nuevas)

| Herramienta | Responde | Parámetros |
|---|---|---|
| `calidad_periodo` | veredicto agregado: cuántos días sirven, cuántos están degradados, cuántos no tienen datos, y los tres problemas más frecuentes | `desde`, `hasta`, `fuente?` |
| `hallazgos_calidad` | el detalle: qué está mal, en qué variable, qué día, cuántas lecturas | `desde`, `hasta`, `tipo?`, `severidad?`, `limite?` |
| `cielo_periodo` | kt medio, índice de variabilidad, reparto entre despejado/parcial/cubierto/variable, y qué fracción del techo de cielo despejado se alcanzó | `desde`, `hasta` |

Por qué tres y no una: son tres preguntas distintas (*¿me puedo fiar?*, *¿qué está roto?*,
*¿cómo estuvo el cielo?*) y una herramienta por pregunta es lo que permite que el LLM
componga. Es el mismo criterio de las 8 heredadas.

---

## 5. El lazo LLM y por qué un solo perfil

El LLM (Haiku) **solo orquesta**: entiende la pregunta, elige herramientas, encadena y
redacta. Los números salen de las herramientas.

**El Histórico tiene UN solo juego de herramientas, no modos.** Esto es deliberado y va contra
copiar al Predictivo:

Los `MODOS` del Predictivo (`medicion_visible` / `medicion_oculta`) existen por un motivo
concreto: al pronosticar hay que **esconderle al agente lo que midió el sensor**, o "predice"
sabiendo la respuesta. Es una garantía anti-trampa.

El Histórico mira el pasado. **No hay nada que esconder**: la medición es justamente el objeto
de estudio. Montarle dos modos sería copiar la forma sin la razón, y agregar un eje de
configuración que nadie puede explicar.

Su riesgo es otro: **reportar números sobre datos que no sirven**. Y la garantía estructural
contra eso no es un modo, es el bloque `confianza` de la sección 2.

---

## 6. Barrido por lotes contra herramientas

Distinción que ya existía en el Agente Histórico pero nunca se dijo, y es la que más confusión causó:

| | Qué hace | Cuándo corre | Escribe |
|---|---|---|---|
| **Barrido** (`cli.py`) | recorre día por día, detecta, guarda | por cron | `hallazgos_calidad`, `cielo_diario`, `ventana_solar` |
| **Herramientas** (`tools/`) | leen lo ya detectado y lo agregan | por pregunta | nada |

Por qué separado: recorrer los 274 días es caro, y el resultado **no depende de quién
pregunte ni cuándo**. Si la detección corriera dentro de una herramienta, cada pregunta la
repetiría y dos personas podrían obtener veredictos distintos del mismo día.

---

## 7. Endpoints

Espeja al Predictivo. Puerto **8010** (el que ya usa el Agente Histórico; el 8020 se apaga).

| Endpoint | Para qué |
|---|---|
| `GET /health` | vivo o no |
| `GET /arquitectura` | el mapa derivado, para que la consola lo dibuje |
| `POST /preguntar` | una pregunta, una respuesta con traza |
| `POST /chat` | conversación con historial |
| `POST /tool/<nombre>` | una herramienta suelta, sin LLM (para VisioneFlow y para depurar) |
| `GET /calidad/*`, `GET /cielo` | lecturas directas del store, para las vistas de la consola |
| `GET /uso` | tokens y costo |

---

## 8. `arquitectura.py`: el mapa se deriva, no se declara

La pieza que hace que la arquitectura sea legible desde afuera. Copia la regla del Predictivo:
los nombres de las herramientas, sus parámetros y sus rangos salen de los `input_schema`
reales, los mismos objetos que se le mandan al modelo. Si alguien agrega una herramienta, el
mapa cambia solo.

Con **una adición** sobre lo que hace el Predictivo: exponer también los **umbrales** de
`config.py`.

```
COBERTURA_MINIMA   0.80    debajo de esto el día se marca incompleto
DENSIDAD_MINIMA    0.90    faltan muestras dentro de la ventana grabada
KT_DESPEJADO       0.70    índice de cielo despejado para llamarlo despejado
KT_CUBIERTO        0.35
KT_IMPOSIBLE       1.20    por encima es físicamente imposible: dato malo, no nube
VI_VARIABLE        6.00    calibrado sobre esta serie, no tomado de la literatura
```

Estos números son **política discutible con el equipo**, no física. Que la consola pueda
mostrarlos junto a su justificación es lo que convierte "el agente dice que el día es malo"
en "el agente lo marca porque cubrió menos del 80 % de las horas de sol".

---

## 9. Migración

1. `git mv agente-historico agente-historico`; paquete `analizador` → `historico`.
2. Mover `agente-historico/src/comparador/{sol,calidad,cielo}.py` → `src/historico/calidad/`.
   `calidad.py` pasa a `barrido.py` (dice lo que hace).
3. Escribir `calidad/contexto.py` y enchufar el bloque `confianza` en las 5 tools que agregan.
4. Escribir las 3 tools de calidad sobre los módulos ya migrados.
5. Escribir `arquitectura.py`.
6. Borrar `agente-historico/`.
7. Consola: `/api/historico/*` y `/api/predictivo/*`; dos agentes en el selector.
8. `dev.sh` vuelve a levantar dos servicios, no tres.

Las variables de entorno pasan a `HISTORICO_*` y `PREDICTIVO_*`, leyendo los nombres viejos
como respaldo para no romper el `forecast.env` de la EC2 hasta que se actualice.

---

## 10. Decisiones abiertas

- **El flag `AGENTE_HISTORICO` deja de tener sentido.** Bloqueaba al Agente Histórico porque, en
  palabras de Hugo, funcionaría *"cuando ya tengamos una mejor arquitectura montada"*. El
  Histórico **es** esa arquitectura, así que el bloqueo se cae solo. Pero fue una decisión
  explícita de la reunión: hay que confirmarlo, no removerlo en silencio.
- **El contenedor `analizador-analizador-1` lleva 13 días corriendo en la EC2.** Al renombrar
  el paquete hay que redesplegarlo o apagarlo.
- **`graficar` devuelve datos para un gráfico.** Hay que revisar si su formato sigue calzando
  con lo que la consola dibuja hoy, o quedó atado a vistas del Agente Histórico que ya no existen.
- **Nombre de las vistas heredadas.** «Reconciliación» y «Rendimiento» eran del Agente Histórico.
  Hay que decidir si sobreviven como vistas del Histórico o se absorben en «Calidad de datos».
